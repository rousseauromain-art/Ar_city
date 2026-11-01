// @ts-check
/**
 * Écran resté en portrait alors que le téléphone est tenu en paysage (rotation automatique d'Android coupée) : l'image de la caméra et les noms sont alors de travers.
 * Détection en direct seulement : roulis de plus de 50° pendant plus de 1,5 s alors que `screen.orientation.type` est « portrait ». Le message reste affiché tant que la condition dure,
 * disparaît dès qu'elle cesse, et ne revient pas avant 5 minutes. Pur : l'horloge et les mesures sont fournies ; aucun DOM.
 */

/** Roulis (°) au-delà duquel le téléphone est tenu en paysage. */
export const ROULIS_PAYSAGE_DEG = 50;
/** Durée (ms) pendant laquelle la condition doit durer avant d'avertir. */
export const DUREE_MIN_MS = 1500;
/** Pause (ms) entre deux avertissements. */
export const PAUSE_ENTRE_AVERTISSEMENTS_MS = 5 * 60 * 1000;
export const MESSAGE_ROTATION = 'Téléphone en paysage, écran en portrait : activez la rotation automatique (réglages rapides d\'Android)';

/** @typedef {{depuis: number | null, actif: boolean, dernierMs: number | null}} EtatRotation depuis : début de la condition ; actif : le message est affiché ; dernierMs : dernier affichage */

/** @returns {EtatRotation} */
export const etatRotationInitial = () => ({ depuis: null, actif: false, dernierMs: null });

/**
 * @param {EtatRotation} etat @param {{direct: boolean, roulisDeg: number, typeEcran: string | null | undefined, maintenantMs: number}} e
 * @returns {{etat: EtatRotation, avertir: boolean, condition: boolean}} `avertir` : afficher le message maintenant
 */
export function evaluerRotation(etat, { direct, roulisDeg, typeEcran, maintenantMs }) {
  const condition = direct && Math.abs(roulisDeg) > ROULIS_PAYSAGE_DEG && /^portrait/.test(typeEcran || '');
  if (!condition) return { etat: { depuis: null, actif: false, dernierMs: etat.dernierMs }, avertir: false, condition };
  const depuis = etat.depuis ?? maintenantMs;
  if (etat.actif) return { etat: { ...etat, depuis }, avertir: true, condition };
  const dureeOk = maintenantMs - depuis > DUREE_MIN_MS, pauseOk = etat.dernierMs === null || maintenantMs - etat.dernierMs >= PAUSE_ENTRE_AVERTISSEMENTS_MS;
  if (dureeOk && pauseOk) return { etat: { depuis, actif: true, dernierMs: maintenantMs }, avertir: true, condition };
  return { etat: { ...etat, depuis }, avertir: false, condition };
}
