// @ts-check
/**
 * Repères hauts OpenStreetMap : tours, clochers, tours de télécom, châteaux d'eau, cheminées, mâts (tuiles OSM communes avec les monuments) et immeubles hauts
 * (requête lourde séparée, au mieux : son échec ne fait pas perdre les tours). Un repère n'a souvent pas de nom : on en fabrique un lisible (type, exploitant, hauteur).
 * Entrées : position, rayon, source OSM par tuiles, Overpass, mémoire. Sortie : liste de repères au format de la v1 (`buildingSites`).
 * Reprend `parseBuildings`, `kindOfBuilding`, `bldMerge`, `pollBuildings` de la v1. Dépend de : donnees/{osm-tuiles,overpass,cache-donnees}.js, noyau/geo.js.
 */
import { distanceEtCap } from '../noyau/geo.js';

/** @typedef {'tour' | 'clocher' | 'tour_telecom' | 'chateau_eau' | 'cheminee' | 'mat' | 'immeuble'} TypeRepere */
/** @typedef {{name: string, lat: number, lon: number, kind: TypeRepere, height_m: number | null, named: boolean, id: string | null, ess: boolean}} Repere */

/** Hauteur supposée (m) d'un repère sans hauteur connue. */
export const HAUTEUR_DEFAUT = Object.freeze(/** @type {Record<string, number>} */ ({ tour: 30, clocher: 40, tour_telecom: 40, chateau_eau: 30, cheminee: 40, mat: 30, immeuble: 30 }));
const LIBELLE_REPERE = Object.freeze(/** @type {Record<string, string>} */ ({ tour: 'Tour', clocher: 'Clocher', tour_telecom: 'Tour', chateau_eau: "Château d'eau", cheminee: 'Cheminée', mat: 'Mât', immeuble: 'Immeuble' }));
/** Icône d'un repère dans la bande des équipements. */
export const ICONE_REPERE = Object.freeze(/** @type {Record<string, string>} */ ({ tour: 'mat', tour_telecom: 'pylone', clocher: 'clocher', chateau_eau: 'chateau_eau', cheminee: 'colonne', mat: 'mat', immeuble: 'toit' }));
/** Mémoire des immeubles hauts : 3 jours (6 h si la liste est partielle). Rayon de la requête lourde : 5 km au plus. */
const MEMOIRE_IMMEUBLES_MS = 3 * 864e5;
const IMMEUBLES_KM_MAX = 5;

/** Type d'un objet OSM (v1 : `kindOfBuilding`). @param {Record<string, string | undefined>} t @returns {TypeRepere} */
export function typeRepere(t) {
  if (t.man_made === 'tower') {
    if (/^(church|bell_tower)$/.test(t['tower:type'] || '')) return 'clocher';
    if (t['tower:type'] === 'communication') return 'tour_telecom';
    return 'tour';
  }
  if (t.man_made === 'communications_tower') return 'tour_telecom'; // tag courant des grandes tours TV/radio (tours TDF)
  if (t.man_made === 'water_tower') return 'chateau_eau';
  if (t.man_made === 'chimney') return 'cheminee';
  if (t.man_made === 'mast') return 'mat';
  return 'immeuble'; // « building » élevé (seule condition restante de la requête)
}

/**
 * Objets OSM → repères (v1 : `parseBuildings`). Contrairement aux lieux, un repère est souvent SANS nom : on synthétise « Tour TDF (60 m) » plutôt que de l'écarter.
 * En Essentiel, un immeuble anonyme de moins de 40 m ne se distingue pas en ville : il reste pour Tout voir (`ess` faux).
 * @param {{elements?: any[]}} j @returns {Repere[]}
 */
export function analyserReperes(j) {
  const vus = new Set(), got = /** @type {Repere[]} */ ([]);
  for (const n of (j.elements || [])) {
    const t = n.tags;
    if (!t) continue;
    const lat = n.lat ?? (n.center && n.center.lat), lon = n.lon ?? (n.center && n.center.lon);
    if (lat === undefined || lat === null || lon === undefined || lon === null) continue;
    const kind = typeRepere(t), hv = parseFloat(t.height), lv = parseFloat(t['building:levels']);
    const height_m = isFinite(hv) ? hv : (isFinite(lv) ? lv * 3 : null);
    const opr = t.operator || t.owner || '', name = t['name:fr'] || t.name || (LIBELLE_REPERE[kind] + (opr && opr.length <= 24 ? ' ' + opr : '') + (height_m ? ` (${Math.round(height_m)} m)` : ''));
    const cle = name + '@' + lat.toFixed(4) + ',' + lon.toFixed(4);
    if (vus.has(cle)) continue;
    vus.add(cle);
    const named = !!(t['name:fr'] || t.name);
    got.push({ name, lat, lon, kind, height_m, named, id: n.type && n.id !== null && n.id !== undefined ? n.type + '/' + n.id : null, ess: !(kind === 'immeuble' && !named && !(/** @type {number} */ (height_m) >= 40)) });
  }
  return got;
}

