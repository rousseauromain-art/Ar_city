// @ts-check
/**
 * Lecture des métadonnées JPEG (EXIF) : position GPS, direction, focale équivalente 24×36, heure de prise de vue.
 * Entrée : ArrayBuffer d'un fichier JPEG. Sortie : objet `Exif` ou null. Fonctions pures (v1 : `readExif`, `exifTiff`).
 * Dépend de : constantes.js, maths.js.
 */
import { RAD, DIAGONALE_24X36_MM } from './constantes.js';
import { normaliserCap } from './maths.js';

/**
 * @typedef {object} Exif
 * @property {string} make @property {string} model @property {number} orient orientation EXIF (1 = normale)
 * @property {string} date @property {number|null} f35 focale équivalente 24×36 (mm)
 * @property {number} [lat] @property {number} [lon]
 * @property {number} [dir] direction GPS (°) @property {string} [dirRef]
 * @property {number} [gpsUtc] @property {number} [utc] instant de prise de vue (ms UTC) @property {string} [timeSrc]
 */

/** Taille en octets d'un type EXIF (index = type). */
const TAILLE_TYPE = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8];

/** @param {ArrayBuffer} buf @returns {Exif | null} */
export function lireExif(buf) {
  const v = new DataView(buf);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xFFD8) return null;
  let o = 2;
  while (o + 4 < v.byteLength) {
    const m = v.getUint16(o), len = v.getUint16(o + 2);
    if (m === 0xFFE1 && v.getUint32(o + 4) === 0x45786966) return lireTiff(v, o + 10);
    if ((m & 0xFF00) !== 0xFF00) break;
    o += 2 + len;
  }
  return null;
}

/** @param {DataView} v @param {number} t début du bloc TIFF @returns {Exif} */
function lireTiff(v, t) {
  const le = v.getUint16(t) === 0x4949;
  const u16 = (/** @type {number} */ p) => v.getUint16(p, le), u32 = (/** @type {number} */ p) => v.getUint32(p, le);
  const rat = (/** @type {number} */ p) => { const d = u32(p + 4); return d ? u32(p) / d : 0; };
  /** @param {number} off @returns {Record<number, any>} */
  const ifd = (off) => {
    /** @type {Record<number, any>} */
    const out = {};
    const n = u16(t + off);
    for (let i = 0; i < n; i++) {
      const e = t + off + 2 + i * 12, tag = u16(e), type = u16(e + 2), cnt = u32(e + 4);
      const sz = TAILLE_TYPE[type] || 1, vo = cnt * sz > 4 ? t + u32(e + 8) : e + 8;
      /** @type {any} */
      let val;
      if (type === 2) { let s = ''; for (let k = 0; k < cnt - 1; k++) s += String.fromCharCode(v.getUint8(vo + k)); val = s.trim(); }
      else if (type === 3) val = cnt === 1 ? u16(vo) : Array.from({ length: cnt }, (_, k) => u16(vo + 2 * k));
      else if (type === 4) val = u32(vo);
      else if (type === 5) val = cnt === 1 ? rat(vo) : Array.from({ length: cnt }, (_, k) => rat(vo + 8 * k));
      else if (type === 1 || type === 7) val = v.getUint8(vo);
      out[tag] = val;
    }
    return out;
  };
  const i0 = ifd(u32(t + 4)), ex = i0[0x8769] ? ifd(i0[0x8769]) : {}, gps = i0[0x8825] ? ifd(i0[0x8825]) : {};
  const dms = (/** @type {any} */ a) => (Array.isArray(a) ? a[0] + a[1] / 60 + a[2] / 3600 : null);
  /** @type {Exif} */
  const r = { make: i0[0x010F] || '', model: [i0[0x010F], i0[0x0110]].filter(Boolean).join(' '), orient: i0[0x0112] || 1, date: ex[0x9003] || i0[0x0132] || '', f35: ex[0xA405] || null };
  if (gps[2] && gps[4]) { r.lat = dms(gps[2]) * (gps[1] === 'S' ? -1 : 1); r.lon = dms(gps[4]) * (gps[3] === 'W' ? -1 : 1); }
  if (gps[0x11] !== undefined) { r.dir = gps[0x11]; r.dirRef = gps[0x10]; }
  poserHeure(r, ex, gps);
  return r;
}

