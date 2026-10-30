// @ts-check
/**
 * Carnet de calage (v1 : `calRecord`, `calLearned`, `calHtml`). Chaque calage (glisser, toucher un repère ou le soleil, « Caler auto », photo rejouée) devient une MESURE de l'erreur du capteur :
 * cap brut (boussole / gyroscope, ou direction enregistrée dans la photo) contre cap juste. Gardée sur l'appareil (500 dernières) et envoyée au relais (`/calib`) : un jeu de données par téléphone,
 * par lieu et par direction, pour savoir si l'écart vient du téléphone, du capteur, du lieu (métal, port) ou de la photo — et pour reprendre l'écart appris.
 * PUR : aucune horloge, aucun stockage, aucun réseau (ils sont fournis par app/carnet.js). Les arrondis (toFixed) et l'ordre des tests sont ceux de la v1.
 */
import { ecartAngle } from '../noyau/maths.js';
import { distanceEtCap } from '../noyau/geo.js';

/** Mesures gardées sur l'appareil. */
export const CARNET_MAX = 500;
/** Plusieurs glissers en moins de 20 s ne font qu'une mesure (la dernière remplace la précédente). */
export const FUSION_GLISSER_MS = 20000;
/** Écart appris : mesures à moins de 1 km, de moins de 30 jours ; sinon la direction brute à ±30°. */
export const RAYON_APPRIS_KM = 1, VALIDITE_APPRIS_MS = 30 * 86400000, SECTEUR_APPRIS_DEG = 30, SECTEURS_MIN = 2;
/** Mesures envoyées par requête au relais. */
export const LOT_ENVOI = 100;
/** En dessous, le calage n'a « rien changé » et rien n'est consigné (cap, horizon). */
export const BOUGE_MIN_DEG = 0.2;

/**
 * @typedef {object} Mesure
 * @property {number} t instant de la prise de vue (photo) ou du calage (ms) @property {number} rec instant de l'enregistrement (ms) @property {string} dev appareil @property {string} model @property {string} ua
 * @property {string} src @property {number} lat @property {number} lon @property {number | null} acc @property {number} hdg cap après calage @property {number} pitch @property {number} raw cap brut @property {number} off
 * @property {number} poff @property {number | null} dOff @property {number | null} dPitch @property {number} cam @property {boolean} gyro @property {{az: number, el: number} | null} sun
 * @property {{make: string, model: string, orient: number | null, dir: number | null, dirRef: string | null, dirCorr: number, w: number, h: number}} [photo]
 * @property {{sectors: number, spread: number, resets: number}} [mag] @property {string} [v] version du logiciel (v2)
 * @property {string} [msg] @property {string} [ref] @property {number} [refDist] @property {number | null} [refHeight]
 * @typedef {{mesures: Mesure[], file: Mesure[]}} Carnet mesures gardées et file d'attente d'envoi
 */

/**
 * @typedef {object} ContexteMesure
 * @property {string} src @property {{h: number, p: number} | null} avant calage avant le geste (null : pas de comparaison) @property {Record<string, unknown>} [extra]
 * @property {number} capDeg cap affiché après calage @property {number} inclinaisonDeg @property {number} headOff @property {number} pitchOff @property {number} camFov
 * @property {{lat: number, lon: number}} pos @property {number | null} precisionM @property {{azDeg: number, elDeg: number} | null} soleil
 * @property {number | null} utcPhotoMs instant de la prise de vue (photo rejouée), sinon null @property {number} maintenantMs
 * @property {string} appareil @property {string} modele @property {string} ua @property {boolean} gyro gyroscope utilisé (direct)
 * @property {null | {make: string, model: string, orient: number | null, dir: number | null, dirRef: string | null, dirCorr: number, w: number, h: number}} photo photo rejouée
 * @property {number[]} secteursMag écart boussole − gyroscope appris, par secteur (direct) @property {number} retoursBoussole
 */

/** @param {number} v @param {number} n */
const arrondi = (v, n) => +v.toFixed(n);

/**
 * Une mesure, ou `null` si rien n'a bougé. Reprend le corps de `calRecord`.
 * @param {ContexteMesure} c @returns {Mesure | null}
 */
