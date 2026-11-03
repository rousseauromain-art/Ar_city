// @ts-check
/**
 * ENTRÉE « DIRECT » (partie pure) : de l'orientation du téléphone (boussole et gyroscope) au cap, à l'inclinaison et au roulis de la caméra arrière.
 * La boussole (magnétomètre) se trompe différemment selon la direction visée (pierre, métal, voitures) : on suit donc les rotations au GYROSCOPE (orientation relative,
 * insensible au magnétisme, dérive lente) et la boussole ne sert plus qu'à fixer le nord. L'écart boussole − gyroscope est moyenné PAR DIRECTION (12 secteurs de 30°), puis
 * entre directions : l'erreur qui dépend de la direction s'annule. Après un calage, la boussole est mise en pause (le calage reste vrai quand on tourne). Un désaccord de plus de 40°
 * pendant 2 s ne peut pas être une déviation magnétique (le repère du gyroscope a été remis à zéro par le navigateur) : retour immédiat à la boussole.
 * Reprend `onOrient`, `gyroLearn`, `camAxes` et `pose` de la v1, avec l'horloge passée en paramètre. Aucune dépendance au DOM : testable sous Node.
 * Entrées : événements d'orientation, réglages, instant. Sortie : pose. Dépend de : noyau/constantes.js, noyau/maths.js.
 */
import { RAD } from '../noyau/constantes.js';
import { ecartAngle } from '../noyau/maths.js';

/** Désaccord (°) entre la boussole et le gyroscope au-delà duquel la boussole est jugée PERTURBÉE (métal, voiture, rue) : on l'ignore, le cap suit le gyroscope, le calage tient. Durée (ms) d'accord retrouvé avant de lui refaire confiance. */
export const GYRO_SAUT_DEG = 40, ACCORD_RETABLI_MS = 2000;
/** Saut instantané du cap relatif BRUT entre deux mesures successives (°) : le repère du gyroscope a été réinitialisé (le téléphone ne tourne pas de 40° en une mesure). Écart maximal entre ces deux mesures (ms), inclinaison (°) au-delà de laquelle le cap n'est plus défini (caméra vers le haut ou le bas). */
export const SAUT_INSTANTANE_DEG = 40, SAUT_ECART_MAX_MS = 500, INCLINAISON_CAP_DEFINI_DEG = 70;
/** Lissage de chaque nouvelle mesure, nombre et largeur des secteurs de direction, vitesse maximale de rattrapage du gyroscope (°/s), demi-durée d'oubli d'un secteur (ms). */
export const LISSAGE = 0.18, NB_SECTEURS = 12, LARGEUR_SECTEUR_DEG = 30, RATTRAPAGE_DEG_S = 0.5, OUBLI_SECTEUR_MS = 600000;
/** Âge maximal (ms) de la dernière mesure du gyroscope pour qu'on s'y fie. */
const FRAICHEUR_GYRO_MS = 1500;

/** @typedef {[number, number, number]} Vec3 */
/**
 * État de la fusion (muté par `surOrientation`).
 * @typedef {object} Fusion
 * @property {Vec3 | null} svAbs @property {Vec3 | null} srAbs axe caméra et axe « droite de l'écran », repère absolu (boussole)
 * @property {Vec3 | null} svRel @property {Vec3 | null} srRel idem, repère relatif (gyroscope) @property {number} relT instant de la dernière mesure relative
 * @property {number | null} gyroK cap du repère du gyroscope @property {number} gyroKT @property {number} magPauseUntil la boussole est en pause jusqu'à cet instant
 * @property {number} perturbeeDepuis début du désaccord boussole / gyroscope en cours (0 : aucun) @property {boolean} boussolePerturbee la boussole est ignorée (désaccord de plus de 40°) @property {number} accordDepuis début de l'accord retrouvé (0 : aucun)
 * @property {number | null} relBrut @property {number} relBrutT cap relatif BRUT de la dernière mesure et son instant (détection du saut instantané) @property {boolean} sautRelatif un saut instantané vient d'être vu @property {boolean} reouverture l'appli ou la caméra vient d'être rouverte @property {boolean} reouvAbs @property {boolean} reouvRel une mesure de chaque capteur a été reçue depuis la réouverture
 * @property {number} gyroResets nombre de VRAIS retours à la boussole (saut instantané ou réouverture)
 * @property {({v: number, t: number, n: number} | null)[]} magBins écart boussole − gyroscope appris par secteur @property {boolean} capteur au moins une mesure reçue
 */
