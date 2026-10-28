// @ts-check
/**
 * Fabrication des monuments et équipements à partir des lieux Wikidata bruts. Fonction pure (v1 : `applyMonuments`, sans ses effets de bord).
 * Règle : chaque ligne est triée par wdClassify ; plus de seuil de notoriété pour les monuments (ce qui est trop petit ou trop loin passe en
 * transparence à l'affichage, rien n'est jeté) ; un monument peu connu sans hauteur est supposé petit ; au-delà de 150 monuments (grande ville)
 * on garde les 80 plus proches (< 2 km) puis les plus connus. Entrées : lignes Wikidata, position. Sortie : monuments, équipements, écartés.
 * Dépend de : donnees/wikidata.js, noyau/geo.js.
 */
import { distanceEtCap } from '../noyau/geo.js';
import { wdClassify } from './wikidata.js';

/**
 * @typedef {object} Monument
 * @property {string} name @property {number} lat @property {number} lon @property {'monument'} kind @property {'monument'|'equip'} cat
 * @property {string|null} qid @property {string} type @property {number} links @property {boolean} prot
 * @property {number|null} htWd @property {number|null} htOsm @property {number} ht @property {string} types @property {string} why
 * @property {boolean} [minor] @property {string} [src] @property {boolean} [tdf] @property {string} [loc] @property {Record<string, string>} [tags] @property {boolean} [unnamed]
 * @property {string} [hint] @property {string|null} [osm] @property {boolean} [anfr] @property {string|number} [osmTall]
 */
/** @typedef {{qid: string, name: string, lat: number, lon: number, links: number, ht: number|null, types: string, prot?: boolean}} LigneWikidata */

/** Seuil de langues « peu connu » : en dessous, un monument sans hauteur est supposé petit (v1 : `MON_LOW_LINKS`). */
export const MON_LOW_LINKS = 3;
/** Seuil de langues du mode de secours (une requête unique sur toute la zone). */
export const MON_MIN_LINKS = 40;
/** Un monument très célèbre : seuil d'angle apparent abaissé, jamais supprimé (v1 : `MON_STAR_LINKS`). */
export const MON_STAR_LINKS = 80;
/** Monuments gardés au plus (hors les plus proches). */
export const MON_KEEP = 150;
/** Hauteur supposée (m) d'un monument peu connu sans hauteur. */
export const MON_MINOR_H = 12;
/** Les monuments à moins de 2 km les plus proches sont toujours gardés (au plus 80). */
export const MON_NEAR_KEEP = 80;
export const MON_NEAR_KEEP_KM = 2;
/** Équipements : au plus 300, à moins de 12 km. */
export const EQUIP_KEEP = 300;
export const EQUIP_RADIUS_KM = 12;
/** Hauteur supposée par type (m). */
export const MON_DEF_H = Object.freeze(/** @type {Record<string, number>} */ ({ tour: 60, dome: 40, clocher: 45, arc: 25, colonne: 25, chateau: 20, musee: 18, stade: 25, gare: 10, eau: 0, parc: 0, place: 0, scene: 18, pont: 8, edifice: 18, mairie: 25, maison: 12 }));

/** Classement mémorisé par ligne (les lignes ne changent pas pendant la session). @type {WeakMap<object, ReturnType<typeof wdClassify>>} */
const memoClassement = new WeakMap();

/**
 * @param {LigneWikidata[]} liste lignes Wikidata (réponse des tuiles, ou Wikidata direct)
 * @param {{pos: {lat: number, lon: number} | null, minLinks: number}} p `minLinks` > 3 = mode de secours (seuil de la requête elle-même)
 * @returns {{monuments: Monument[], equipements: Monument[], gardes: Monument[], ecartes: {name: string, links: number, types: string, why: string}[], nEcartes: number,
 *   seuilRelevePar: number, rognes: (Monument & {dist: number, brg: number | null})[], nProteges: number}}
 */