export function creerMesure(c) {
  const off = ecartAngle(c.headOff), dOff = c.avant ? ecartAngle(c.headOff - c.avant.h) : null, dP = c.avant ? c.pitchOff - c.avant.p : null;
  if (c.avant && Math.abs(/** @type {number} */ (dOff)) < BOUGE_MIN_DEG && Math.abs(/** @type {number} */ (dP)) < BOUGE_MIN_DEG) return null; // rien n'a bougé
  const sun = c.soleil && c.soleil.elDeg > -1 ? { az: arrondi(c.soleil.azDeg, 2), el: arrondi(c.soleil.elDeg, 2) } : null;
  /** @type {Mesure} */
  const s = {
    t: c.utcPhotoMs ? c.utcPhotoMs : c.maintenantMs, rec: c.maintenantMs, dev: c.appareil, model: c.modele, ua: c.ua.slice(0, 160), src: c.src,
    lat: arrondi(c.pos.lat, 4), lon: arrondi(c.pos.lon, 4), acc: c.precisionM !== null && c.precisionM !== undefined ? Math.round(c.precisionM) : null, hdg: arrondi(c.capDeg, 2), pitch: arrondi(c.inclinaisonDeg, 2),
    raw: arrondi((c.capDeg - c.headOff + 720) % 360, 2), off: arrondi(off, 2), poff: arrondi(c.pitchOff, 2), dOff: dOff !== null ? arrondi(dOff, 2) : null, dPitch: dP !== null ? arrondi(dP, 2) : null,
    cam: c.camFov, gyro: !c.photo && !!c.gyro, sun,
  };
  Object.assign(s, c.extra || {});
  if (c.photo) {
    s.photo = { make: c.photo.make || '', model: c.photo.model || '', orient: c.photo.orient || null, dir: c.photo.dir !== null && c.photo.dir !== undefined ? c.photo.dir : null, dirRef: c.photo.dirRef || null, dirCorr: c.photo.dirCorr || 0, w: c.photo.w, h: c.photo.h };
    if (c.photo.dir !== null && c.photo.dir !== undefined) { s.raw = c.photo.dir; s.off = arrondi(ecartAngle(c.capDeg - c.photo.dir), 2); } // photo : erreur = cap juste − direction ENREGISTRÉE (sans correction)
  } else {
    const vals = c.secteursMag;
    s.mag = { sectors: vals.length, spread: vals.length > 1 ? arrondi(Math.max(...vals.map((a) => Math.max(...vals.map((b) => Math.abs(ecartAngle(a - b)))))), 1) : 0, resets: c.retoursBoussole };
  }
  return s;
}

/**
 * Ajoute une mesure au carnet (copie) : un glisser en plusieurs fois remplace le précédent pendant 20 s ; 500 dernières gardées, file d'envoi bornée de même.
 * @param {Carnet} carnet @param {Mesure} s @returns {Carnet}
 */
export function ajouterMesure(carnet, s) {
  const L = carnet.mesures.slice(), Q = carnet.file.slice(), last = L[L.length - 1];
  if (s.src === 'glisser' && last && last.src === 'glisser' && s.rec - last.rec < FUSION_GLISSER_MS && !!last.photo === !!s.photo) {
    s.dOff = arrondi(ecartAngle((last.dOff || 0) + (s.dOff || 0)), 2); L.pop();
    const qi = Q.findIndex((q) => q.rec === last.rec); if (qi >= 0) Q.splice(qi, 1);
  }
  L.push(s); Q.push(s);
  return { mesures: L.slice(-CARNET_MAX), file: Q.slice(-CARNET_MAX) };
}

/** Médiane (élément du milieu du tri croissant, comme la v1). @param {number[]} a */
export const mediane = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };

/**
 * Écart appris pour cet appareil, ici : mesures en direct (hors photo) de moins de 1 km et de moins de 30 jours ; sinon, avec au moins deux mesures, la direction brute à ±30°, tous lieux.
 * @param {Mesure[]} mesures @param {{pos: {lat: number, lon: number} | null, capDeg: number, headOff: number, appareil: string, maintenantMs: number}} e
 * @returns {{off: number, n: number, comment: string} | null}
 */
export function ecartAppris(mesures, { pos, capDeg, headOff, appareil, maintenantMs }) {
  if (!pos) return null;
  const raw = (capDeg - headOff + 720) % 360, L = mesures.filter((s) => !s.photo && s.dev === appareil && s.off !== null && s.off !== undefined);
  const proches = L.filter((s) => distanceEtCap(pos, s).distKm < RAYON_APPRIS_KM && maintenantMs - s.rec < VALIDITE_APPRIS_MS);
  if (proches.length) return { off: /** @type {number} */ (mediane(proches.map((s) => s.off))), n: proches.length, comment: `${proches.length} mesure(s) à moins de 1 km` };
  const secteur = L.filter((s) => Math.abs(ecartAngle(s.raw - raw)) < SECTEUR_APPRIS_DEG);
  if (secteur.length >= SECTEURS_MIN) return { off: /** @type {number} */ (mediane(secteur.map((s) => s.off))), n: secteur.length, comment: `${secteur.length} mesure(s) dans cette direction (±30°), tous lieux` };
  return null;
}

/**
 * Résumé du carnet pour le diagnostic (v1 : `calHtml`).
 * @param {Carnet} carnet @param {{appareil: string, modele: string, appris: ReturnType<typeof ecartAppris>}} e
 */
export function resumeCarnet(carnet, { appareil, modele, appris }) {
  const miennes = carnet.mesures.filter((s) => s.dev === appareil), par = /** @type {Record<string, number[]>} */ ({});
  for (const s of miennes) { const k = s.photo ? 'photo ' + (s.photo.model || '?') + (s.photo.w > s.photo.h ? ' paysage' : ' portrait') : s.src.split(':')[0]; (par[k] = par[k] || []).push(s.off); }
  return {
    appareil, modele: modele || 'modèle inconnu', nb: miennes.length, enAttente: carnet.file.length,
    parSource: Object.entries(par).map(([source, v]) => ({ source, medianeDeg: /** @type {number} */ (mediane(v)), n: v.length })),
    appris, dernieres: miennes.slice(-6).reverse(),
  };
}

/** La source d'un calage automatique d'après le résultat de calage/auto.js (la v1 la devinait par expression régulière sur le message). @param {'soleil' | 'lune' | 'relief' | 'reperes' | 'aucune'} source */
export const sourceAuto = (source) => (source === 'soleil' ? 'auto soleil' : source === 'lune' ? 'auto lune' : source === 'reperes' ? 'auto repères' : 'auto relief');
