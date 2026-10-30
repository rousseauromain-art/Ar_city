// @ts-check
/**
 * Calque « repères hauts » (OpenStreetMap) : tours, clochers, tours de télécom, châteaux d'eau, cheminées, mâts, immeubles hauts, posés dans la bande des équipements
 * à leur SOMMET réel (sol du relief + hauteur). Les phares, caps et plages sont des lieux (calque lieux). Classement : portée réglée, déjà dessiné comme monument,
 * immeuble anonyme de moins de 40 m réservé à « Tout voir ». Fonctions pures. Reprend la partie repères de `draw()` et `bldTopAng` de la v1.
 * Entrées : repères (donnees/reperes-hauts.js), position, relief. Sorties : éléments classés, couche de bande. Dépend de : noyau, scene/relief.js, rendu/bande.js.
 */
import { distanceEtCap } from '../noyau/geo.js';
import { RAD, RAYON_EFFECTIF_M } from '../noyau/constantes.js';
import { altitudeEn } from '../scene/relief.js';
import { PLURIELS_INFRA } from '../rendu/bande.js';
import { HAUTEUR_DEFAUT, ICONE_REPERE } from '../donnees/reperes-hauts.js';

/** @typedef {import('../donnees/reperes-hauts.js').Repere} Repere */
/** @typedef {Repere & {dist: number, brg: number, dupMon: boolean}} RepereCalcule */
/** @typedef {{el: RepereCalcule, etat: 'net' | 'absent', raison: string | null}} RepereClasse */
/** @typedef {import('../rendu/bande.js').CoucheBande} CoucheBande */

const COULEUR_REPERES = Object.freeze({ ligne: 'rgba(169,139,255,.85)', texte: '#A98BFF', icone: '#A98BFF' });

/**
 * @param {Repere[]} reperes @param {{pos: {lat: number, lon: number}}} scene
 * @param {{reperes: boolean, portee: number, toutVoir: boolean, doublons: boolean[]}} reglages `doublons[i]` : le repère `i` est déjà dessiné comme monument (donnees/monuments-osm.js)
 * @returns {RepereClasse[]}
 */
export function classerReperes(reperes, scene, reglages) {
  if (!reglages.reperes) return [];
  return reperes.map((r, i) => {
    const { distKm, capDeg } = distanceEtCap(scene.pos, r), dupMon = !!reglages.doublons[i], el = { ...r, dist: distKm, brg: capDeg, dupMon };
    const raison = dupMon ? 'déjà dessiné comme monument' : distKm > reglages.portee ? `au-delà de la portée réglée (${reglages.portee} km)` : r.ess === false && !reglages.toutVoir ? 'Tout voir seulement (ne dépasse pas)' : null;
    return { el, etat: raison ? 'absent' : 'net', raison };
  });
}

/**
 * Angle (°) du sommet d'un repère vu d'ici : sol (relief) + hauteur ; null sans relief (v1 : `bldTopAng`).
 * @param {{lat: number, lon: number, dist: number, kind: string, height_m: number | null}} t @param {{h0: number, bands: import('../scene/relief.js').Bande[]} | null} terrain
 */
export function angleSommet(t, terrain) {
  if (!terrain || t.dist === null || t.dist === undefined) return null;
  const e = altitudeEn(terrain.bands, t.lat, t.lon, t.dist);
  if (Number.isNaN(e)) return null;
  const dm = Math.max(30, t.dist * 1000), top = e + (t.height_m || HAUTEUR_DEFAUT[t.kind] || 30);
  return Math.atan2(top - terrain.h0 - (dm * dm) / (2 * RAYON_EFFECTIF_M), dm) / RAD;
}

/**
 * @param {RepereClasse[]} classes @param {{h0: number, bands: import('../scene/relief.js').Bande[]} | null} terrain null : relief éteint ou absent (repères posés sur l'horizon)
 * @returns {CoucheBande | null}
 */
export function preparerReperes(classes, terrain) {
  const elements = classes.filter((c) => c.etat === 'net').map(({ el }) => ({ nom: el.name, icone: ICONE_REPERE[el.kind] || 'antenne', dist: el.dist, brg: el.brg, idMemoire: String(el.name + el.lat), source: el }));
  if (!elements.length) return null;
  return { cle: 'bld', elements, couleur: COULEUR_REPERES, pluriels: PLURIELS_INFRA, ancre: (e) => angleSommet(/** @type {RepereCalcule} */ (e.source), terrain) };
}

/** Calque repères hauts (interface commune, REFONTE.md §7). */
export const calque = {
  id: 'reperes',
  libelle: 'Repères hauts',
  /** @param {unknown} _zone @param {{reperes: Repere[]}} donnees */
  async charger(_zone, donnees) { return donnees.reperes; },
  classer: classerReperes,
  preparer: preparerReperes,
};
