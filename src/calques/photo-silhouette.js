// @ts-check
/**
 * Calque « photo-silhouette » : silhouette RÉELLE lue sur la photo (limite ciel / non-ciel), en pointillés bleu clair, pour vérifier ce que
 * l'appli a compris de l'image. Affichée en Tout voir seulement, quand l'analyse est active, réussie et récente.
 * Entrées : colonnes lues { brg, a } (lecture des pixels : vision/, étape 10), vue de rendu. Sortie : commandes de dessin. Pur.
 * Dépend de : rendu/projection.js, rendu/commandes.js, noyau/maths.js.
 */
import { ecartAngle } from '../noyau/maths.js';
import { xDepuisEcart, yDepuisSite } from '../rendu/projection.js';
import { trait } from '../rendu/commandes.js';

/** @typedef {import('../rendu/projection.js').VueRendu} VueRendu */
/** @typedef {{brg: number, a: number}} ColonneCiel brg : relèvement (°), a : angle de la limite ciel / non-ciel (°) */
/**
 * @typedef {object} AnalysePhoto
 * @property {boolean} ok l'analyse a réussi @property {number} t instant de l'analyse (ms) @property {ColonneCiel[]} cols
 */

/** Une analyse reste valable ce temps (ms), v1 : `PHOTO_FRESH`. */
export const ANALYSE_VALIDE_MS = 6000;
/** Au-delà de cet écart au cap (°), le tracé est interrompu (v1 : 80). */
const ECART_MAX_DEG = 80;

/**
 * Faut-il montrer la silhouette lue ? (v1 : `S.beyond && photoFresh()`)
 * @param {{toutVoir: boolean, analyseActive: boolean}} reglages @param {AnalysePhoto | null} analyse @param {number} maintenantMs
 */
export const silhouetteVisible = ({ toutVoir, analyseActive }, analyse, maintenantMs) => toutVoir && analyseActive && !!analyse && analyse.ok && maintenantMs - analyse.t < ANALYSE_VALIDE_MS;

/**
 * @param {AnalysePhoto} analyse @param {VueRendu} vue
 * @param {{jointure?: 'miter'|'round'|'bevel'}} [options] jointure des segments : la v1 héritait, sans le vouloir, de celle laissée par la silhouette du relief
 * @returns {import('../rendu/commandes.js').Commande[]}
 */
export function commandesSilhouettePhoto(analyse, vue, { jointure = 'round' } = {}) {
  /** @type {import('../rendu/commandes.js').OperationChemin[]} */
  const chemin = [];
  let enCours = false;
  for (const col of analyse.cols) {
    const dB = ecartAngle(col.brg - vue.capDeg);
    if (Math.abs(dB) > ECART_MAX_DEG) { enCours = false; continue; }
    const x = xDepuisEcart(vue, dB), y = yDepuisSite(vue, col.a);
    if (enCours) chemin.push(['L', x, y]); else { chemin.push(['M', x, y]); enCours = true; }
  }
  return [trait(chemin, 'rgba(140,220,255,.85)', 1.2, { tirets: [2, 4], jointure })];
}

export const calque = {
  id: 'photo-silhouette',
  libelle: 'Silhouette lue sur la photo',
  /**
   * @param {AnalysePhoto | null} analyse @param {VueRendu} vue
   * @param {{reglages: {toutVoir: boolean, analyseActive: boolean}, maintenantMs: number, jointure?: 'miter'|'round'|'bevel'}} contexte
   */
  preparer(analyse, vue, { reglages, maintenantMs, jointure }) {
    return analyse && silhouetteVisible(reglages, analyse, maintenantMs) ? commandesSilhouettePhoto(analyse, vue, { jointure }) : [];
  },
};
