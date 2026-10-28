// Aides de test du relief : générateur déterministe et tuiles Terrarium synthétiques.
/** Générateur déterministe (mulberry32). @param {number} graine */
export function alea(graine) { let a = graine; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Altitude synthétique (m) en un point : collines, une crête nette au nord-est, une mer à l'ouest. @param {number} lat @param {number} lon */
export function altitudeSynth(lat, lon) {
  const mer = lon < -2.05 ? -20 : 0;
  const collines = 90 * Math.sin(lat * 120) * Math.cos(lon * 95) + 60 * Math.sin(lat * 31 + lon * 17);
  const crete = Math.exp(-(((lat - 48.75) * 400) ** 2)) * 260 * (lon > -2.0 ? 1 : 0.2);
  return lon < -2.05 ? mer : Math.max(0, 40 + collines + crete);
}
/** Tuile Terrarium synthétique. @param {number} z @param {number} x @param {number} y @param {number} ts */
export function tuile(z, x, y, ts) {
  const d = new Uint8ClampedArray(ts * ts * 4), n = ts * 2 ** z;
  for (let py = 0; py < ts; py++) {
    const lat = Math.atan(Math.sinh(Math.PI * (1 - (2 * (y * ts + py + 0.5)) / n))) * 180 / Math.PI;
    for (let px = 0; px < ts; px++) {
      const lon = ((x * ts + px + 0.5) / n) * 360 - 180, v = altitudeSynth(lat, lon) + 32768, i = (py * ts + px) * 4;
      d[i] = Math.floor(v / 256); d[i + 1] = Math.floor(v) % 256; d[i + 2] = Math.round((v % 1) * 256); d[i + 3] = 255;
    }
  }
  return d;
}
