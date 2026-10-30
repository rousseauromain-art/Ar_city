// @ts-check
/**
 * Masque du relief sur tous les relèvements (la silhouette, par distance). Calcul lourd : peut tourner dans un Worker
 * (workers/masque-relief.js) ou, à défaut, sur le fil principal par tranches qui rendent la main (`cede`).
 * Entrées : bandes de relief, position, altitude d'œil. Sortie : { pm, brut } (voir relief.js). Dépend de : scene/relief.js.
 */
import { masqueRelevement, NB_RELEVEMENTS, DISTANCES_KM } from './relief.js';

/** @typedef {import('./relief.js').Bande} Bande */
/** @typedef {Float32Array[] & {raw?: Float32Array[]}} Masque pm[relevement][k] ; pm.raw = angles bruts (dénivelé caché derrière chaque crête) */
/** @typedef {(bands: Bande[], c: {lat: number, lon: number}, oeilM: number) => Promise<Masque>} CalculMasque */

/** Temps de calcul continu au plus, en ms, avant de rendre la main à l'affichage (règle 9 : une image en moins de 8 ms). */
const BUDGET_MS = 8;

/**
 * Calcul sur le fil appelant. `cede` (défaut : un tour de boucle d'événements) laisse l'affichage respirer entre deux tranches.
 * Le résultat ne dépend pas du découpage : la main est rendue dès que `budgetMs` est dépassé (la v1 la rendait tous les 90 relèvements).
 * @param {Bande[]} bands @param {{lat: number, lon: number}} c @param {number} oeilM @param {() => Promise<void>} [cede]
 * @param {{budgetMs?: number, horloge?: () => number}} [options]
 * @returns {Promise<Masque>}
 */
export async function calculerMasque(bands, c, oeilM, cede = () => new Promise((ok) => setTimeout(ok, 0)), { budgetMs = BUDGET_MS, horloge = () => performance.now() } = {}) {
  let depuis = horloge();
  /** @type {Masque} */
  const pm = new Array(NB_RELEVEMENTS), raw = new Array(NB_RELEVEMENTS);
  for (let bi = 0; bi < NB_RELEVEMENTS; bi++) {
    raw[bi] = new Float32Array(DISTANCES_KM.length);
    pm[bi] = masqueRelevement(bands, c, oeilM, bi, raw[bi]);
    if (horloge() - depuis >= budgetMs) { await cede(); depuis = horloge(); }
  }
  pm.raw = raw;
  return pm;
}
