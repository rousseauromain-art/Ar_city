// @ts-check
/**
 * Recalage CONTINU sur le soleil et la lune (VEILLE-ANCRAGE.md, action C) : quand l'astre est dans l'image, le nord se corrige tout seul, par petits pas, sans rien toucher. Pur : les détections, l'horloge et la vitesse de rotation sont fournies.
 * Une détection = écart (cap, horizon) entre la position calculée de l'astre et son disque vu dans l'image (calage/soleil.js). On n'applique que si deux détections successives concordent sur au moins 3 s, téléphone stable,
 * écart plausible (au-delà : reflet), cadence et cumul bornés ; le pas vaut la moitié de l'écart (lissage), et plus rien quand l'écart est sous 0,3° (convergé).
 */

/** Concordance (°) entre détections, durée minimale (ms) de l'accord, rotation maximale du téléphone (°/s). */
export const CONCORDANCE_DEG = 1, ACCORD_MIN_MS = 3000, ROTATION_MAX_DEG_S = 10;
/** Écart plausible : au-delà, probable reflet ou faux disque (°). Convergé en dessous (°). */
export const ECART_CAP_MAX_DEG = 15, ECART_HORIZON_MAX_DEG = 8, CONVERGE_DEG = 0.3;
/** Pause entre deux pas (ms), part de l'écart corrigée à chaque pas, cumul maximal de la session (°, comme `LM_MAX` du calage sur repères). */
export const PAUSE_PAS_MS = 10000, PART_PAS = 0.5, CUMUL_MAX_DEG = 20;
/** Détections gardées. */
export const HISTORIQUE_MAX = 6;

/** @typedef {{t: number, dh: number, dp: number}} Detection */
/** @typedef {{pas: {dh: number, dp: number} | null, raison: string}} DecisionContinue */

/** La plus longue série de détections concordantes qui se termine par la dernière. @param {Detection[]} detections */
function serieConcordante(detections) {
  const derniere = detections[detections.length - 1];
  let debut = detections.length - 1;
  while (debut > 0 && Math.abs(detections[debut - 1].dh - derniere.dh) <= CONCORDANCE_DEG && Math.abs(detections[debut - 1].dp - derniere.dp) <= CONCORDANCE_DEG) debut--;
  return detections.slice(debut);
}

/**
 * @param {{historique: Detection[], derniereMs: number, maintenantMs: number, cumulDeg: number, rotationDegS: number}} e
 * `historique` : détections récentes, la plus récente en dernier, vidée après chaque pas ; `cumulDeg` : somme des pas de cap déjà appliqués dans la session.
 * @returns {DecisionContinue}
 */
export function decisionCalageContinu({ historique, derniereMs, maintenantMs, cumulDeg, rotationDegS }) {
  if (rotationDegS > ROTATION_MAX_DEG_S) return { pas: null, raison: `téléphone en mouvement (${Math.round(rotationDegS)}°/s)` };
  if (historique.length < 2) return { pas: null, raison: 'en attente d\'une deuxième détection' };
  const dernieres = historique.slice(-HISTORIQUE_MAX), derniere = dernieres[dernieres.length - 1];
  // la série concordante la plus longue se terminant par la dernière détection
  const serie = serieConcordante(dernieres);
  if (serie.length < 2 || derniere.t - serie[0].t < ACCORD_MIN_MS) return { pas: null, raison: 'détections non concordantes ou trop récentes' };
  const dh = serie.reduce((s, d) => s + d.dh, 0) / serie.length, dp = serie.reduce((s, d) => s + d.dp, 0) / serie.length;
  if (Math.abs(dh) > ECART_CAP_MAX_DEG || Math.abs(dp) > ECART_HORIZON_MAX_DEG) return { pas: null, raison: `écart trop grand (${dh.toFixed(1)}° / ${dp.toFixed(1)}°) : reflet probable` };
  if (Math.abs(dh) < CONVERGE_DEG && Math.abs(dp) < CONVERGE_DEG) return { pas: null, raison: 'convergé' };
  if (maintenantMs - derniereMs < PAUSE_PAS_MS) return { pas: null, raison: 'pause entre deux pas' };
  let pasCap = dh * PART_PAS;
  const reste = CUMUL_MAX_DEG - Math.abs(cumulDeg + pasCap);
  if (reste < 0) pasCap = Math.sign(pasCap) * Math.max(0, CUMUL_MAX_DEG - Math.abs(cumulDeg));
  if (Math.abs(pasCap) < 0.05 && Math.abs(dp * PART_PAS) < 0.05) return { pas: null, raison: `cumul de ${CUMUL_MAX_DEG}° atteint` };
  return { pas: { dh: pasCap, dp: dp * PART_PAS }, raison: '' };
}
