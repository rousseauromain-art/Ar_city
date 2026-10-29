// @ts-check
/**
 * Message central et bandeau d'état en langage courant : le nombre de lieux, puis UNIQUEMENT ce qui ne va pas (le détail technique est dans le diagnostic).
 * Fonctions pures (v1 : fin de `draw`). Entrées : compteurs et états de l'application. Sorties : textes.
 */

/**
 * Message au centre de l'écran (vide s'il n'y a rien à dire).
 * @param {{erreurCamera: string, photo: boolean, pos: unknown, nbLieux: number, nbListe: number, rayonKm: number, capteur: boolean}} e
 */
export function messageCentral({ erreurCamera, photo, pos, nbLieux, nbListe, rayonKm, capteur }) {
  if (erreurCamera && !photo) return erreurCamera;
  if (!pos) return 'En attente du GPS…';
  if (!nbLieux) return '';
  if (!nbListe) return `Aucun lieu dans un rayon de ${rayonKm} km`;
  return !capteur && !photo ? 'Pas de boussole : glissez pour tourner' : '';
}

/**
 * Bandeau d'état.
 * @param {{affiches: number, pos: unknown, precisionM: number, chargement: boolean, source: string, relief: boolean, etatRelief: string, capteur: boolean, photo: boolean,
 *   air: boolean, sea: boolean, messageAir: string, messageSea: string}} e
 */
export function texteStatut({ affiches, pos, precisionM, chargement, source, relief, etatRelief, capteur, photo, air, sea, messageAir, messageSea }) {
  /** @type {string[]} */
  const problemes = [];
  if (!pos) problemes.push('GPS en attente'); else if (precisionM > 50) problemes.push(`GPS imprécis (±${Math.round(precisionM)} m)`);
  if (chargement) problemes.push('chargement des lieux…');
  else if (/^liste int/.test(source)) problemes.push('hors ligne : grandes villes seulement');
  else if (/^atlas/.test(source)) problemes.push('hors ligne : lieux mémorisés');
  if (relief) { if (/^calcul/.test(etatRelief)) problemes.push('relief en calcul…'); else if (etatRelief === 'indispo') problemes.push('relief indisponible'); }
  if (pos && !capteur && !photo) problemes.push('pas de boussole');
  const trafic = (air && messageAir ? ' · ' + messageAir : '') + (sea && messageSea ? ' · ' + messageSea : '');
  return `${affiches} lieux` + problemes.map((t) => ' · ' + t).join('') + trafic;
}