export function fabriquerMonuments(liste, { pos, minLinks }) {
  /** @type {Monument[]} */
  let mons = [];
  /** @type {Monument[]} */
  let eqs = [];
  let nExcl = 0;
  /** @type {{name: string, links: number, types: string, why: string}[]} */
  const excl = [];
  for (const m of liste) {
    if (!m || !isFinite(m.lat) || !isFinite(m.lon)) continue;
    let cl = memoClassement.get(m);
    if (!cl) { cl = wdClassify(m); memoClassement.set(m, cl); }
    const links = m.links || 0;
    if (!cl.cat) { nExcl++; if (excl.length < 600) excl.push({ name: m.name, links, types: m.types || '', why: cl.why }); continue; }
    if (cl.cat === 'monument') { if (!m.prot && minLinks > MON_LOW_LINKS && links < minLinks) continue; }
    else {
      if (links < Math.max(cl.minLinks || 1, minLinks > MON_LOW_LINKS ? minLinks : 1)) continue;
      if (pos && distanceEtCap(pos, m).distKm > EQUIP_RADIUS_KM) continue;
    }
    // peu connu (1-2 langues), non protégé, hauteur inconnue : supposé petit plutôt qu'à la hauteur type d'une église ou d'une tour
    const type = /** @type {string} */ (cl.type), minor = !m.ht && !m.prot && cl.cat === 'monument' && links < MON_LOW_LINKS;
    const ht = m.ht || (minor ? Math.min(MON_MINOR_H, MON_DEF_H[type] ?? 20) : (MON_DEF_H[type] !== undefined && MON_DEF_H[type] !== null ? MON_DEF_H[type] : 20));
    (cl.cat === 'equip' ? eqs : mons).push({ name: m.name, lat: m.lat, lon: m.lon, kind: 'monument', cat: cl.cat, qid: m.qid, type, links, prot: !!m.prot, htWd: m.ht, htOsm: null, ht, types: m.types,
      why: cl.why + (minor ? ` · peu connu (${links} langue${links > 1 ? 's' : ''}) : hauteur supposée ${ht} m` : ''), minor });
  }
  let trim = 0;
  /** @type {(Monument & {dist: number, brg: number | null})[]} */
  let rognes = [];
  if (mons.length > MON_KEEP) {
    // les MON_NEAR_KEEP plus proches (< 2 km) sont toujours gardés ; le plafond des MON_KEEP plus connus ne s'applique qu'au reste.
    const dd = (/** @type {Monument} */ m) => (pos ? distanceEtCap(pos, m).distKm : 1e9);
    /** @type {Monument[]} */
    const nearL = [];
    /** @type {Monument[]} */
    const rest = [];
    for (const m of mons) (dd(m) <= MON_NEAR_KEEP_KM ? nearL : rest).push(m);
    nearL.sort((x, y) => dd(x) - dd(y));
    rest.push(...nearL.splice(MON_NEAR_KEEP));
    rest.sort((x, y) => (y.links || 0) - (x.links || 0) || ((x.qid ?? '') < (y.qid ?? '') ? -1 : 1));
    const keptRest = rest.slice(0, MON_KEEP);
    trim = keptRest.length ? keptRest[keptRest.length - 1].links || 0 : 0;
    rognes = rest.slice(MON_KEEP, MON_KEEP + 400).map((m) => ({ ...m, dist: dd(m), brg: pos ? distanceEtCap(pos, m).capDeg : null }));
    mons = nearL.concat(keptRest);
  }
  if (eqs.length > EQUIP_KEEP) { eqs.sort((x, y) => (y.links || 0) - (x.links || 0)); eqs = eqs.slice(0, EQUIP_KEEP); }
  return { monuments: mons, equipements: eqs, gardes: mons.concat(eqs), ecartes: excl.sort((x, y) => y.links - x.links), nEcartes: nExcl, seuilRelevePar: trim, rognes, nProteges: mons.filter((m) => m.prot).length };
}
