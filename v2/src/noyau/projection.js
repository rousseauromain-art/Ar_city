// @ts-check
/**
 * Projection de la scène sur l'écran : relèvement et site (angle au-dessus de l'horizontale) → pixels.
 * Une seule définition pour tous les calques (aucune formule de projection recopiée ailleurs). Fonctions pures.
 * Entrées : cap, inclinaison, champ affiché, taille de l'écran (px). Sorties : x, y en pixels. Dépend de : noyau/constantes.js, noyau/maths.js.
 */
import { RAD } from './constantes.js';
import { ecartAngle, borner } from './maths.js';

/**
 * Vue de rendu : tout ce qu'il faut pour placer un point à l'écran.
 * @typedef {object} VueRendu
 * @property {number} largeurPx @property {number} hauteurPx taille de l'écran
 * @property {number} capDeg cap de l'axe de la caméra @property {number} inclinaisonDeg site de l'axe (positif : vers le ciel)
 * @property {number} roulisDeg @property {number} champDeg champ AFFICHÉ (grand côté de l'écran), voir `champAffiche`
 */

/**
 * Champ horizontal réellement affiché : l'image est recadrée (object-fit: cover) ; en portrait la largeur de l'écran correspond au petit
 * côté du capteur. Sans dimensions du flux ou de l'écran : environ 65° en paysage, 35° en portrait (v1 : `vFovFor`).
 * @param {number} champCapteurDeg champ de la caméra (réglage « champ de la caméra »)
 * @param {{largeurPx: number, hauteurPx: number}} ecran @param {{largeurPx: number, hauteurPx: number} | null} flux image de la caméra ou de la photo
 */
export function champAffiche(champCapteurDeg, ecran, flux) {
  const tL = Math.tan((champCapteurDeg / 2) * RAD);
  if (!flux || !flux.largeurPx || !flux.hauteurPx || !ecran.largeurPx || !ecran.hauteurPx) {
    const r = ecran.largeurPx > ecran.hauteurPx ? 0.93 : 0.52;
    return (2 * Math.atan(tL * r)) / RAD;
  }
  const tW = tL * (flux.largeurPx / Math.max(flux.largeurPx, flux.hauteurPx));
  const sc = Math.max(ecran.largeurPx / flux.largeurPx, ecran.hauteurPx / flux.hauteurPx);
  return (2 * Math.atan((tW * (ecran.largeurPx / sc)) / flux.largeurPx)) / RAD;
}

/** Distance focale en pixels : fh = (W/2) / tan(champ/2). @param {VueRendu} v */
export const focalePx = (v) => (v.largeurPx / 2) / Math.tan((v.champDeg / 2) * RAD);

/** Abscisse d'un relèvement (°). @param {VueRendu} v @param {number} relevementDeg */
export const xDepuisRelevement = (v, relevementDeg) => v.largeurPx / 2 + focalePx(v) * Math.tan(ecartAngle(relevementDeg - v.capDeg) * RAD);

/** Abscisse pour un écart angulaire au cap, déjà ramené dans [-180, 180[. @param {VueRendu} v @param {number} ecartDeg */
export const xDepuisEcart = (v, ecartDeg) => v.largeurPx / 2 + focalePx(v) * Math.tan(ecartDeg * RAD);

/** Ordonnée d'un site (°). @param {VueRendu} v @param {number} siteDeg */
export const yDepuisSite = (v, siteDeg) => v.hauteurPx / 2 + focalePx(v) * Math.tan((v.inclinaisonDeg - siteDeg) * RAD);

/** Écart angulaire (°) au cap d'une abscisse. @param {VueRendu} v @param {number} x */
export const ecartDepuisX = (v, x) => Math.atan((x - v.largeurPx / 2) / focalePx(v)) / RAD;

/** Ordonnée de la ligne d'horizon, bornée à [-H, 2H] ; l'inclinaison est bornée à ±80° (v1 : `hy`). @param {VueRendu} v */
export const ordonneeHorizon = (v) => borner(v.hauteurPx / 2 + focalePx(v) * Math.tan(borner(v.inclinaisonDeg, -80, 80) * RAD), -v.hauteurPx, 2 * v.hauteurPx);

/** Demi-champ horizontal (°) augmenté de 4° : au-delà, un point n'est plus dessiné (v1 : `hf`). @param {VueRendu} v */
export const demiChampDeg = (v) => Math.atan((v.largeurPx / 2) / focalePx(v)) / RAD + 4;

/**
 * Abscisse d'un relèvement s'il est dans le champ utile, sinon null : au plus 80° (ou 80 % du champ) du cap, et à 40 px près de l'écran
 * (v1 : `inView`). `decalageDeg` : recalage fin sur la pointe lue sur la photo (monuments).
 * @param {VueRendu} v @param {number} relevementDeg @param {number} [decalageDeg]
 * @returns {number | null}
 */
export function abscisseSiVisible(v, relevementDeg, decalageDeg = 0) {
  const dB = ecartAngle(relevementDeg + decalageDeg - v.capDeg);
  if (Math.abs(dB) > Math.min(80, v.champDeg * 0.8)) return null;
  const x = xDepuisEcart(v, dB);
  return x < -40 || x > v.largeurPx + 40 ? null : x;
}
