// @ts-check
/**
 * Décodeur de tuiles vectorielles Mapbox (MVT, protobuf) : couches demandées, points et étiquettes. Fonctions pures, aucune dépendance.
 * Entrées : octets d'une tuile. Sorties : couches { name, extent, keys, values, features }. Ne décode QUE les couches demandées (une tuile
 * fait souvent plus de 100 Ko). Seul le type POINT est géré (le seul utilisé par `place` et `mountain_peak`). Reprend le décodeur de la v1.
 */

/** @typedef {{i: number}} Curseur */
/** @typedef {{tags: number[], type: number, geometry: number[]}} FeatureMVT */
/** @typedef {{name: string, extent: number, keys: string[], values: unknown[], features: FeatureMVT[]}} CoucheMVT */

/** @param {Uint8Array} buf @param {Curseur} pos */
function lireVarint(buf, pos) {
  let result = 0, shift = 0, b;
  do { b = buf[pos.i++]; result += (b & 0x7f) * Math.pow(2, shift); shift += 7; } while (b >= 0x80);
  return result;
}
/** @param {Uint8Array} buf @param {Curseur} pos @param {number} wireType */
function sauterChamp(buf, pos, wireType) {
  if (wireType === 0) lireVarint(buf, pos);
  else if (wireType === 2) { const len = lireVarint(buf, pos); pos.i += len; }
  else if (wireType === 5) pos.i += 4;
  else if (wireType === 1) pos.i += 8;
}
/** @param {Uint8Array} buf @param {Curseur} pos */
function lireChaine(buf, pos) { const len = lireVarint(buf, pos); const s = new TextDecoder().decode(buf.subarray(pos.i, pos.i + len)); pos.i += len; return s; }
/** @param {Uint8Array} buf @param {Curseur} pos */
function lireEmpile(buf, pos) { const len = lireVarint(buf, pos); const end = pos.i + len; const out = []; while (pos.i < end) out.push(lireVarint(buf, pos)); return out; }
const zigzag = (/** @type {number} */ n) => (n >>> 1) ^ (-(n & 1));

/** @param {Uint8Array} buf @param {Curseur} pos @returns {unknown} */
function lireValeur(buf, pos) {
  const len = lireVarint(buf, pos), end = pos.i + len;
  /** @type {unknown} */
  let v = null;
  while (pos.i < end) {
    const key = lireVarint(buf, pos), field = key >>> 3, wt = key & 7;
    if (field === 1 && wt === 2) v = lireChaine(buf, pos);
    else if (field === 2 && wt === 5) { v = new DataView(buf.buffer, buf.byteOffset + pos.i, 4).getFloat32(0, true); pos.i += 4; }
    else if (field === 3 && wt === 1) { v = new DataView(buf.buffer, buf.byteOffset + pos.i, 8).getFloat64(0, true); pos.i += 8; }
    else if ((field === 4 || field === 5) && wt === 0) v = lireVarint(buf, pos);
    else if (field === 6 && wt === 0) v = zigzag(lireVarint(buf, pos));
    else if (field === 7 && wt === 0) v = !!lireVarint(buf, pos);
    else sauterChamp(buf, pos, wt);
  }
  return v;
}
/** @param {Uint8Array} buf @param {Curseur} pos @returns {FeatureMVT} */
function lireFeature(buf, pos) {
  const len = lireVarint(buf, pos), end = pos.i + len;
  /** @type {FeatureMVT} */
  const f = { tags: [], type: 0, geometry: [] };
  while (pos.i < end) {
    const key = lireVarint(buf, pos), field = key >>> 3, wt = key & 7;
    if (field === 2 && wt === 2) f.tags = lireEmpile(buf, pos);
    else if (field === 3 && wt === 0) f.type = lireVarint(buf, pos);
    else if (field === 4 && wt === 2) f.geometry = lireEmpile(buf, pos);
    else sauterChamp(buf, pos, wt);
  }
  return f;
}
/** @param {Uint8Array} buf @returns {CoucheMVT} */
function decoderCouche(buf) {
  const pos = { i: 0 };
  /** @type {CoucheMVT} */
  const layer = { name: '', extent: 4096, keys: [], values: [], features: [] };
  while (pos.i < buf.length) {
    const key = lireVarint(buf, pos), field = key >>> 3, wt = key & 7;
    if (field === 1 && wt === 2) layer.name = lireChaine(buf, pos);
    else if (field === 5 && wt === 0) layer.extent = lireVarint(buf, pos);
    else if (field === 3 && wt === 2) layer.keys.push(lireChaine(buf, pos));
    else if (field === 4 && wt === 2) layer.values.push(lireValeur(buf, pos));
    else if (field === 2 && wt === 2) layer.features.push(lireFeature(buf, pos));
    else sauterChamp(buf, pos, wt);
  }
  return layer;
}
/** @param {Uint8Array} sub */
function nomDeCouche(sub) {
  const pos = { i: 0 };
  while (pos.i < sub.length) {
    const key = lireVarint(sub, pos), field = key >>> 3, wt = key & 7;
    if (field === 1 && wt === 2) return lireChaine(sub, pos);
    sauterChamp(sub, pos, wt);
  }
  return '';
}

