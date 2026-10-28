// @ts-check
/**
 * Fusion de listes de lieux issues de sources différentes. Fonction pure.
 * Même nom (normalisé) à moins de `maxKm` = un seul lieu : la source la plus à gauche est prioritaire ; ses champs manquants (altitude,
 * population) sont complétés par la suivante. Reprend `mergeByNameProximity` de la v1. Dépend de : noyau/geo.js, noyau/texte.js.
 */
import { distanceEtCap } from '../noyau/geo.js';
import { normaliser } from '../noyau/texte.js';

/** @typedef {{name: string, lat: number, lon: number, kind: string, pop: number, ele: number | null}} Lieu */

/** @param {Lieu[][]} listes @param {number} maxKm @returns {Lieu[]} */
export function fusionnerParNomEtProximite(listes, maxKm) {
  /** @type {Lieu[]} */
  const out = [];
  for (const liste of listes) for (const it of liste) {
    const n = normaliser(it.name);
    const dup = out.find((o) => normaliser(o.name) === n && distanceEtCap(o, it).distKm <= maxKm);
    if (!dup) out.push(it);
    else {
      if ((dup.ele === null || dup.ele === undefined) && it.ele !== null && it.ele !== undefined) dup.ele = it.ele;
      if (!dup.pop && it.pop) dup.pop = it.pop;
    }
  }
  return out;
}
