// @ts-check
/**
 * « CALER AUTO » : une seule démarche, dans l'ordre de la v1 (j) : 1. le SOLEIL s'il est dans l'image (direction exacte, cap et horizon d'un coup) ; 2. le RELIEF (l'horizon lu dans l'image
 * comparé à la silhouette théorique : cap, horizon et, en montagne, champ) avec ses garde-fous ; 3. les REPÈRES vus (tours, clochers, dômes) quand le relief ne suffit pas (ville, horizon plat).
 * Garde-fous : ville dense et relief < 3° (la limite du ciel est faite des toits) ; moins de 25 colonnes d'horizon ; coût > 0,6° ; en direct, horizon déplacé de plus de 3°.
 * Fonction asynchrone SANS effet de bord : elle renvoie le message et les corrections ; `ui/page.js` les applique (S.headOff, S.pitchOff, S.camFov, pause de la boussole, mémorisation).
 * Reprend `runAutoAlign0` de la v1. Dépend de : calage/horizon.js, calage/reperes.js.
 */
import { RAD } from '../noyau/constantes.js';
import { tableRelief, elevationRelief, observerHorizon, nettoyerPointsHorizon, ajusterHorizon } from './horizon.js';
import { calerSurReperes } from './reperes.js';

/** Coût maximal (°) de l'ajustement sur le relief, et décalage d'horizon maximal (°) accepté en direct (le capteur d'inclinaison est juste à ~1°). v1 : 0,6 et 3. */
export const COUT_MAX_DEG = 0.6, HORIZON_MAX_DIRECT_DEG = 3;
/** Colonnes d'horizon minimales, et relief minimal (°) en ville dense pour que le relief ait un sens. */
export const COLONNES_MIN = 25, RELIEF_VILLE_DENSE_MIN_DEG = 3;

/** @typedef {{capDeg: number, inclinaisonDeg: number, roulisDeg: number}} PoseAuto */
/**
 * @typedef {object} ContexteAuto
 * @property {{lat: number, lon: number} | null} pos @property {PoseAuto} pose @property {number} camFov champ du capteur (réglage) @property {{largeurPx: number, hauteurPx: number}} ecran
 * @property {(cam: number) => number} champAffiche champ affiché pour un champ de capteur @property {boolean} photo photo rejouée (pas de garde-fou sur l'horizon : l'inclinaison n'est pas mesurée)
 * @property {boolean} villeDense @property {boolean} avecRelief réglage « masquer ce qui est caché par le relief » @property {number} [correctionOeilM]
 * @property {() => Promise<void>} attendreRelief relance le relief s'il est périmé et attend (au plus 8 s)
 * @property {() => ArrayLike<Float32Array> | null} relief masque du relief (`terrain.pm`) ou null @property {() => import('./soleil.js').ResultatSoleil} soleil calage sur le soleil (calage/soleil.js)
 * @property {(largeurPx: number) => import('./horizon.js').Luminance | null} lireLuminance @property {(pose: PoseAuto, focalePx: number) => import('../vision/silhouette-ciel.js').SilhouetteCiel | null} lireSilhouette
 * @property {import('./reperes.js').ElementRepere[]} liste éléments affichés @property {boolean} [permutation] refuser les concordances fortuites de repères (défaut oui ; `false` redonne la v1 (j))
 */
/**
 * @typedef {object} ResultatAuto
 * @property {string} message texte pour la note @property {boolean} applique des corrections sont à appliquer @property {number} dh correction de cap (°) @property {number} dp correction d'horizon (°)
 * @property {number | null} champ nouveau champ du capteur (°), ou null @property {'soleil' | 'relief' | 'reperes' | 'aucune'} source
 */

const f = (/** @type {number} */ v) => (v >= 0 ? '+' : '') + v.toFixed(1) + '°';