/** Union dédoublonnée (nom + position à 10 m) de deux listes (v1 : `bldMerge`). @param {Repere[]} a @param {Repere[]} b */
export function fusionnerReperes(a, b) {
  const vus = new Set(), out = /** @type {Repere[]} */ ([]);
  for (const x of a.concat(b)) { const k = x.name + '@' + x.lat.toFixed(4) + ',' + x.lon.toFixed(4); if (!vus.has(k)) { vus.add(k); out.push(x); } }
  return out;
}

/** Requête Overpass des immeubles hauts (> 30 m ou > 9 étages) à `rM` mètres de la position. @param {{lat: number, lon: number}} p @param {number} rM */
export const requeteImmeubles = (p, rM) => `[out:json][timeout:20];(`
  + `nwr["building"]["height"](if:t["height"]>30)(around:${rM},${p.lat.toFixed(4)},${p.lon.toFixed(4)});`
  + `nwr["building"]["building:levels"](if:t["building:levels"]>9)(around:${rM},${p.lat.toFixed(4)},${p.lon.toFixed(4)});`
  + `);out center qt;`;

/**
 * @param {{
 *   osm: ReturnType<typeof import('./osm-tuiles.js').creerSourceOsm>,
 *   overpass: {interroger: (q: string, ms: number, analyseur?: (j: any) => any) => Promise<any>},
 *   cache: ReturnType<typeof import('./cache-donnees.js').creerCacheDonnees>,
 *   journal?: {avert: (m: string, msg: string, d?: unknown) => unknown},
 * }} deps
 */
export function creerSourceReperes({ osm, overpass, cache, journal }) {
  return {
    /**
     * Repères hauts à moins de `rayonKm`. `quandPartiel(liste)` est appelée après chaque tuile (affichage au fur et à mesure). `partiel` : des tuiles ou les immeubles manquent ;
     * `secours` : de la mémoire périmée a servi. Lève une erreur seulement si AUCUNE tuile n'a répondu.
     * @param {{pos: {lat: number, lon: number}, rayonKm: number, quandPartiel?: (liste: Repere[]) => void}} e
     * @returns {Promise<{liste: Repere[], partiel: boolean, secours: boolean, sansImmeubles: boolean, tuiles: number, echecs: number, enMemoire: number, reseau: number, erreur: unknown}>}
     */
    async charger({ pos, rayonKm, quandPartiel }) {
      const legers = (/** @type {import('./monuments-osm.js').ObjetOsm[]} */ els) => analyserReperes({ elements: els.filter((e) => distanceEtCap(pos, e).distKm <= rayonKm) });
      const r = await osm.charger(pos, rayonKm, rayonKm, quandPartiel ? (els) => quandPartiel(legers(els)) : undefined);
      if (r.echecs && !r.objets.length) throw (r.erreur || new Error('aucune tuile'));
      const light = legers(r.objets);
      /** @type {Repere[]} */
      let lourds = [];
      let sansImmeubles = false;
      const rM = Math.round(Math.min(rayonKm, IMMEUBLES_KM_MAX) * 1000), C = `${pos.lat.toFixed(2)},${pos.lon.toFixed(2)}`;
      try {
        const h = await cache.obtenir('bld', `bldh/${C}/${rM}`, { ttlMs: MEMOIRE_IMMEUBLES_MS, elaguer: ['bldh/', 40], charger: () => overpass.interroger(requeteImmeubles(pos, rM), 15000, analyserReperes) });
        lourds = h.donnees;
      } catch (e) { sansImmeubles = true; if (journal) journal.avert('reperes', 'immeubles hauts indisponibles (tours et mâts conservés)', e); }
      return { liste: fusionnerReperes(light, lourds), partiel: r.echecs > 0 || sansImmeubles, secours: r.secours > 0, sansImmeubles, tuiles: r.tuiles, echecs: r.echecs, enMemoire: r.enMemoire, reseau: r.reseau, erreur: r.erreur };
    },
  };
}
