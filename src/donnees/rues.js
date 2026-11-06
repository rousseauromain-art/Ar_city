// @ts-check
/**
 * Rues autour de la position (cap sur l'axe de la rue, calage/rue.js) : couches `transportation` (géométrie, classe) et `transportation_name` (nom) des tuiles OpenFreeMap de zoom 14, sur 300 m.
 * Repli : Overpass `way[highway]` (géométrie complète, `out geom`) si OpenFreeMap est injoignable. Mémoire durable de l'appareil : 30 jours, clé `ru/z/x/y`.
 * Entrées : position, rayon, réseau (injecté), cache, OpenFreeMap, Overpass. Sortie : rues { nom, classe, points: [{lat, lon}, …] }, raccordées d'une tuile à l'autre.
 * Dépend de : donnees/mvt.js, noyau/geo.js.
 */
import { decoderTuileMVT, lignesDeFeature, etiquettesDeFeature, localVersLonLat, tuilesDeBoite } from './mvt.js';
import { distanceEtCap } from '../noyau/geo.js';

/** @typedef {{lat: number, lon: number}} Point */
/** @typedef {{nom: string, classe: string, points: Point[]}} Rue */

export const RUES_Z = 14, RUES_RAYON_M = 300, RUES_MEMOIRE_MS = 30 * 86400000;
/** Classes de voies où l'on peut viser l'axe (les chemins, voies ferrées et parkings sont écartés). */
const CLASSES_ROUTIERES = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'pedestrian', 'busway', 'residential', 'unclassified', 'living_street']);
/** Distance (m) sous laquelle une ligne nommée « porte » le nom d'une route. */
const RAYON_NOM_M = 8;
/** Deux extrémités plus proches (m) sont la même : la rue continue dans la tuile voisine. */
const RAYON_RACCORD_M = 2;

/** Distance approchée (m) entre deux points proches. @param {Point} a @param {Point} b */
const dist = (a, b) => distanceEtCap(a, b).distKm * 1000;

