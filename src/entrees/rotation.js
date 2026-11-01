// @ts-check
/**
 * Écran resté en portrait alors que le téléphone est tenu en paysage (rotation automatique d'Android coupée) : l'image de la caméra et les noms sont alors de travers.
 * Détection en direct seulement : roulis de plus de 50° pendant plus de 1,5 s alors que `screen.orientation.type` est « portrait ». Le message
 * reste tant que le téléphone reste en paysage (hystérésis à 35°, sortie après 2 s), puis ne revient pas avant 5 minutes ; un toucher le ferme. Pur : l'horloge et les mesures sont fournies ; aucun DOM.
 */

/** Roulis (°) au-delà duquel le téléphone est tenu en paysage (entrée), et en dessous duquel il ne l'est plus (sortie : hystérésis, le roulis oscille quand on lève ou baisse la caméra). */
export const ROULIS_PAYSAGE_DEG = 50, ROULIS_SORTIE_DEG = 35;
/** Durée (ms) pendant laquelle la condition doit durer avant d'avertir, et pendant laquelle elle doit avoir cessé avant de retirer le message. */
export const DUREE_MIN_MS = 1500, SORTIE_MS = 2000;
/** Pause (ms) entre deux avertissements, comptée depuis la fin confirmée du précédent (ou sa fermeture au toucher). */
export const PAUSE_ENTRE_AVERTISSEMENTS_MS = 5 * 60 * 1000;
export const MESSAGE_ROTATION = 'Téléphone en paysage, écran en portrait : activez la rotation automatique (réglages rapides d\'Android)';

/** @typedef {{depuis: number | null, actif: boolean, dernierMs: number | null, horsDepuis: number | null}} EtatRotation depuis : début de la condition ; actif : le message est affiché ; dernierMs : fin du dernier avertissement ; horsDepuis : début de la sortie (message encore affiché) */

/** @returns {EtatRotation} */
export const etatRotationInitial = () => ({ depuis: null, actif: false, dernierMs: null, horsDepuis: null });

/**
 * Le message est fermé au toucher : il disparaît, la pause de 5 minutes commence.
 * @param {EtatRotation} _etat @param {number} maintenantMs @returns {EtatRotation}
 */
export const fermerRotation = (_etat, maintenantMs) => ({ depuis: null, actif: false, dernierMs: maintenantMs, horsDepuis: null });

/**
 * Entrée : roulis > 50° pendant > 1,5 s (écran portrait, direct). Maintien : tant que le roulis reste > 35° (une oscillation ne retire rien). Sortie : seulement après 2 s continues hors condition ; la pause de 5 min court alors.
 * @param {EtatRotation} etat @param {{direct: boolean, roulisDeg: number, typeEcran: string | null | undefined, maintenantMs: number}} e
 * @returns {{etat: EtatRotation, avertir: boolean, condition: boolean}} `avertir` : afficher le message maintenant
 */
export function evaluerRotation(etat, { direct, roulisDeg, typeEcran, maintenantMs }) {
  const portrait = direct && /^portrait/.test(typeEcran || ''), r = Math.abs(roulisDeg), entree = portrait && r > ROULIS_PAYSAGE_DEG, maintien = portrait && r > ROULIS_SORTIE_DEG;
  if (etat.actif) {
    if (maintien) return { etat: { ...etat, horsDepuis: null }, avertir: true, condition: true };
    const hors = etat.horsDepuis ?? maintenantMs;
    if (maintenantMs - hors > SORTIE_MS) return { etat: { depuis: null, actif: false, dernierMs: maintenantMs, horsDepuis: null }, avertir: false, condition: false };
    return { etat: { ...etat, horsDepuis: hors }, avertir: true, condition: false };
  }
  if (!entree) return { etat: { depuis: null, actif: false, dernierMs: etat.dernierMs, horsDepuis: null }, avertir: false, condition: false };
  const depuis = etat.depuis ?? maintenantMs;
  const dureeOk = maintenantMs - depuis > DUREE_MIN_MS, pauseOk = etat.dernierMs === null || maintenantMs - etat.dernierMs >= PAUSE_ENTRE_AVERTISSEMENTS_MS;
  if (dureeOk && pauseOk) return { etat: { depuis, actif: true, dernierMs: etat.dernierMs, horsDepuis: null }, avertir: true, condition: true };
  return { etat: { ...etat, depuis, horsDepuis: null }, avertir: false, condition: true };
}
