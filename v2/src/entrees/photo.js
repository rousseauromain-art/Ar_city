// @ts-check
/**
 * ENTRÉE « PHOTO REJOUÉE » : d'un fichier JPEG, tout ce qu'il faut pour placer la scène comme sur place : position (EXIF, sinon position simulée), direction de l'objectif
 * (correction du Pixel), champ de vision (focale équivalente 24×36), heure de prise de vue. Fonctions pures : la lecture du fichier et de l'image (DOM) est dans ui/page-photo.js.
 * Reprend `enterPhoto` de la v1. Entrées : octets du fichier, dimensions de l'image, position simulée facultative. Sortie : `ReglagesPhoto` ou une raison de refus.
 * Dépend de : noyau/exif.js, noyau/maths.js.
 */
import { lireExif, champDepuisFocale, directionPhoto } from '../noyau/exif.js';

/**
 * @typedef {object} ReglagesPhoto
 * @property {{lat: number, lon: number}} pos @property {'photo' | 'simulee'} sourcePosition
 * @property {number} capDeg cap de départ (0 si la direction est absente) @property {number | null} champDeg champ du grand côté d'après la focale, ou null (garder le réglage actuel)
 * @property {number} correctionDeg correction du Pixel appliquée à la direction @property {boolean} directionAbsente @property {boolean} peuFiable
 * @property {string} direction texte du bandeau « photo 112° +90° (photo horizontale) = 202° » @property {number | null} utc instant de prise de vue (ms UTC) @property {string} sourceHeure
 * @property {number | null} gpsUtc @property {string} date @property {import('../noyau/exif.js').Exif | null} exif
 */

/**
 * Lit « 45.08, 7.67 » ou un lien de carte contenant @lat,lon.
 * @param {string} texte @returns {{lat: number, lon: number} | null}
 */
export function lirePositionTexte(texte) {
  const m = /(-?\d{1,3}(?:[.,]\d+)?)\s*[,; ]\s*(-?\d{1,3}(?:[.,]\d+)?)/.exec(String(texte || '').replace(/@/, ' '));
  if (!m) return null;
  const lat = parseFloat(m[1].replace(',', '.')), lon = parseFloat(m[2].replace(',', '.'));
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}

/**
 * @param {ArrayBuffer} octets @param {{largeurPx: number, hauteurPx: number, positionSimulee?: string}} o
 * @returns {{ok: true, photo: ReglagesPhoto} | {ok: false, raison: string}}
 */
export function analyserPhoto(octets, { largeurPx, hauteurPx, positionSimulee = '' }) {
  const exif = (() => { try { return lireExif(octets); } catch { return null; } })();
  const gps = exif && exif.lat !== undefined && exif.lon !== undefined ? { lat: exif.lat, lon: exif.lon } : null, pos = gps || lirePositionTexte(positionSimulee);
  if (!pos) return { ok: false, raison: 'Pas de position GPS dans ce fichier (photo prise dans la galerie ? ouvrez-la par le gestionnaire de fichiers), ni de position simulée à utiliser.' };
  const d = directionPhoto(exif, largeurPx, hauteurPx), absente = d.capDeg === null, capDeg = d.capDeg ?? 0;
  const champDeg = exif && exif.f35 ? champDepuisFocale(exif.f35, largeurPx, hauteurPx) : null;
  const dir = exif && exif.dir !== undefined
    ? `photo ${Math.round(exif.dir)}°${d.correctionDeg ? ` ${d.correctionDeg > 0 ? '+' : ''}${d.correctionDeg}° (photo horizontale) = ${Math.round(capDeg)}°` : ''}${d.peuFiable ? ' (portrait : peu fiable)' : ''}` : 'photo inconnu';
  return { ok: true, photo: { pos, sourcePosition: gps ? 'photo' : 'simulee', capDeg, champDeg, correctionDeg: d.correctionDeg, directionAbsente: absente, peuFiable: d.peuFiable, direction: dir,
    utc: exif && exif.utc !== undefined ? exif.utc : null, sourceHeure: (exif && exif.timeSrc) || '', gpsUtc: exif && exif.gpsUtc !== undefined ? exif.gpsUtc : null, date: (exif && exif.date) || '', exif } };
}

/**
 * Phrase d'information sous le bouton « Rejouer une photo » (v1 : `photoInfo`).
 * @param {ReglagesPhoto} p @param {number} champRetenuDeg
 */
export function texteInfoPhoto(p, champRetenuDeg) {
  const heure = p.utc !== null ? ` · prise de vue ${new Date(p.utc).toISOString().slice(0, 16).replace('T', ' ')} UTC (${p.sourceHeure})` : '';
  const ecart = p.utc !== null && p.gpsUtc !== null && Math.abs(p.gpsUtc - p.utc) > 120000 ? ` · attention : dernier point GPS daté ${new Date(p.gpsUtc).toISOString().slice(0, 16).replace('T', ' ')} UTC` : '';
  const f35 = p.exif && p.exif.f35;
  return `${p.sourcePosition === 'photo' ? 'position de la photo' : 'position simulée'} ${p.pos.lat.toFixed(5)}, ${p.pos.lon.toFixed(5)} · `
    + `${p.directionAbsente ? 'direction absente (0°) : glissez pour tourner' : 'direction ' + (p.exif && p.exif.dir !== undefined ? p.exif.dir.toFixed(0) : '?') + '°'} · `
    + `${f35 ? `focale ${f35} mm éq. → champ ${champRetenuDeg}°` : `focale absente : champ ${champRetenuDeg}° (réglage)`}${heure}${ecart}`;
}