/**
 * @typedef {object} MesureOrientation
 * @property {number | null} alpha @property {number | null} beta @property {number | null} gamma
 * @property {number} [webkitCompassHeading] cap de la boussole d'iOS @property {number} angleEcran rotation de l'écran (0, 90, 180, 270 ou −90)
 */

/** @returns {Fusion} */
export const creerFusion = () => ({ svAbs: null, srAbs: null, svRel: null, srRel: null, relT: 0, gyroK: null, gyroKT: 0, magPauseUntil: 0, perturbeeDepuis: 0, boussolePerturbee: false, accordDepuis: 0, relBrut: null, relBrutT: 0, sautRelatif: false, reouverture: false, reouvAbs: false, reouvRel: false, gyroResets: 0,
  magBins: /** @type {Fusion['magBins']} */ (new Array(NB_SECTEURS).fill(null)), capteur: false });

/**
 * Axe de la caméra arrière (`v`) et axe « droite de l'écran » (`r`) dans le repère Est / Nord / Haut.
 * @param {number} alpha @param {number} beta @param {number} gamma @param {number} angleEcran
 * @returns {{v: Vec3, r: Vec3}}
 */
export function axesCamera(alpha, beta, gamma, angleEcran) {
  const a = alpha * RAD, b = beta * RAD, g = gamma * RAD;
  const cA = Math.cos(a), sA = Math.sin(a), cB = Math.cos(b), sB = Math.sin(b), cG = Math.cos(g), sG = Math.sin(g);
  /** @type {Vec3} */
  const x = [cA * cG - sA * sB * sG, cG * sA + cA * sB * sG, -cB * sG];
  /** @type {Vec3} */
  const y = [-cB * sA, cA * cB, sB];
  /** @type {Vec3} */
  const z = [cG * sA * sB + cA * sG, sA * sG - cA * cG * sB, cB * cG];
  /** @type {Vec3} */
  const v = [-z[0], -z[1], -z[2]];
  const neg = (/** @type {Vec3} */ k) => /** @type {Vec3} */ (k.map((q) => -q));
  const r = angleEcran === 90 ? y : (angleEcran === 270 || angleEcran === -90) ? neg(y) : angleEcran === 180 ? neg(x) : x;
  return { v, r };
}

/** Cap (°, 0 à 360) d'un vecteur. @param {Vec3} v */
const capDe = (v) => (Math.atan2(v[0], v[1]) / RAD + 360) % 360;

/** @param {Vec3 | null} p @param {Vec3} n @returns {Vec3} */
const lisser = (p, n) => (p ? /** @type {Vec3} */ (p.map((q, i) => q + (n[i] - q) * LISSAGE)) : n);

/**
 * Une mesure d'orientation. `absolu` : événement `deviceorientationabsolute` (ou `absolute === true`).
 * @param {Fusion} f @param {MesureOrientation} e @param {boolean} absolu @param {number} t instant (ms)
 * @returns {{reinitialise: boolean, cause: 'saut' | 'reouverture' | null, perturbation: 'debut' | 'fin' | null}} `reinitialise` : le repère du gyroscope vient d'être réinitialisé (saut instantané ou réouverture : à journaliser) ; `perturbation` : la boussole vient d'être jugée perturbée (`debut`) ou de nouveau fiable (`fin`)
 */