/**
 * Heure UTC de prise de vue. Priorité : heure de prise de vue + décalage horaire (OffsetTimeOriginal), puis heure GPS
 * (celle du dernier point GPS d'Android, parfois ancienne), puis heure locale du téléphone.
 * @param {Exif} r @param {Record<number, any>} ex @param {Record<number, any>} gps
 */
function poserHeure(r, ex, gps) {
  const dt = (/** @type {string} */ s) => { const m = /^(\d{4})[:-](\d\d)[:-](\d\d)[ T](\d\d):(\d\d):(\d\d)/.exec(s || ''); return m ? m.slice(1).map(Number) : null; };
  const gd = /^(\d{4}):(\d\d):(\d\d)/.exec(gps[0x1D] || ''), gt = gps[0x07], a = dt(r.date), off = /^([+-])(\d\d):(\d\d)/.exec(ex[0x9011] || ex[0x9010] || '');
  if (gd && Array.isArray(gt)) r.gpsUtc = Date.UTC(+gd[1], +gd[2] - 1, +gd[3], 0, 0, 0) + ((gt[0] * 60 + gt[1]) * 60 + gt[2]) * 1000;
  if (a && off) { r.utc = Date.UTC(a[0], a[1] - 1, a[2], a[3], a[4], a[5]) - (off[1] === '-' ? -1 : 1) * (+off[2] * 60 + +off[3]) * 60000; r.timeSrc = 'heure de prise de vue + décalage horaire'; }
  else if (r.gpsUtc) { r.utc = r.gpsUtc; r.timeSrc = 'heure GPS (dernier point GPS, peut être ancienne)'; }
  else if (a) { r.utc = new Date(a[0], a[1] - 1, a[2], a[3], a[4], a[5]).getTime(); r.timeSrc = 'heure locale (fuseau du téléphone supposé)'; }
}

/**
 * Champ de vision (°) du grand côté de l'image, d'après la focale équivalente 24×36, arrondi au demi-degré (v1 : `enterPhoto`).
 * @param {number} f35Mm @param {number} largeurPx @param {number} hauteurPx
 */
export function champDepuisFocale(f35Mm, largeurPx, hauteurPx) {
  const dd = 2 * Math.atan(DIAGONALE_24X36_MM / 2 / f35Mm);
  return Math.round((2 * Math.atan(Math.tan(dd / 2) * Math.max(largeurPx, hauteurPx) / Math.hypot(largeurPx, hauteurPx)) / RAD) * 2) / 2;
}

/**
 * Direction de l'objectif d'après l'EXIF. Le Pixel enregistre la direction du HAUT du téléphone : à l'horizontale,
 * l'écart est de +90° (orientation 1) ou -90° (orientation 3). En portrait, la direction est peu fiable.
 * @param {Exif | null} exif @param {number} largeurPx @param {number} hauteurPx
 * @returns {{capDeg: number | null, correctionDeg: number, peuFiable: boolean}}
 */
export function directionPhoto(exif, largeurPx, hauteurPx) {
  const google = !!exif && /google/i.test(exif.make || '');
  const correctionDeg = exif && exif.dir !== undefined && google ? (exif.orient === 1 ? 90 : exif.orient === 3 ? -90 : 0) : 0;
  const peuFiable = !exif || exif.dir === undefined || (google && (exif.orient === 6 || exif.orient === 8 || hauteurPx > largeurPx));
  return { capDeg: exif && exif.dir !== undefined ? normaliserCap(exif.dir + correctionDeg) : null, correctionDeg, peuFiable };
}

