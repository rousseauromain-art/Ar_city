// @ts-check
/**
 * Hauteur d'œil : le GPS PROPOSE, il n'impose pas (comportement de la v1 : l'œil est au sol du relief fin + 1,6 m). Une proposition n'existe que si l'altitude GPS s'écarte nettement du sol et qu'elle est fiable :
 * médiane d'au moins 10 mesures étalées sur au moins 20 s, précision annoncée d'au plus 10 m, écart au sol d'au moins 10 m. Cas visés : tour, toit, falaise, sol connu seulement par le modèle 30 m hors de France.
 * Le recalage AUTOMATIQUE (case cochée) applique la même proposition, au plus toutes les 2 min, jamais quand le sol vient du relief fin et que l'écart est de moins de 15 m.
 * Pur : les mesures, l'horloge et le géoïde sont fournis ; aucun DOM. Dépend de : noyau/constantes.js, scene/hauteur-oeil.js.
 */
import { HAUTEUR_YEUX_M } from '../noyau/constantes.js';
import { ORIGINE_SOL } from './hauteur-oeil.js';

/** Étalement minimal (ms) et nombre minimal de mesures de l'échantillon ; durée (ms) gardée par l'entrée. */
export const ECHANTILLON_MIN_MS = 20000, MESURES_MIN = 10, HISTORIQUE_MS = 60000;
/** Précision annoncée maximale (m) et écart minimal au sol (m) pour proposer. */
export const PRECISION_MAX_M = 10, ECART_PROPOSITION_M = 10;
/** Recalage automatique : délai minimal entre deux recalages (ms), écart minimal quand le sol vient du relief fin (m), gain minimal sur la correction actuelle (m). */
export const DELAI_AUTO_MS = 120000, ECART_AUTO_RELIEF_FIN_M = 15, GAIN_MIN_M = 3;
/** Bornes de la correction, comme le curseur de la puce. */
const CORRECTION_MIN_M = -30, CORRECTION_MAX_M = 250;

/** @typedef {{t: number, altitudeM: number | null | undefined, precisionAltM: number | null | undefined}} MesureAltitude */
/**
 * @typedef {object} ResumeAltitudes
 * @property {number} n mesures valides @property {number} dureeMs étalement entre la première et la dernière @property {number | null} medianeM altitude médiane au niveau de la mer (géoïde retranché)
 * @property {number | null} precisionM médiane des précisions annoncées @property {{minM: number, maxM: number, ecartTypeM: number} | null} dispersion des 10 dernières mesures
 */

/** @param {number[]} v @returns {number | null} */
const mediane = (v) => { if (!v.length) return null; const s = v.slice().sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/**
 * Résumé des mesures d'altitude GPS : médiane (au niveau de la mer), précision, étalement et dispersion des 10 dernières.
 * @param {MesureAltitude[]} mesures @param {number} [ondulationM] géoïde à retrancher (Android) @returns {ResumeAltitudes}
 */
export function resumerAltitudes(mesures, ondulationM = 0) {
  const ok = mesures.filter((m) => typeof m.altitudeM === 'number' && Number.isFinite(m.altitudeM));
  if (!ok.length) return { n: 0, dureeMs: 0, medianeM: null, precisionM: null, dispersion: null };
  const hauteurs = ok.map((m) => /** @type {number} */ (m.altitudeM) - ondulationM), dernieres = hauteurs.slice(-10);
  const moy = dernieres.reduce((s, v) => s + v, 0) / dernieres.length;
  return {
    n: ok.length, dureeMs: ok[ok.length - 1].t - ok[0].t, medianeM: mediane(hauteurs),
    precisionM: mediane(ok.map((m) => m.precisionAltM).filter((p) => typeof p === 'number' && Number.isFinite(p))),
    dispersion: { minM: Math.min(...dernieres), maxM: Math.max(...dernieres), ecartTypeM: Math.sqrt(dernieres.reduce((s, v) => s + (v - moy) ** 2, 0) / dernieres.length) },
  };
}

/**
 * @typedef {ResumeAltitudes & {proposee: boolean, raison: string, ecartSolM: number | null, correctionM: number | null}} Proposition
 * `correctionM` : correction à appliquer à l'œil (sol + 1,6 m + correction) pour qu'il soit à l'altitude GPS ; `raison` : pourquoi il n'y a pas de proposition (vide sinon).
 */

/**
 * @param {{mesures: MesureAltitude[], solM: number, ondulationM?: number}} e @returns {Proposition}
 */
export function proposerCorrectionGps({ mesures, solM, ondulationM = 0 }) {
  const r = resumerAltitudes(mesures, ondulationM), refus = (/** @type {string} */ raison, /** @type {number | null} */ ecart = null) => ({ ...r, proposee: false, raison, ecartSolM: ecart, correctionM: null });
  if (Number.isNaN(solM)) return refus('sol inconnu');
  if (r.n < MESURES_MIN) return refus(`pas assez de mesures (${r.n} sur ${MESURES_MIN})`);
  if (r.dureeMs < ECHANTILLON_MIN_MS) return refus(`échantillon trop court (${Math.round(r.dureeMs / 1000)} s sur ${ECHANTILLON_MIN_MS / 1000})`);
  if (r.precisionM === null) return refus('précision de l\'altitude inconnue');
  if (r.precisionM > PRECISION_MAX_M) return refus(`précision annoncée trop faible (±${Math.round(r.precisionM)} m, il faut ${PRECISION_MAX_M} m au plus)`);
  const ecart = /** @type {number} */ (r.medianeM) - solM;
  if (Math.abs(ecart) < ECART_PROPOSITION_M) return refus(`écart au sol de ${Math.round(ecart)} m (moins de ${ECART_PROPOSITION_M} m)`, ecart);
  return { ...r, proposee: true, raison: '', ecartSolM: ecart, correctionM: Math.max(CORRECTION_MIN_M, Math.min(CORRECTION_MAX_M, Math.round(ecart - HAUTEUR_YEUX_M))) };
}

/** Le sol vient-il du relief fin (modèle de terrain IGN ~1 m) ? @param {string | null | undefined} origineSol */
export const solDuReliefFin = (origineSol) => origineSol === ORIGINE_SOL.fin || origineSol === ORIGINE_SOL.finRelu;

/**
 * Recalage automatique (case cochée) : la correction à appliquer, ou `null`. Rien si : pas de proposition, réglage à la main, dernier recalage de moins de 2 min,
 * sol du relief fin avec un écart de moins de 15 m, ou gain de moins de 3 m sur la correction actuelle.
 * @param {{proposition: Proposition, origineSol: string | null | undefined, derniereMs: number, maintenantMs: number, manuel: boolean, obsHeight: number}} e @returns {number | null}
 */
export function decisionAuto({ proposition, origineSol, derniereMs, maintenantMs, manuel, obsHeight }) {
  if (!proposition.proposee || manuel || maintenantMs - derniereMs < DELAI_AUTO_MS) return null;
  const c = /** @type {number} */ (proposition.correctionM);
  if (solDuReliefFin(origineSol) && Math.abs(/** @type {number} */ (proposition.ecartSolM)) < ECART_AUTO_RELIEF_FIN_M) return null;
  return Math.abs(c - obsHeight) >= GAIN_MIN_M ? c : null;
}
