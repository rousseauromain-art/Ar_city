// @ts-check
/**
 * ÉCHELLE DU CHAMP DE VISION, calée une fois par téléphone avec DEUX repères connus. Le champ affiché dépend de l'objectif et du recadrage ; un champ faux fait que les noms s'écartent ou se serrent
 * en s'éloignant du centre. Deux repères touchés à l'écran, dont on connaît les relèvements, donnent d'un coup la focale (donc le champ) et le cap réel de la caméra.
 * PUR : aucune lecture d'écran ni de stockage. Entrées : taille de l'écran, roulis, les deux points touchés (x, y, relèvement), conversion champ du capteur → champ affiché.
 * Sortie : le champ du capteur à régler (`camFov`), la correction de cap, ou un refus avec la raison.
 */
import { RAD } from '../noyau/constantes.js';
import { ecartAngle } from '../noyau/maths.js';

/** Écart minimal entre les deux repères (relèvement, °) et sur l'écran (part de la largeur) : en dessous, la focale se déduit mal. */
export const ECART_MIN_DEG = 10, ECART_MIN_ECRAN = 0.2;
/** Bornes du champ du capteur, comme le curseur des réglages. */
export const CHAMP_MIN_DEG = 20, CHAMP_MAX_DEG = 110;

/** @typedef {{x: number, y: number, relevementDeg: number}} PointCale un repère touché : position écran (px) et relèvement connu (° depuis le nord) */

/**
 * @param {{ecran: {largeurPx: number, hauteurPx: number}, roulisDeg: number, capDeg: number, points: [PointCale, PointCale], champAffiche: (camFov: number) => number}} e
 * @returns {{ok: true, camFov: number, champAfficheDeg: number, focalePx: number, correctionCapDeg: number} | {ok: false, message: string}}
 */
export function calerEchelle({ ecran, roulisDeg, capDeg, points, champAffiche }) {
  const cx = ecran.largeurPx / 2, cy = ecran.hauteurPx / 2, r = roulisDeg * RAD;
  // repère compensé du roulis, comme le rendu et le pointage
  const abscisse = (/** @type {PointCale} */ p) => (p.x - cx) * Math.cos(r) + (p.y - cy) * Math.sin(r);
  const [a, b] = points, xa = abscisse(a), xb = abscisse(b), delta = ecartAngle(b.relevementDeg - a.relevementDeg);
  if (Math.abs(delta) < ECART_MIN_DEG) return { ok: false, message: `les deux repères ne sont écartés que de ${Math.abs(delta).toFixed(1)}° : choisissez-en deux à plus de ${ECART_MIN_DEG}° l'un de l'autre` };
  if (Math.abs(xb - xa) < ECART_MIN_ECRAN * ecran.largeurPx) return { ok: false, message: 'les deux points touchés sont trop proches sur l’écran' };
  if ((xb - xa) * delta <= 0) return { ok: false, message: 'les deux repères sont dans l’ordre inverse de l’écran : vérifiez lesquels vous avez touchés' };
  // écart angulaire entre les deux points pour une focale donnée : décroît quand la focale grandit → recherche par dichotomie
  const ecartPour = (/** @type {number} */ f) => Math.atan(xb / f) - Math.atan(xa / f);
  const cible = delta * RAD;
  let bas = ecran.largeurPx / 40, haut = ecran.largeurPx * 40;
  for (let i = 0; i < 80; i++) { const m = (bas + haut) / 2; if (Math.abs(ecartPour(m)) > Math.abs(cible)) bas = m; else haut = m; }
  const f = (bas + haut) / 2, champAfficheDeg = (2 * Math.atan(ecran.largeurPx / 2 / f)) / RAD;
  // champ du capteur dont le champ affiché est celui-là (champAffiche croît avec le champ du capteur)
  let lo = CHAMP_MIN_DEG, hi = CHAMP_MAX_DEG;
  if (champAffiche(lo) > champAfficheDeg || champAffiche(hi) < champAfficheDeg) return { ok: false, message: `champ trouvé (${champAfficheDeg.toFixed(0)}°) hors des valeurs possibles : repères mal identifiés ?` };
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (champAffiche(m) < champAfficheDeg) lo = m; else hi = m; }
  const camFov = Math.round(((lo + hi) / 2) * 2) / 2;
  // cap réel de la caméra : moyenne des deux repères
  const capReel = (a.relevementDeg - Math.atan(xa / f) / RAD + (a.relevementDeg + ecartAngle(b.relevementDeg - a.relevementDeg) - Math.atan(xb / f) / RAD)) / 2;
  return { ok: true, camFov, champAfficheDeg, focalePx: f, correctionCapDeg: ecartAngle(capReel - capDeg) };
}
