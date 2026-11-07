// @ts-check
/**
 * Trafic en direct, partie PURE : boîte de recherche envoyée au relais, extrapolation d'une position au cap et à la vitesse, lecture des réponses OpenSky (avions) et
 * du relais AIS (navires), durée de garde d'un navire, liste des mobiles proches à un instant donné, catégorie et couleur d'un navire. Aucun état : l'appelant garde les
 * listes. Reprend `bbox`, `boxQuery`, `dr`, `shipKeepMs`, `mobiles` et `shipStyle` de la v1. Entrées : réponses brutes, position, instant (ms). Dépend de : noyau/geo.js.
 */
import { RAD } from '../noyau/constantes.js';
import { distanceEtCap } from '../noyau/geo.js';

/**
 * @typedef {object} Avion
 * @property {string} name indicatif (sinon adresse hex) @property {string} id @property {number} lat @property {number} lon @property {number} alt m @property {number} trk cap ° @property {number} vel m/s @property {number} vr m/s @property {number} t instant du relevé (ms)
 * @typedef {object} Navire
 * @property {string} name @property {string} mmsi @property {number | null} type code AIS « type de navire et cargaison » @property {number} lat @property {number} lon @property {number} trk cap ° @property {number} vel m/s @property {number} alt @property {number} vr @property {number} t
 * @typedef {{name: string, kind: 'plane' | 'ship', id?: string, mmsi?: string, type?: number | null, lat: number, lon: number, t: number, dist: number, brg: number, alt: number, trk: number, vel: number}} Mobile
 */

/** Mobiles gardés (les plus proches), côté maximal de la boîte (le relais refuse au-delà de 3,5°), extrapolation plafonnée à 10 min. */
export const MOBILES_MAX = 60;
const COTE_BOITE_MAX_DEG = 1.7;
const EXTRAPOLATION_MAX_S = 600;
/** Un navire de moins de 0,26 m/s (0,5 nœud) est considéré à l'arrêt : rond au lieu d'une flèche. */
export const NAVIRE_ARRET_MS = 0.26;
const NOEUD_EN_MS = 0.5144;

/** Boîte autour de la position, de `km` de demi-côté (v1 : `bbox`). @param {{lat: number, lon: number}} pos @param {number} km */
export function boiteDeRecherche(pos, km) {
  const dLat = km / 111, dLon = km / (111 * Math.max(0.2, Math.cos(pos.lat * RAD)));
  return { la1: pos.lat - dLat, la2: pos.lat + dLat, lo1: pos.lon - dLon, lo2: pos.lon + dLon };
}
/** Paramètres de requête d'une boîte ; côtés limités à 3,4° (v1 : `boxQuery`). @param {{la1: number, la2: number, lo1: number, lo2: number}} b */
export function requeteBoite(b) {
  const c = (/** @type {number} */ lo, /** @type {number} */ hi) => { const m = (lo + hi) / 2, h = Math.min((hi - lo) / 2, COTE_BOITE_MAX_DEG); return [m - h, m + h]; };
  const [la1, la2] = c(b.la1, b.la2), [lo1, lo2] = c(b.lo1, b.lo2);
  return `lamin=${la1.toFixed(3)}&lomin=${lo1.toFixed(3)}&lamax=${la2.toFixed(3)}&lomax=${lo2.toFixed(3)}`;
}

/** Position extrapolée entre deux relevés, au cap et à la vitesse (v1 : `dr`). @param {{lat: number, lon: number, alt?: number, vr?: number, trk: number, vel: number, t: number}} o @param {number} maintenantMs */
export function extrapoler(o, maintenantMs) {
  const dt = Math.min(EXTRAPOLATION_MAX_S, (maintenantMs - o.t) / 1000), d = o.vel * dt, b = o.trk * RAD;
  return { lat: o.lat + d * Math.cos(b) / 111320, lon: o.lon + d * Math.sin(b) / (111320 * Math.max(0.2, Math.cos(o.lat * RAD))), alt: (o.alt || 0) + (o.vr || 0) * dt };
}

/** Avions d'une réponse OpenSky (vecteurs d'état) : ni au sol ni sans position (v1 : corps de `pollAir`). @param {{states?: any[][]}} j @param {number} maintenantMs @returns {Avion[]} */
export function lireAvions(j, maintenantMs) {
  return (j.states || []).filter((v) => v[5] !== null && v[5] !== undefined && v[6] !== null && v[6] !== undefined && !v[8]).map((v) => ({
    name: ((v[1] || '').trim() || v[0] || '?'), id: v[0], lat: v[6], lon: v[5], alt: (v[13] !== null && v[13] !== undefined ? v[13] : (v[7] || 0)), trk: v[10] || 0, vel: v[9] || 0, vr: v[11] || 0, t: maintenantMs }));
}

/**
 * Navires après une réponse du relais : mise à jour des navires connus (le nom d'une réponse précédente est conservé), nœuds → m/s, horodatage jamais dans le futur.
 * @param {Map<string, Navire>} anciens @param {{ships?: any[]}} j @param {number} maintenantMs @returns {Map<string, Navire>} nouvelle table
 */