export function surOrientation(f, e, absolu, t) {
  if (e.alpha === null || e.beta === null || e.gamma === null || e.alpha === undefined || e.beta === undefined || e.gamma === undefined) return { reinitialise: false, cause: null, perturbation: null };
  const ios = typeof e.webkitCompassHeading === 'number' && !isNaN(e.webkitCompassHeading);
  if (ios || absolu) mesureAbsolue(f, axesCamera(ios ? 360 - /** @type {number} */ (e.webkitCompassHeading) : e.alpha, e.beta, e.gamma, e.angleEcran));
  if (ios || !absolu) mesureRelative(f, axesCamera(e.alpha, e.beta, e.gamma, e.angleEcran), t); // iOS : alpha brut = gyroscope
  f.capteur = true;
  return apprendre(f, t);
}

/** Mesure du repère absolu (boussole) : lissée, sauf juste après une réouverture (nouveau repère). @param {Fusion} f @param {{v: Vec3, r: Vec3}} A */
function mesureAbsolue(f, A) {
  if (f.reouverture) f.reouvAbs = true;
  f.svAbs = f.reouverture ? A.v : lisser(f.svAbs, A.v); f.srAbs = f.reouverture ? A.r : lisser(f.srAbs, A.r);
}

/** Mesure du repère relatif (gyroscope) : saut instantané détecté sur la valeur brute, lissage sauf après un saut ou une réouverture (nouveau repère). @param {Fusion} f @param {{v: Vec3, r: Vec3}} R @param {number} t */
function mesureRelative(f, R, t) {
  detecterSaut(f, R.v, t);
  const net = f.sautRelatif || f.reouverture;
  if (f.reouverture) f.reouvRel = true;
  f.svRel = net ? R.v : lisser(f.svRel, R.v); f.srRel = net ? R.r : lisser(f.srRel, R.r); f.relT = t;
}

/**
 * Saut instantané du repère du gyroscope : le cap relatif BRUT change de plus de 40° d'une mesure à la suivante (moins de 0,5 s). Pas évalué caméra vers le haut ou le bas (le cap n'y est plus défini).
 * @param {Fusion} f @param {Vec3} vBrut axe caméra brut (avant lissage) @param {number} t
 */
function detecterSaut(f, vBrut, t) {
  const n = Math.hypot(...vBrut) || 1, defini = Math.abs(vBrut[2] / n) < Math.sin(INCLINAISON_CAP_DEFINI_DEG * RAD), cap = capDe(vBrut);
  if (defini && f.relBrut !== null && t - f.relBrutT < SAUT_ECART_MAX_MS && Math.abs(ecartAngle(cap - f.relBrut)) > SAUT_INSTANTANE_DEG) f.sautRelatif = true;
  if (defini) { f.relBrut = cap; f.relBrutT = t; } else f.relBrut = null;
}

/** Le repère du gyroscope est réinitialisé (saut instantané ou réouverture) : retour à la boussole, secteurs réappris. @param {Fusion} f @param {number} t @param {number} diff écart boussole − gyroscope @param {number} bi secteur */
function reinitialiserRepere(f, t, diff, bi) {
  f.magBins.fill(null); f.magBins[bi] = { v: diff, t, n: 1 }; f.gyroK = diff; f.gyroKT = t; f.gyroResets++; f.magPauseUntil = 0;
  f.sautRelatif = false; f.reouverture = false; f.reouvAbs = false; f.reouvRel = false; f.perturbeeDepuis = 0; f.boussolePerturbee = false; f.accordDepuis = 0;
}

/**
 * La boussole est-elle perturbée ? Désaccord de plus de 40° avec le gyroscope SANS saut du gyroscope : on ignore la boussole (le cap reste celui du gyroscope, le calage tient) ; de nouveau fiable après 2 s d'accord.
 * @param {Fusion} f @param {number} t @param {boolean} desaccord @returns {'debut' | 'fin' | null}
 */
