// @ts-check
/**
 * Calque « batiments » (v1 : calque « Silhouette ») : la silhouette de la ville (BD TOPO) en 3 couches de distance, du fond vers l'avant, lissée « façon skyline », remplie jusqu'au sol de sa couche ;
 * plus c'est loin, plus c'est clair. Éteint par défaut. Fournit aussi l'ordonnée du haut du bâtiment qui masque un monument (pictogramme tracé en pointillé derrière).
 * Entrées : silhouette calculée (scene/silhouette-batiments.js, app/urbain.js), vue de rendu. Sortie : commandes de dessin. Pur.
 * Dépend de : noyau/projection.js, noyau/commandes.js, noyau/constantes.js, scene/silhouette-batiments.js.
 */
import { RAD } from '../noyau/constantes.js';
import { ecartDepuisX, yDepuisSite } from '../noyau/projection.js';
import { trait, remplissage } from '../noyau/commandes.js';
import { occulteur, SOL_COUCHES_M, VIDE } from '../scene/silhouette-batiments.js';

/**
 * Silhouette calculée : `ls` angles lissés par couche (ce que l'on dessine), `ld` distances par couche, `oeilRelM` hauteur de l'œil au-dessus du sol.
 * @typedef {{ls: Float32Array[], ld: Float32Array[], oeilRelM: number}} SilhouetteUrbaine
 */

/** [remplissage, trait, épaisseur] par couche (proche, moyen, lointain), comme la v1. */
const STYLES = /** @type {[string, string, number][]} */ ([['rgba(96,82,140,.26)', 'rgba(190,172,232,.55)', 1.0], ['rgba(58,46,98,.38)', 'rgba(199,155,232,.80)', 1.25], ['rgba(24,18,46,.55)', 'rgba(228,196,252,.98)', 1.7]]);
/** Pas d'échantillonnage horizontal (px). */
const PAS_PX = 2;

/** Tracés continus de la couche (null : direction sans bâtiment), avec une marche verticale quand la hauteur change de plus de 0,5 px. @param {Float32Array} arr @param {import('../noyau/projection.js').VueRendu} vue @returns {{x: number, y: number}[][]} */
function tracesDeCouche(arr, vue) {
  const W = vue.largeurPx, nb = arr.length, bw = 360 / nb, pts = /** @type {({x: number, y: number} | null)[]} */ ([]);
  for (let x = -20; x <= W + 20; x += PAS_PX) {
    const a = arr[Math.floor((((vue.capDeg + ecartDepuisX(vue, x)) % 360) + 360) % 360 / bw) % nb];
    if (a < -50) { pts.push(null); continue; }
    const y = yDepuisSite(vue, a), pv = pts[pts.length - 1];
    if (pv && Math.abs(pv.y - y) > 0.5) pts.push({ x, y: pv.y }); // marche : arête verticale (blocs de silhouette)
    pts.push({ x, y });
  }
  const traces = [];
  let cur = /** @type {{x: number, y: number}[]} */ ([]);
  for (const q of pts) { if (q) cur.push(q); else if (cur.length) { traces.push(cur); cur = []; } }
  if (cur.length) traces.push(cur);
  return traces;
}

/** @param {{x: number, y: number}[]} t @returns {import('../noyau/commandes.js').OperationChemin[]} */
const chemin = (t) => t.map((q, i) => /** @type {import('../noyau/commandes.js').OperationChemin} */ ([i ? 'L' : 'M', q.x, q.y]));

/**
 * @param {SilhouetteUrbaine} sil @param {import('../noyau/projection.js').VueRendu} vue @param {{remplir?: boolean}} [o] `remplir` : remplir jusqu'au sol de la couche (v1 : `urbFill`, oui par défaut)
 * @returns {import('../noyau/commandes.js').Commande[]}
 */
export function commandesSilhouetteUrbaine(sil, vue, { remplir = true } = {}) {
  /** @type {import('../noyau/commandes.js').Commande[]} */
  const cmds = [];
  const eyeR = Math.max(1, sil.oeilRelM);
  for (const li of [2, 1, 0]) { // du fond vers l'avant
    if (!sil.ls[li]) continue;
    const yB = yDepuisSite(vue, -Math.atan2(eyeR, SOL_COUCHES_M[li]) / RAD), [fond, ligne, epaisseur] = STYLES[li];
    for (const t of tracesDeCouche(sil.ls[li], vue)) {
      if (t.length < 2) continue;
      const dernier = t[t.length - 1], premier = t[0];
      if (remplir) cmds.push(remplissage([...chemin(t), ['L', dernier.x, Math.max(yB, dernier.y)], ['L', premier.x, Math.max(yB, premier.y)], ['Z']], fond));
      cmds.push(trait(chemin(t), 'rgba(14,26,43,.5)', epaisseur + 2, { jointure: 'round' }), trait(chemin(t), ligne, epaisseur, { jointure: 'round' }));
    }
  }
  return cmds;
}

/**
 * Ordonnée (px) du haut du bâtiment qui masque un monument à l'abscisse `x` et à la distance `distKm`, ou null (v1 : `urbOccluder`).
 * @param {{ls: Float32Array[], ld: Float32Array[]} | null} sil @param {import('../noyau/projection.js').VueRendu} vue @returns {(x: number, distKm: number) => number | null}
 */
export const occultationMonument = (sil, vue) => (x, distKm) => {
  const a = occulteur(sil, vue.capDeg + ecartDepuisX(vue, x), distKm * 1000);
  return a > VIDE / 2 ? yDepuisSite(vue, a) : null;
};

export const calque = {
  id: 'batiments',
  libelle: 'Silhouette des bâtiments',
  /** @param {SilhouetteUrbaine | null} sil @param {import('../noyau/projection.js').VueRendu} vue @param {{reglages: {urban: boolean, remplir: boolean}}} contexte */
  preparer(sil, vue, { reglages }) { return sil && reglages.urban ? commandesSilhouetteUrbaine(sil, vue, { remplir: reglages.remplir }) : []; },
};
