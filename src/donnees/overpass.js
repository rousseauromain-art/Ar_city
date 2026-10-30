// @ts-check
/**
 * Overpass (OpenStreetMap) : requêtes de lieux et de repères, lecture des réponses, course échelonnée entre miroirs publics.
 * Entrées : requête Overpass, réseau (donnees/reseau.js). Sortie : éléments { name, lat, lon, kind, pop, ele }.
 * Course : le 1er miroir part tout de suite ; sans réponse après 5 s (ou dès qu'il échoue) le suivant part aussi ; le premier qui répond gagne,
 * les autres sont annulés. Jamais deux requêtes simultanées vers le MÊME serveur (c'est ce qui déclenche le 429). Reprend la v1.
 */
import { CATEGORIES_REPERES, TYPES_LIEUX } from './categories-reperes.js';

/** @typedef {{name: string, lat: number, lon: number, kind: string, pop: number, ele: number | null, farPeak?: boolean}} Lieu */
/** @typedef {{requeter: (url: string, o?: {methode?: 'GET'|'POST', corps?: string, entetes?: Record<string, string>, analyse?: 'json'|'texte'|'octets', delaiMs?: number, signal?: AbortSignal}) => Promise<unknown>}} ReseauRequeter */

/** Miroirs publics mondiaux (5 serveurs indépendants). */
export const MIROIRS_OVERPASS = Object.freeze([
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]);
/** Délai avant de solliciter le miroir suivant (ms). */
const ECART_MIROIRS_MS = 5000;

/** Type d'un élément OSM d'après ses étiquettes (v1 : `kindOf`). @param {Record<string, string>} t */
export function typeDepuisEtiquettes(t) {
  if (t.place && TYPES_LIEUX.has(t.place)) return t.place;
  if (t.man_made === 'lighthouse' || /^light/.test(t['seamark:type'] || '')) return 'lighthouse';
  if (t.natural === 'cape') return 'cape';
  if (t.natural === 'peak') return 'peak';
  if (/^(island|islet)$/.test(t.place || '')) return 'island';
  if (/^(rock|stone|arch)$/.test(t.natural || '')) return 'rock';
  if (t.natural === 'beach') return 'beach';
  if (t.tourism) return 'view';
  if (t.historic || t.man_made === 'windmill') return 'heritage';
  return 'poi';
}

/**
 * Éléments nommés d'une réponse Overpass (v1 : `parseOverpass`) ; doublons de nom et de position écartés.
 * @param {{elements: any[]}} j
 * @returns {Lieu[]}
 */
export function lireReponseOverpass(j) {
  const seen = new Set(), got = [];
  for (const n of j.elements) {
    const t = n.tags;
    if (!t) continue;
    const name = t['name:fr'] || t.name;
    if (!name) continue;
    const lat = n.lat ?? (n.center && n.center.lat), lon = n.lon ?? (n.center && n.center.lon);
    if (lat === undefined || lat === null || lon === undefined || lon === null) continue;
    const key = name + '@' + lat.toFixed(4) + ',' + lon.toFixed(4);
    if (seen.has(key)) continue;
    seen.add(key);
    const ev = parseFloat(t.ele);
    got.push({ name, lat, lon, kind: typeDepuisEtiquettes(t), pop: +(t.population || 0), ele: isFinite(ev) ? ev : null });
  }
  return got;
}

/**
 * Clauses de la requête de lieux : villes, villages (30 km), hameaux (12 km) et catégories de repères cochées (v1 : `clausesFor`).
 * @param {{lat: number, lon: number}} pos @param {number} rayonM @param {boolean} hameaux @param {Record<string, boolean>} reperes
 * @param {(km: number) => number} plafondM portée en m d'une catégorie (≤ rayon)
 */
export function clausesLieux(pos, rayonM, hameaux, reperes, plafondM) {
  const C = `${pos.lat},${pos.lon}`, cap = (/** @type {number} */ km) => Math.min(rayonM, km * 1000);
  const cl = [`node["place"~"^(city|town)$"](around:${rayonM},${C})`, `node["place"="village"](around:${cap(30)},${C})`];
  if (hameaux) cl.push(`node["place"~"^(hamlet|isolated_dwelling)$"](around:${cap(12)},${C})`);
  for (const k in CATEGORIES_REPERES) if (reperes[k]) for (const q of CATEGORIES_REPERES[k].q) {
    const [sel, m] = Array.isArray(q) ? q : [q, CATEGORIES_REPERES[k].maxKm];
    cl.push(`${sel}(around:${plafondM(m)},${C})`);
  }
  return cl;
}