function suivrePerturbation(f, t, desaccord) {
  if (desaccord) { f.accordDepuis = 0; if (!f.boussolePerturbee) { f.boussolePerturbee = true; f.perturbeeDepuis = t; return 'debut'; } return null; }
  if (!f.boussolePerturbee) return null;
  if (!f.accordDepuis) f.accordDepuis = t;
  if (t - f.accordDepuis > ACCORD_RETABLI_MS) { f.boussolePerturbee = false; f.perturbeeDepuis = 0; f.accordDepuis = 0; return 'fin'; }
  return null;
}

/** Écart boussole − gyroscope par secteur de direction ; `gyroK` = cap du repère gyroscopique. @param {Fusion} f @param {number} t */
function apprendre(f, t) {
  const rien = { reinitialise: false, cause: /** @type {'saut' | 'reouverture' | null} */ (null), perturbation: /** @type {'debut' | 'fin' | null} */ (null) };
  if (!f.svAbs || !f.svRel || t - f.relT > FRAICHEUR_GYRO_MS) return rien;
  const ya = capDe(f.svAbs), yr = capDe(f.svRel), diff = ecartAngle(ya - yr), bi = Math.floor(ya / LARGEUR_SECTEUR_DEG) % NB_SECTEURS;
  if (f.reouverture && !(f.reouvAbs && f.reouvRel)) return rien; // on attend une mesure de chaque capteur après la réouverture
  if (f.gyroK !== null && (f.sautRelatif || f.reouverture)) { const cause = /** @type {'saut' | 'reouverture'} */ (f.sautRelatif ? 'saut' : 'reouverture'); reinitialiserRepere(f, t, diff, bi); return { reinitialise: true, cause, perturbation: null }; }
  const desaccord = f.gyroK !== null && Math.abs(ecartAngle(diff - f.gyroK)) > GYRO_SAUT_DEG, perturbation = suivrePerturbation(f, t, desaccord);
  if (desaccord || f.boussolePerturbee) { f.gyroKT = t; return { ...rien, perturbation }; } // boussole perturbée : ni apprentissage, ni rattrapage ; le cap suit le gyroscope
  rattraper(f, t, diff, bi);
  return { ...rien, perturbation };
}

/** Apprend l'écart du secteur courant, et rapproche le repère du gyroscope de la moyenne des secteurs (au plus 0,5°/s, jamais juste après un calage). @param {Fusion} f @param {number} t @param {number} diff @param {number} bi */
function rattraper(f, t, diff, bi) {
  const b = f.magBins[bi];
  f.magBins[bi] = b ? { v: b.v + ecartAngle(diff - b.v) * 0.05, t, n: b.n + 1 } : { v: diff, t, n: 1 };
  let sx = 0, sy = 0;
  for (const q of f.magBins) if (q) { const w = Math.exp(-(t - q.t) / OUBLI_SECTEUR_MS); sx += w * Math.cos(q.v * RAD); sy += w * Math.sin(q.v * RAD); }
  const cible = Math.atan2(sy, sx) / RAD;
  if (f.gyroK === null) { f.gyroK = cible; f.gyroKT = t; return; }
  const dt = Math.min(1, (t - f.gyroKT) / 1000); f.gyroKT = t;
  if (t < f.magPauseUntil) return; // calage récent : la boussole ne le défait pas
  const d = ecartAngle(cible - f.gyroK), pas = RATTRAPAGE_DEG_S * dt;
  f.gyroK += Math.max(-pas, Math.min(pas, d)); // au plus 0,5°/s
}

/**
 * L'appli ou la caméra vient d'être rouverte (retour au premier plan, caméra relancée) : le repère du gyroscope a pu être réinitialisé sans qu'on le voie. La prochaine mesure revient à la boussole, une fois.
 * @param {Fusion} f
 */
export function signalerReouverture(f) { f.reouverture = true; f.reouvAbs = false; f.reouvRel = false; f.relBrut = null; }

/** Après un calage (à la main ou automatique) : la boussole est mise en pause. @param {Fusion} f @param {number} t @param {number} [ms] */
export function noterCalage(f, t, ms) { f.magPauseUntil = Math.max(f.magPauseUntil, t + (ms || 600000)); }