/** Distance (m) d'un point à une polyligne (projection locale plane). @param {Point} p @param {Point[]} ligne */
export function distanceALigne(p, ligne) {
  const kLon = Math.cos((p.lat * Math.PI) / 180), X = (/** @type {Point} */ q) => (q.lon - p.lon) * 111320 * kLon, Y = (/** @type {Point} */ q) => (q.lat - p.lat) * 111320;
  let m = Infinity;
  for (let i = 0; i + 1 < ligne.length; i++) {
    const ax = X(ligne[i]), ay = Y(ligne[i]), bx = X(ligne[i + 1]), by = Y(ligne[i + 1]), dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
    m = Math.min(m, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return m;
}

/**
 * Lignes d'une couche d'une tuile, en longitude et latitude, avec leurs étiquettes.
 * @param {ReturnType<typeof decoderTuileMVT>[string] | undefined} couche @param {{z: number, x: number, y: number}} t @returns {{points: Point[], tags: Record<string, any>}[]}
 */
function lignesDeCouche(couche, t) {
  if (!couche) return [];
  const out = [];
  for (const f of couche.features) {
    const tags = etiquettesDeFeature(f, couche);
    for (const l of lignesDeFeature(f)) out.push({ points: l.map(([x, y]) => localVersLonLat(t.z, t.x, t.y, x, y, couche.extent)), tags });
  }
  return out;
}

/**
 * Rues d'une tuile : routes de `transportation` (classes routières), nom pris sur la ligne de `transportation_name` qui les recouvre (à 8 m près).
 * @param {Uint8Array} buf @param {{z: number, x: number, y: number}} t @returns {Rue[]}
 */
export function ruesDeTuile(buf, t) {
  const c = decoderTuileMVT(buf, ['transportation', 'transportation_name']);
  const routes = lignesDeCouche(c.transportation, t).filter((l) => CLASSES_ROUTIERES.has(l.tags.class)), noms = lignesDeCouche(c.transportation_name, t).filter((l) => l.tags.name || l.tags['name:latin']);
  return routes.map((r) => {
    const milieu = r.points[Math.floor(r.points.length / 2)], porteur = noms.find((n) => distanceALigne(milieu, n.points) <= RAYON_NOM_M);
    return { nom: porteur ? String(porteur.tags['name:fr'] || porteur.tags.name || porteur.tags['name:latin']) : '', classe: String(r.tags.class), points: r.points };
  });
}

/** Colle les tronçons de même nom (ou sans nom) dont les extrémités se touchent : une rue coupée par une limite de tuile redevient une seule ligne. @param {Rue[]} rues @returns {Rue[]} */
export function raccorderRues(rues) {
  const liste = rues.map((r) => ({ ...r, points: r.points.slice() }));
  let change = true;
  while (change) {
    change = false;
    for (let i = 0; i < liste.length && !change; i++) for (let j = i + 1; j < liste.length && !change; j++) change = recoller(liste, i, j);
  }
  return liste;
}

/** Recolle j sur i si leurs extrémités se touchent (même nom) ; renvoie vrai si c'est fait. @param {Rue[]} liste @param {number} i @param {number} j */
function recoller(liste, i, j) {
  const a = liste[i], b = liste[j];
  if (a.nom !== b.nom || a.classe !== b.classe) return false;
  const fa = a.points[0], la = a.points[a.points.length - 1], fb = b.points[0], lb = b.points[b.points.length - 1];
  /** @type {Point[] | null} */
  let pts = null;
  if (dist(la, fb) <= RAYON_RACCORD_M) pts = [...a.points, ...b.points.slice(1)];
  else if (dist(lb, fa) <= RAYON_RACCORD_M) pts = [...b.points, ...a.points.slice(1)];
  else if (dist(la, lb) <= RAYON_RACCORD_M) pts = [...a.points, ...b.points.slice(0, -1).reverse()];
  else if (dist(fa, fb) <= RAYON_RACCORD_M) pts = [...a.points.slice(1).reverse(), ...b.points];
  if (!pts) return false;
  a.points = pts; liste.splice(j, 1);
  return true;
}

/** Garde les rues qui passent à `rayonM` ou moins de la position. @param {Rue[]} rues @param {Point} pos @param {number} rayonM */
export const ruesProches = (rues, pos, rayonM) => rues.filter((r) => distanceALigne(pos, r.points) <= rayonM);

/** Classes OSM des voies où l'on peut viser l'axe. */
const HIGHWAY_RE = '^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|pedestrian)$';
/** Requête Overpass des voies autour d'un point, géométrie complète. @param {Point} pos @param {number} rayonM */
export const requeteRues = (pos, rayonM) => `[out:json][timeout:25];way(around:${rayonM},${pos.lat.toFixed(5)},${pos.lon.toFixed(5)})["highway"~"${HIGHWAY_RE}"];out geom;`;

/** Analyse de la réponse Overpass (`out geom`) : rues { nom, classe, points }. @param {any} j @returns {Rue[]} */
export function lireRuesOverpass(j) {
  if (!j || !Array.isArray(j.elements)) throw new Error('réponse Overpass sans éléments');
  return j.elements.filter((/** @type {any} */ e) => e.type === 'way' && Array.isArray(e.geometry) && e.geometry.length > 1)
    .map((/** @type {any} */ e) => ({ nom: String((e.tags && e.tags.name) || ''), classe: String((e.tags && e.tags.highway) || ''), points: e.geometry.map((/** @type {any} */ g) => ({ lat: g.lat, lon: g.lon })) }));
}

/**
 * @param {{
 *   reseau: {requeter: (url: string, o?: any) => Promise<unknown>},
 *   cache: ReturnType<typeof import('./cache-donnees.js').creerCacheDonnees>,
 *   openfreemap: {gabaritTuiles: () => Promise<string>},
 *   overpass?: {interroger: (q: string, ms: number, analyseur?: (j: any) => any) => Promise<any>},
 *   journal?: {avert: (m: string, msg: string, d?: unknown) => unknown},
 * }} deps
 */
export function creerSourceRues({ reseau, cache, openfreemap, overpass, journal }) {
  /** Tuiles de zoom 14 qui couvrent le rayon. @param {Point} pos @param {number} rayonM */
  const tuilesDe = (pos, rayonM) => {
    const dLat = rayonM / 111320, dLon = rayonM / (111320 * Math.max(0.2, Math.cos((pos.lat * Math.PI) / 180)));
    return tuilesDeBoite({ la1: pos.lat - dLat, la2: pos.lat + dLat, lo1: pos.lon - dLon, lo2: pos.lon + dLon }, RUES_Z);
  };
  /** @param {Point} pos @param {number} rayonM @param {boolean | undefined} contourner @returns {Promise<{rues: Rue[], tuiles: number}>} */
  async function parTuiles(pos, rayonM, contourner) {
    const tpl = await openfreemap.gabaritTuiles(), tuiles = tuilesDe(pos, rayonM), rues = /** @type {Rue[]} */ ([]);
    for (const t of tuiles) {
      const r = await cache.obtenir('ru', `ru/${t.z}/${t.x}/${t.y}`, { ttlMs: RUES_MEMOIRE_MS, binaire: true, contourner, elaguer: ['ru/', 200],
        charger: async () => /** @type {Uint8Array} */ (await reseau.requeter(tpl.replace('{z}', String(t.z)).replace('{x}', String(t.x)).replace('{y}', String(t.y)), { analyse: 'octets', delaiMs: 8000 })) });
      rues.push(...ruesDeTuile(r.donnees, t));
    }
    return { rues, tuiles: tuiles.length };
  }
  return {
    /**
     * @param {{pos: Point, rayonM?: number, contourner?: boolean}} p
     * @returns {Promise<{rues: Rue[], source: 'openfreemap' | 'overpass', tuiles: number}>}
     */
    async charger({ pos, rayonM = RUES_RAYON_M, contourner }) {
      try { const { rues, tuiles } = await parTuiles(pos, rayonM, contourner); return { rues: ruesProches(raccorderRues(rues), pos, rayonM), source: 'openfreemap', tuiles }; }
      catch (e) {
        if (!overpass) throw e;
        if (journal) journal.avert('rues', 'OpenFreeMap indisponible : repli sur Overpass', e);
        const rues = /** @type {Rue[]} */ (await overpass.interroger(requeteRues(pos, rayonM), 20000, lireRuesOverpass));
        return { rues: ruesProches(raccorderRues(rues), pos, rayonM), source: 'overpass', tuiles: 0 };
      }
    },
    /** Tuiles de zoom 14 du rayon (téléchargement de zone). @param {Point} pos @param {number} [rayonM] */
    tuilesDe: (pos, rayonM = RUES_RAYON_M) => tuilesDe(pos, rayonM),
    /** Tuile par tuile, pour le téléchargement de zone. @param {{z: number, x: number, y: number}} t @param {boolean} [contourner] */
    async garderTuile(t, contourner) {
      const tpl = await openfreemap.gabaritTuiles();
      await cache.obtenir('ru', `ru/${t.z}/${t.x}/${t.y}`, { ttlMs: RUES_MEMOIRE_MS, binaire: true, contourner, elaguer: ['ru/', 200],
        charger: async () => /** @type {Uint8Array} */ (await reseau.requeter(tpl.replace('{z}', String(t.z)).replace('{x}', String(t.x)).replace('{y}', String(t.y)), { analyse: 'octets', delaiMs: 8000 })) });
    },
  };
}