/** @param {ContexteAuto} c @returns {Promise<ResultatAuto>} */
export async function calerAutomatiquement(c) {
  /** @type {ResultatAuto} */
  const rien = { message: '', applique: false, dh: 0, dp: 0, champ: null, source: 'aucune' };
  if (!c.pos) return { ...rien, message: 'GPS indisponible' };
  try {
    const parRepères = (/** @type {string} */ pourquoi) => {
      const L = calerSurReperes({ pose: c.pose, camFov: c.camFov, ecran: c.ecran, champAffiche: c.champAffiche, lireSilhouette: c.lireSilhouette, liste: c.liste, permutation: c.permutation !== false, avecRelief: c.avecRelief, correctionOeilM: c.correctionOeilM });
      if (!L.ok) return { ...rien, message: `${pourquoi} · repères : ${L.msg}` };
      return { message: `calé sur ${L.names.slice(0, 3).join(', ')} : cap ${f(L.corr)}${L.cam !== L.cam0 ? ` · champ ${L.cam}°` : ''}`, applique: true, dh: L.corr, dp: 0, champ: L.cam !== L.cam0 ? L.cam : null, source: /** @type {const} */ ('reperes') };
    };
    // 1) le soleil, s'il est dans l'image : direction exacte, cap et horizon d'un coup
    const SA = c.soleil();
    if (SA.ok) return { message: `calé sur le soleil (${SA.soleil.azDeg.toFixed(1)}°, ${SA.soleil.elDeg.toFixed(1)}° de haut) : cap ${f(SA.dh)}, horizon ${f(SA.dp)}`, applique: true, dh: SA.dh, dp: SA.dp, champ: null, source: 'soleil' };
    // le relief n'est attendu (au plus 8 s) que s'il sert : la v1 attendait avant même de chercher le soleil, qui n'en dépend pas — même résultat, plus vite
    await c.attendreRelief();
    const pm = c.relief();
    if (!pm) return parRepères('relief indisponible');
    // 2) le relief
    const P = c.pose, cam0 = c.camFov, fh = (c.ecran.largeurPx / 2) / Math.tan(c.champAffiche(cam0) / 2 * RAD), tab = tableRelief(pm);
    let lo = 90, hi = -90;
    const half = c.champAffiche(cam0) / 2 + 22;
    for (let b = -half; b <= half; b += 1) { const e = elevationRelief(tab, P.capDeg + b); if (e < lo) lo = e; if (e > hi) hi = e; }
    // ville dense : la limite du ciel est faite des TOITS, pas du relief lointain (Alpes à 1-2° de haut) ; aligner l'un sur l'autre donne un calage faux mais « précis » → repères, ou rien
    if (c.villeDense && hi - lo < RELIEF_VILLE_DENSE_MIN_DEG) return parRepères('ville dense : la limite du ciel est faite des toits, pas du relief');
    const fr = c.lireLuminance(320);
    if (!fr) return { ...rien, message: 'image caméra illisible' };
    const CL = nettoyerPointsHorizon(observerHorizon(fr, P, fh, lo - 4, hi + 4, c.ecran), c.lireSilhouette(P, fh), P, fh, c.ecran), pts = CL.pts;
    if (pts.length < COLONNES_MIN) return parRepères(`horizon peu visible (${pts.length} colonnes)`);
    const R = ajusterHorizon(pts, P, cam0, tab, c.ecran, c.champAffiche);
    if (R.cost > COUT_MAX_DEG) return parRepères(`relief incertain (écart ${R.cost.toFixed(2)}°)`);
    // horizon déplacé de plus de 3° en direct (inclinaison mesurée par le téléphone, juste à ~1°) : le bord lu n'est pas le relief (toits, arbres)
    if (!c.photo && Math.abs(R.dp) > HORIZON_MAX_DIRECT_DEG) return parRepères(`le bord lu est ${Math.abs(R.dp).toFixed(1)}° ${R.dp < 0 ? 'au-dessus' : 'en dessous'} du relief (toits ou arbres devant)`);
    if (R.flat) {
      const lm = calerSurReperes({ pose: c.pose, camFov: c.camFov, ecran: c.ecran, champAffiche: c.champAffiche, lireSilhouette: c.lireSilhouette, liste: c.liste, permutation: c.permutation !== false, avecRelief: c.avecRelief, correctionOeilM: c.correctionOeilM });
      if (lm.ok) return { message: `horizon ${f(R.dp)} · cap calé sur ${lm.names.slice(0, 3).join(', ')} ${f(lm.corr)}`, applique: true, dh: lm.corr, dp: R.dp, champ: lm.cam !== lm.cam0 ? lm.cam : null, source: 'reperes' };
      return { message: `horizon calé (${f(R.dp)}) · cap inchangé : pas assez de relief visible`, applique: true, dh: R.dh, dp: R.dp, champ: R.cam !== cam0 ? R.cam : null, source: 'relief' };
    }
    return { message: `calé : cap ${f(R.dh)} · horizon ${f(R.dp)}${R.cam !== cam0 ? ` · champ ${R.cam}°` : ''} · précision ±${R.cost.toFixed(2)}°`, applique: true, dh: R.dh, dp: R.dp, champ: R.cam !== cam0 ? R.cam : null, source: 'relief' };
  } catch (e) { return { ...rien, message: 'échec du calage : ' + (e instanceof Error ? e.message : String(e)) }; }
}
