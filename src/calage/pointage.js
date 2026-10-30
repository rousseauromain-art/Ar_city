// @ts-check
/**
 * CALAGE PAR POINTAGE : on touche, à l'écran, un repère qu'on reconnaît ; le cap se corrige d'un coup en le rattachant à l'élément connu le plus proche en relèvement.
 * Candidats : le SOLEIL (le repère le plus sûr : direction et hauteur exactes), puis tout ce qui est affiché, lieux et monuments. Un monument se vise par son SOMMET : le plus proche du point
 * touché, en direction ET en hauteur, l'emporte. Si sa hauteur est connue (Wikidata/OSM), le cap ET l'horizon sont corrigés ; sinon le cap seul, et la note donne la hauteur que le point touché implique.
 * Fonction pure. Entrées : toucher, pose, champ, liste affichée, soleil. Sortie : corrections et textes (ceux de la v1). Reprend `pointCalibrate` de la v1.
 */
import { RAD } from '../noyau/constantes.js';
import { ecartAngle } from '../noyau/maths.js';

/** Écart de relèvement maximal (°) entre le point touché et un candidat. */
export const FENETRE_POINTAGE_DEG = 12;
/** Un monument plus proche que cela (km) n'est pas assez précis pour corriger l'horizon. */
export const DIST_MIN_HORIZON_KM = 0.15;

/**
 * @typedef {object} ElementPointe
 * @property {string} name @property {string} kind @property {string} [cat] @property {number | null} [dist] @property {number | null} [brg] @property {boolean} [far] @property {boolean} [hidden]
 * @property {number | null} [aP] angle du sommet (relief) @property {number | null} [ht] hauteur (m) @property {number | null} [htWd] @property {number | null} [htOsm]
 */

/**
 * @param {{
 *   toucher: {x: number, y: number},
 *   pose: {capDeg: number, inclinaisonDeg: number, roulisDeg: number},
 *   champDeg: number,
 *   ecran: {largeurPx: number, hauteurPx: number},
 *   liste: ElementPointe[],
 *   soleil: {azDeg: number, elDeg: number} | null,
 *   avecRelief: boolean,
 *   correctionOeilM?: number,
 *   nomMonument: (c: ElementPointe) => string,
 * }} e
 * @returns {{aucun: true, note: string} | {aucun: false, source: 'soleil' | 'repere' | 'lieu', relevementDeg: number, cible: ElementPointe | null, nom: string, distKm: number, hauteurConnueM: number | null,
 *   correctionCapDeg: number, correctionHorizonDeg: number | null, texte: string, note: string}}
 */
export function pointer({ toucher, pose, champDeg, ecran, liste, soleil, avecRelief, correctionOeilM = 0, nomMonument }) {
  const fh = ecran.largeurPx / 2 / Math.tan((champDeg / 2) * RAD), cx = ecran.largeurPx / 2, cy = ecran.hauteurPx / 2, dx = toucher.x - cx, dy = toucher.y - cy, r = pose.roulisDeg * RAD;
  const lx = cx + dx * Math.cos(r) + dy * Math.sin(r), ly = cy - dx * Math.sin(r) + dy * Math.cos(r); // repère compensé du roulis, comme le rendu
  const capToucheDeg = (pose.capDeg + Math.atan((lx - cx) / fh) / RAD + 360) % 360, siteToucheDeg = pose.inclinaisonDeg - Math.atan((ly - cy) / fh) / RAD, oeilM = 1.6 + correctionOeilM;
  const sommet = (/** @type {ElementPointe} */ c) => (c.aP !== null && c.aP !== undefined && avecRelief ? c.aP : Math.atan2((c.ht || 20) - oeilM, Math.max(30, /** @type {number} */ (c.dist) * 1000)) / RAD);
  /** @type {ElementPointe | null} */
  let meilleur = null;
  let meilleurScore = 1e9, estSoleil = false;
  // le SOLEIL est le repère le plus sûr : touché à moins de 12°, il l'emporte à écart égal
  if (soleil && soleil.elDeg > -1) {
    const db = Math.abs(ecartAngle(soleil.azDeg - capToucheDeg)), s = Math.hypot(db, 0.5 * (siteToucheDeg - soleil.elDeg)) - 1;
    if (db < FENETRE_POINTAGE_DEG && s < meilleurScore) { meilleurScore = s; estSoleil = true; }
  }
  for (const c of liste) {
    if (c.dist === null || c.dist === undefined || c.brg === null || c.brg === undefined || c.far || (avecRelief && c.hidden)) continue;
    const mon = c.kind === 'monument' && c.cat !== 'equip', db = Math.abs(ecartAngle(c.brg - capToucheDeg));
    if (db > FENETRE_POINTAGE_DEG) continue;
    const s = mon ? Math.hypot(db, 0.5 * (siteToucheDeg - sommet(c))) : db + 1.5; // à écart égal, un monument visé par son sommet passe devant un lieu
    if (s < meilleurScore) { meilleurScore = s; meilleur = c; estSoleil = false; }
  }
  if (!estSoleil && !meilleur) return { aucun: true, note: 'aucun lieu ni monument connu près de cet endroit : visez un repère plus net, ou vérifiez son nom dans Réglages' };
  const signe = (/** @type {number} */ v) => (v >= 0 ? '+' : '');
  if (estSoleil && soleil) {
    const corr = ecartAngle(soleil.azDeg - capToucheDeg), dp = soleil.elDeg - siteToucheDeg;
    const texte = `cap ${signe(corr)}${corr.toFixed(1)}° · horizon ${signe(dp)}${dp.toFixed(1)}° (soleil à ${soleil.azDeg.toFixed(1)}° / ${soleil.elDeg.toFixed(1)}°)`;
    return { aucun: false, source: 'soleil', relevementDeg: soleil.azDeg, cible: null, nom: 'soleil', distKm: 150e6, hauteurConnueM: null, correctionCapDeg: corr, correctionHorizonDeg: dp, texte, note: `calé sur le soleil · ${texte}` };
  }
  const b = /** @type {ElementPointe} */ (meilleur), dist = /** @type {number} */ (b.dist), corr = ecartAngle(/** @type {number} */ (b.brg) - capToucheDeg);
  const mon = b.kind === 'monument' && b.cat !== 'equip', hauteur = b.htWd || b.htOsm || null, connue = mon && !!hauteur && dist >= DIST_MIN_HORIZON_KM;
  let texte = `cap ${signe(corr)}${corr.toFixed(1)}°`;
  /** @type {number | null} */
  let dp = null;
  if (connue) { dp = sommet(b) - siteToucheDeg; texte += ` · horizon ${signe(dp)}${dp.toFixed(1)}° (sommet à ${Math.round(/** @type {number} */ (hauteur))} m)`; }
  else if (mon) { const hImp = oeilM + Math.tan(siteToucheDeg * RAD) * dist * 1000; if (hImp > 3 && hImp < 400) texte += ` · hauteur inconnue : le point touché implique ≈ ${Math.round(hImp)} m (si l'horizon est juste)`; }
  const nom = mon ? nomMonument(b) : b.name;
  return { aucun: false, source: mon ? 'repere' : 'lieu', relevementDeg: /** @type {number} */ (b.brg), cible: b, nom, distKm: dist, hauteurConnueM: connue ? /** @type {number} */ (hauteur) : null, correctionCapDeg: corr, correctionHorizonDeg: dp, texte, note: `calé sur « ${nom} » (${dist.toFixed(1)} km) · ${texte}` };
}