export function fusionnerNavires(anciens, j, maintenantMs) {
  const out = new Map(anciens);
  for (const v of (j.ships || [])) {
    if (v.lat === null || v.lat === undefined || v.lon === null || v.lon === undefined) continue;
    const old = out.get(String(v.mmsi));
    out.set(String(v.mmsi), { name: v.name || (old && old.name) || ('MMSI ' + v.mmsi), mmsi: String(v.mmsi), type: v.type !== null && v.type !== undefined ? v.type : (old ? old.type : null), lat: v.lat, lon: v.lon,
      trk: v.cog || 0, vel: (v.sog || 0) * NOEUD_EN_MS, alt: 0, vr: 0, t: (v.t && v.t <= maintenantMs) ? v.t : maintenantMs });
  }
  return out;
}

/** Durée de garde d'un navire sans nouvelle position : 15 min en route, 1 h à quai ou au mouillage (une position toutes les ~3 min). @param {{vel?: number}} v */
export const dureeConservation = (v) => ((v.vel || 0) < 0.3 ? 60 * 60000 : 15 * 60000);

/**
 * Mobiles proches à l'instant `maintenantMs`, positions extrapolées, les 60 plus proches, triés par distance (v1 : `mobiles`). Les navires périmés sont listés dans `expires`
 * (l'appelant les retire). Photo rejouée : aucun mobile.
 * @param {{pos: {lat: number, lon: number}, avions: Avion[], navires: Map<string, Navire>, reglages: {air: boolean, sea: boolean, airMaxKm: number, seaMaxKm: number}, maintenantMs: number, photo?: boolean}} e
 * @returns {{mobiles: Mobile[], expires: string[]}}
 */
export function listerMobiles({ pos, avions, navires, reglages, maintenantMs, photo = false }) {
  /** @type {Mobile[]} */
  const out = [];
  /** @type {string[]} */
  const expires = [];
  if (photo) return { mobiles: out, expires };
  if (reglages.air) for (const p of avions) {
    const s = extrapoler(p, maintenantMs), r = distanceEtCap(pos, { lat: s.lat, lon: s.lon });
    if (r.distKm > reglages.airMaxKm) continue;
    out.push({ name: p.name, kind: 'plane', id: p.id, lat: s.lat, lon: s.lon, t: p.t, dist: r.distKm, brg: r.capDeg, alt: s.alt, trk: p.trk, vel: p.vel });
  }
  if (reglages.sea) for (const [id, v] of navires) {
    if (maintenantMs - v.t > dureeConservation(v)) { expires.push(id); continue; }
    const s = extrapoler(v, maintenantMs), r = distanceEtCap(pos, { lat: s.lat, lon: s.lon });
    if (r.distKm > reglages.seaMaxKm) continue;
    out.push({ name: v.name, kind: 'ship', mmsi: v.mmsi || id, type: v.type, lat: s.lat, lon: s.lon, t: v.t, dist: r.distKm, brg: r.capDeg, alt: 0, trk: v.trk, vel: v.vel });
  }
  return { mobiles: out.sort((a, b) => a.dist - b.dist).slice(0, MOBILES_MAX), expires };
}

/** Catégories AIS (ITU-R M.1371) : couleur et libellé, à la manière de la carte MarineTraffic. */
const CATEGORIES = /** @type {[(t: number) => boolean, string, string][]} */ ([
  [(t) => t === 36 || t === 37, '#D45AD6', 'Voilier, plaisance'], [(t) => t === 30, '#F4A07A', 'Pêche'], [(t) => t >= 40 && t < 50, '#F2D53C', 'Grande vitesse'],
  [(t) => t >= 60 && t < 70, '#4F8DF0', 'Passagers'], [(t) => t >= 70 && t < 80, '#79C76B', 'Cargo'], [(t) => t >= 80 && t < 90, '#E5484D', 'Citerne (pétrolier, gaz, chimie)'],
  [(t) => (t >= 50 && t < 60) || t === 31 || t === 32 || t === 33 || t === 34 || t === 35, '#38C9E3', 'Service (remorqueur, pilote, sauvetage, dragage…)']]);
const SOUS_CATEGORIES = /** @type {Record<number, string>} */ ({ 30: 'Pêche', 31: 'Remorquage', 32: 'Remorquage (grand)', 33: 'Dragage', 34: 'Plongée', 35: 'Militaire', 36: 'Voilier', 37: 'Plaisance', 50: 'Pilote', 51: 'Sauvetage (SAR)',
  52: 'Remorqueur', 53: 'Navette portuaire', 54: 'Anti-pollution', 55: 'Police', 58: 'Transport médical' });
/** Couleur, catégorie et sous-catégorie d'un type de navire (v1 : `shipStyle`). @param {number | string | null | undefined} type */
export function categorieNavire(type) {
  const t = +/** @type {number} */ (type), c = t > 0 ? CATEGORIES.find((x) => x[0](t)) : null;
  return { col: c ? c[1] : '#B4BCC8', cat: c ? c[2] : 'Type inconnu', sub: SOUS_CATEGORIES[t] || (c ? c[2] : 'non transmis') };
}