/** Requête Overpass complète à partir des clauses. @param {string[]} clauses @param {number} [delaiServeurS] */
export const requeteOverpass = (clauses, delaiServeurS = 25) => `[out:json][timeout:${delaiServeurS}];(${clauses.join(';')};);out center;`;

/**
 * Exécute une requête Overpass par course échelonnée entre miroirs. Les requêtes sont mises en file : une à la fois.
 * @param {{reseau: ReseauRequeter, minuteur?: {setTimeout: (f: () => void, ms: number) => any, clearTimeout: (id: any) => void}, miroirs?: readonly string[], ecartMs?: number,
 *   journal?: {avert: (m: string, msg: string, d?: unknown) => unknown}}} deps
 */
export function creerOverpass({ reseau, minuteur = { setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (id) => clearTimeout(id) }, miroirs = MIROIRS_OVERPASS, ecartMs = ECART_MIROIRS_MS, journal }) {
  let file = Promise.resolve();
  let dernierMiroir = '';
  const nomMiroir = (/** @type {string} */ ep) => { try { return new URL(ep).hostname; } catch { return ep; } };

  /** @param {string} q @param {number} ms @param {(j: any) => any} analyseur */
  function course(q, ms, analyseur) {
    return new Promise((resolve, reject) => {
      /** @type {AbortController[]} */
      const ctrls = [];
      /** @type {string[]} */
      const errs = [];
      let reglee = false, lances = 0, termines = 0;
      /** @type {any} */
      let minut = null;
      const corps = 'data=' + encodeURIComponent(q);
      const lancer = () => {
        if (reglee || lances >= miroirs.length) return;
        const ep = miroirs[lances++], ctrl = new AbortController();
        ctrls.push(ctrl);
        if (minut !== null) minuteur.clearTimeout(minut);
        minut = minuteur.setTimeout(lancer, Math.max(ecartMs, ms / 4)); // requête lourde : on laisse plus de temps avant de solliciter un autre miroir
        reseau.requeter(ep, { methode: 'POST', corps, entetes: { 'Content-Type': 'application/x-www-form-urlencoded' }, analyse: 'json', delaiMs: ms, signal: ctrl.signal })
          .then((j) => analyseur(j))
          .then((out) => {
            if (reglee) return;
            reglee = true;
            if (minut !== null) minuteur.clearTimeout(minut);
            ctrls.forEach((c) => { if (c !== ctrl) c.abort(); });
            dernierMiroir = nomMiroir(ep);
            resolve(out);
          })
          .catch((e) => {
            termines++;
            if (reglee) return;
            errs.push(nomMiroir(ep) + ' : ' + (e instanceof Error ? e.message : String(e)));
            if (journal) journal.avert('overpass', `${nomMiroir(ep)} en échec`, e);
            if (lances < miroirs.length) lancer(); // échec franc : on passe au suivant sans attendre
            else if (termines >= miroirs.length) { reglee = true; if (minut !== null) minuteur.clearTimeout(minut); const err = new Error(errs.join(' | ')); err.name = 'OverpassAllFailed'; reject(err); }
          });
      };
      lancer();
    });
  }

  return {
    /**
     * @param {string} q requête Overpass @param {number} ms délai par miroir
     * @param {(j: any) => any} [analyseur] défaut : lireReponseOverpass (lieux nommés)
     * @returns {Promise<any>}
     */
    interroger(q, ms, analyseur = lireReponseOverpass) {
      const executer = () => course(q, ms, analyseur);
      const p = file.then(executer, executer); // toujours exécuter, même si la requête précédente a échoué
      file = p.then(() => {}, () => {});
      return p;
    },
    /** Dernier miroir ayant répondu (diagnostic). */
    dernierMiroir: () => dernierMiroir,
  };
}