/** Le cap vient-il du gyroscope ? @param {Fusion} f @param {{gyro?: boolean}} S @param {number} t */
export const gyroActif = (f, S, t) => S.gyro !== false && !!f.svRel && !!f.svAbs && f.gyroK !== null && t - f.relT < FRAICHEUR_GYRO_MS;

/**
 * Pose de la caméra : cap, inclinaison, roulis (°). Sans capteur : les réglages de calage seuls (glisser pour tourner).
 * @param {Fusion} f @param {{gyro?: boolean, headOff: number, pitchOff: number}} S @param {number} t
 * @returns {{capDeg: number, inclinaisonDeg: number, roulisDeg: number}}
 */
export function poseCapteurs(f, S, t) {
  if (!f.capteur) return { capDeg: (S.headOff + 360) % 360, inclinaisonDeg: S.pitchOff, roulisDeg: 0 };
  const g = gyroActif(f, S, t), vv = /** @type {Vec3} */ ((g ? f.svRel : f.svAbs || f.svRel)), rr = /** @type {Vec3} */ ((g ? f.srRel : f.svAbs ? f.srAbs : f.srRel));
  const n = Math.hypot(...vv) || 1, v = vv.map((k) => k / n);
  const capDeg = (Math.atan2(v[0], v[1]) / RAD + (g ? /** @type {number} */ (f.gyroK) : 0) + S.headOff + 720) % 360;
  const inclinaisonDeg = Math.asin(Math.max(-1, Math.min(1, v[2]))) / RAD + S.pitchOff;
  const nr = Math.hypot(...rr) || 1, roulisDeg = Math.asin(Math.max(-1, Math.min(1, rr[2] / nr))) / RAD;
  return { capDeg, inclinaisonDeg, roulisDeg };
}

/**
 * Valeurs instantanées de la fusion, pour le diagnostic et pour comprendre un saut de cap : cap de la boussole, cap du gyroscope, repère du gyroscope, âge de la dernière mesure.
 * @param {Fusion} f @param {number} t
 */
export function mesuresFusion(f, t) {
  return { capBoussole: f.svAbs ? capDe(f.svAbs) : null, capGyroscope: f.svRel ? capDe(f.svRel) : null, reperGyroscope: f.gyroK, ageGyroscopeMs: f.relT ? t - f.relT : null, retoursBoussole: f.gyroResets,
    secteursAppris: f.magBins.filter(Boolean).length, boussoleEnPause: t < f.magPauseUntil, boussolePerturbee: f.boussolePerturbee, desaccordDepuisMs: f.boussolePerturbee ? t - f.perturbeeDepuis : 0 };
}

/** Texte du diagnostic sur l'état de la fusion. @param {Fusion} f @param {{gyro?: boolean}} S @param {number} t */
export function etatFusion(f, S, t) {
  const nb = f.magBins.filter(Boolean);
  if (!f.svRel) return 'boussole seule (gyroscope non fourni par le navigateur)';
  if (!f.svAbs) return 'gyroscope seul (pas de nord magnétique)';
  const vals = nb.map((q) => /** @type {{v: number}} */ (q).v), ecart = vals.length > 1 ? Math.max(...vals.map((a) => Math.max(...vals.map((b) => Math.abs(ecartAngle(a - b)))))) : 0;
  return `${S.gyro === false ? 'boussole seule (gyroscope désactivé)' : 'gyroscope + boussole'}${f.boussolePerturbee ? ` · BOUSSOLE PERTURBÉE (ignorée depuis ${Math.round((t - f.perturbeeDepuis) / 1000)} s : le cap suit le gyroscope, le calage tient)` : ''}${f.gyroResets ? ` · ${f.gyroResets} retour(s) à la boussole (repère du gyroscope réinitialisé : saut instantané ou réouverture)` : ''} · ${nb.length}/${NB_SECTEURS} direction(s) apprise(s) · écart de la boussole selon la direction : ${ecart.toFixed(1)}°${t < f.magPauseUntil ? ' · boussole en pause (calage récent)' : ''}`;
}
