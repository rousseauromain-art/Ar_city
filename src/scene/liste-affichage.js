// @ts-check
/**
 * Liste d'affichage COMMUNE à tous les calques qui posent des noms : tri par priorité, score de notoriété des monuments, dédoublonnage des
 * homonymes. Dans la v1, lieux, repères et monuments sont triés ensemble (type, puis notoriété × hauteur apparente pour les monuments, puis
 * distance) puis dédoublonnés ensemble : le monument passe avant la ville de même nom. Fonctions pures (v1 : `RANK`, `monScore`, `monVisAng`,
 * `urbanDense` et la fin de `visibleCities`). Dépend de : noyau/geo.js, noyau/texte.js.
 */
import { distanceEtCap } from '../noyau/geo.js';
import { normaliser } from '../noyau/texte.js';
import { RAD } from '../noyau/constantes.js';

/** Priorité d'affichage par type : plus petit = posé d'abord (v1 : `RANK`). */
export const PRIORITE = Object.freeze(/** @type {Record<string, number>} */ ({ monument: -1, city: 0, town: 1, lighthouse: 1, island: 1, cape: 2, peak: 2, village: 2, view: 3, rock: 3, heritage: 3, beach: 4, hamlet: 4, isolated_dwelling: 4, poi: 3 }));
/** Homonymes à moins de cette distance (km) : un seul est gardé (OSM décrit parfois un même lieu par plusieurs objets). */
export const DOUBLON_KM = 2;
/** Hauteur supposée (m) de la canopée en ville dense : un monument plus bas est caché par les toits. */
export const HAUTEUR_TOITS_M = 20;

/**
 * Ville dense autour de soi : grande ville (≥ 100 000 hab.) à moins de 6 km, ou beaucoup de monuments (≥ 25 à moins de 2 km, statues exclues),
 * ou d'immeubles hauts (≥ 15 à moins de 3 km) proches. Sert à décider des toits et de la portée des statues.
 * @param {{pos: {lat: number, lon: number} | null, cities: {kind: string, pop?: number, lat: number, lon: number}[], monuments: {cat: string, src?: string, lat: number, lon: number}[],
 *   batiments: {kind?: string, lat: number, lon: number}[]}} e
 */
export function villeDense({ pos, cities, monuments, batiments }) {
  if (!pos) return false;
  const d = (/** @type {{lat: number, lon: number}} */ p) => distanceEtCap(pos, p).distKm;
  return cities.some((c) => c.kind === 'city' && (c.pop || 0) >= 100000 && d(c) <= 6)
    || monuments.filter((m) => m.cat !== 'equip' && m.src !== 'osms' && d(m) <= 2).length >= 25
    || batiments.filter((b) => b.kind === 'immeuble' && d(b) <= 3).length >= 15;
}

/** Hauteur apparente (°) d'un monument, au-dessus des toits en ville dense (v1 : `monVisAng`). @param {{ht?: number, dist: number}} c @param {boolean} dense */
export const hauteurApparenteDeg = (c, dense) => Math.atan(Math.max(2, (c.ht || 20) - (dense ? HAUTEUR_TOITS_M : 0)) / Math.max(50, (c.dist || 0) * 1000)) / RAD;

/**
 * Notoriété d'un monument ramenée à ce qu'on voit : (langues + 3) × hauteur apparente ; pour un équipement, notoriété ÷ proximité (v1 : `monScore`).
 * @param {{cat?: string, links?: number, ht?: number, dist: number}} c @param {boolean} dense
 */
export const scoreMonument = (c, dense) => (c.cat === 'equip' ? (c.links || 1) / (1 + (c.dist || 0) / 2) : ((c.links || 0) + 3) * hauteurApparenteDeg(c, dense));

/** @typedef {{kind: string, cat?: string, links?: number, ht?: number, dist: number, name: string, lat: number, lon: number}} Affichable */

/**
 * Comparateur d'affichage : priorité du type, puis (monuments) score décroissant, puis distance croissante.
 * @param {boolean} dense @returns {(a: Affichable, b: Affichable) => number}
 */
export const comparateurAffichage = (dense) => (a, b) => (PRIORITE[a.kind] ?? 3) - (PRIORITE[b.kind] ?? 3) || (a.kind === 'monument' ? scoreMonument(b, dense) - scoreMonument(a, dense) : 0) || a.dist - b.dist;

/**
 * Assemble les listes classées de plusieurs calques (monuments d'abord) : concaténation puis tri STABLE, comme la v1 qui triait `monuments.concat(lieux)`.
 * @template {Affichable} T @param {T[][]} listes @param {boolean} dense @returns {T[]}
 */
export const assemblerListe = (listes, dense) => listes.flat().sort(comparateurAffichage(dense));

/**
 * Homonymes : on garde le premier (le plus prioritaire, la liste est déjà triée) et on écarte les suivants à moins de 2 km.
 * @template {{name: string, lat: number, lon: number}} T @param {T[]} liste @returns {T[]}
 */
export function dedoublonner(liste) {
  /** @type {Map<string, T[]>} */
  const vus = new Map();
  /** @type {T[]} */
  const gardes = [];
  for (const c of liste) {
    const k = normaliser(c.name), g = vus.get(k);
    if (g && g.some((o) => distanceEtCap(o, c).distKm < DOUBLON_KM)) continue;
    if (g) g.push(c); else vus.set(k, [c]);
    gardes.push(c);
  }
  return gardes;
}

/**
 * Ordre de pose des noms de tous les calques : les nets d'abord (dans l'ordre d'affichage de la liste assemblée), PUIS les fantômes — passer en Tout voir
 * ne peut jamais faire disparaître un nom net. Chaque étiquette porte son élément (`proprietaire`) et `fantome`.
 * @template {{proprietaire: unknown, fantome: boolean}} E @param {unknown[]} assemblee liste assemblée et dédoublonnée @param {E[]} etiquettes @returns {E[]}
 */
export function ordonnerEtiquettes(assemblee, etiquettes) {
  const rang = new Map(assemblee.map((e, i) => [e, i]));
  const r = (/** @type {E} */ e) => rang.get(e.proprietaire) ?? Infinity;
  return etiquettes.slice().sort((a, b) => Number(a.fantome) - Number(b.fantome) || r(a) - r(b));
}