/**
 * Décode les couches demandées d'une tuile (toutes si `couches` est omis).
 * @param {Uint8Array} buf @param {string[]} [couches]
 * @returns {Record<string, CoucheMVT>}
 */
export function decoderTuileMVT(buf, couches) {
  const pos = { i: 0 };
  /** @type {Record<string, CoucheMVT>} */
  const out = {};
  while (pos.i < buf.length) {
    const key = lireVarint(buf, pos), field = key >>> 3, wt = key & 7;
    if (field === 3 && wt === 2) {
      const len = lireVarint(buf, pos), sub = buf.subarray(pos.i, pos.i + len), name = nomDeCouche(sub);
      if (!couches || couches.includes(name)) out[name] = decoderCouche(sub);
      pos.i += len;
    } else sauterChamp(buf, pos, wt);
  }
  return out;
}

/** Points d'une feature de type POINT (1) : coordonnées locales de la tuile. @param {FeatureMVT} f @returns {[number, number][]} */
export function pointsDeFeature(f) {
  if (f.type !== 1) return [];
  const cmds = f.geometry;
  /** @type {[number, number][]} */
  const pts = [];
  let x = 0, y = 0, i = 0;
  while (i < cmds.length) {
    const cmdInt = cmds[i++], id = cmdInt & 0x7, count = cmdInt >>> 3;
    if (id === 1 || id === 2) { for (let k = 0; k < count; k++) { x += zigzag(cmds[i++]); y += zigzag(cmds[i++]); pts.push([x, y]); } }
    else if (id === 7) { /* ClosePath : pas de paramètres */ }
    else break;
  }
  return pts;
}

/** Étiquettes (clé → valeur) d'une feature. @param {FeatureMVT} f @param {CoucheMVT} layer @returns {Record<string, any>} */
export function etiquettesDeFeature(f, layer) {
  /** @type {Record<string, any>} */
  const t = {};
  for (let i = 0; i < f.tags.length; i += 2) t[layer.keys[f.tags[i]]] = layer.values[f.tags[i + 1]];
  return t;
}

/** Tuile contenant un point. @param {number} lon @param {number} lat @param {number} z */
export function tuileDepuisPoint(lon, lat, z) {
  const n = Math.pow(2, z), latRad = (lat * Math.PI) / 180;
  return { x: Math.floor(((lon + 180) / 360) * n), y: Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n) };
}

/** Coordonnées locales d'une tuile → longitude et latitude. @param {number} z @param {number} x @param {number} y @param {number} localX @param {number} localY @param {number} extent */
export function localVersLonLat(z, x, y, localX, localY, extent) {
  const n = Math.pow(2, z), lon = ((x + localX / extent) / n) * 360 - 180, yMerc = (y + localY / extent) / n;
  return { lon, lat: (Math.atan(Math.sinh(Math.PI * (1 - 2 * yMerc))) * 180) / Math.PI };
}

/** Tuiles couvrant une boîte {la1, la2, lo1, lo2} à un zoom (longitude enroulée). @param {{la1: number, la2: number, lo1: number, lo2: number}} bbox @param {number} z */
export function tuilesDeBoite(bbox, z) {
  const { x: x1, y: y1 } = tuileDepuisPoint(bbox.lo1, bbox.la2, z), { x: x2, y: y2 } = tuileDepuisPoint(bbox.lo2, bbox.la1, z);
  const xs = [Math.min(x1, x2), Math.max(x1, x2)], ys = [Math.min(y1, y2), Math.max(y1, y2)], n = Math.pow(2, z);
  /** @type {{x: number, y: number, z: number}[]} */
  const tiles = [];
  for (let x = xs[0]; x <= xs[1]; x++) for (let y = ys[0]; y <= ys[1]; y++) tiles.push({ x: ((x % n) + n) % n, y, z });
  return tiles;
}
