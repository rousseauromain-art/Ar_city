// Image synthétique d'une rue (façades verticales avec fenêtres, sol, ciel) vue par un appareil incliné et penché : sert à vérifier la greffe
// horizonPhoto sur une réponse connue. Projection : appareil à 1,6 m du sol, x à droite, y en bas, z devant ; inclinaison positive = appareil levé.
const RAD = Math.PI / 180;
/** Générateur pseudo-aléatoire déterministe (mulberry32). */
export function alea(graine) { let a = graine >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** Projette un point du monde (X à droite, Y devant, Z en haut, en mètres depuis l'appareil) sur l'image. null derrière l'appareil. */
export function projeter(X, Y, Z, { f, cx, cy, inclinaison = 0, roulis = 0 }) {
  const p = inclinaison * RAD, r = roulis * RAD, y = -Z, z = Y, yc = y * Math.cos(p) + z * Math.sin(p), zc = -y * Math.sin(p) + z * Math.cos(p);
  if (!(zc > 0.1)) return null;
  const xr = X * Math.cos(r) - yc * Math.sin(r), yr = X * Math.sin(r) + yc * Math.cos(r);
  return [cx + f * xr / zc, cy + f * yr / zc];
}
/**
 * Rue synthétique : deux rangées de façades qui fuient vers le fond, une façade de face, fenêtres, quelques traits obliques (ombres, câbles) et du bruit.
 * @returns {{g:Uint8Array,w:number,h:number,f:number}} image en niveaux de gris
 */
export function rue({ w = 640, h = 480, champ = 71.5, inclinaison = 0, roulis = 0, graine = 1, obliques = 12, bruit = 3, facades = true }) {
  const f = (Math.max(w, h) / 2) / Math.tan(champ / 2 * RAD), cam = { f, cx: w / 2, cy: h / 2, inclinaison, roulis }, rnd = alea(graine);
  const img = new Float32Array(w * h), SS = 2;
  // fond : ciel en haut de l'horizon, sol en bas (dégradés doux, sans arête droite verticale)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const dy = (y - h / 2) - f * Math.tan(inclinaison * RAD); img[y * w + x] = dy < 0 ? 200 - 20 * (y / h) : 95 + 25 * ((y % 7) / 7) * 0.2; }
  const quads = [];
  const facade = (x0, y0, x1, y1, haut, gris) => { // mur vertical du sol (Z = −1,6) à `haut`, de (x0,y0) à (x1,y1) ; fenêtres par travées
    quads.push({ pts: [[x0, y0, -1.6], [x1, y1, -1.6], [x1, y1, haut], [x0, y0, haut]], gris });
    const L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.floor(L / 4)), etages = Math.max(1, Math.floor((haut + 1.6) / 3.5));
    for (let i = 0; i < n; i++) for (let e = 0; e < etages; e++) { const a = (i + 0.3) / n, b = (i + 0.7) / n, z0 = -1.6 + e * 3.5 + 1.0, z1 = z0 + 1.8;
      quads.push({ pts: [[x0 + (x1 - x0) * a, y0 + (y1 - y0) * a, z0], [x0 + (x1 - x0) * b, y0 + (y1 - y0) * b, z0], [x0 + (x1 - x0) * b, y0 + (y1 - y0) * b, z1], [x0 + (x1 - x0) * a, y0 + (y1 - y0) * a, z1]], gris: gris - 55 - 20 * rnd() }); }
  };
  if (facades) {
    for (let k = 4; k >= 0; k--) { const y0 = 12 + k * 22, y1 = y0 + 20, hg = 12 + 8 * rnd(), hd = 12 + 8 * rnd();
      facade(-18, y0, -18, y1, hg, 150 + 40 * rnd()); facade(18, y1, 18, y0, hd, 150 + 40 * rnd()); }
    facade(-10, 125, 10, 125, 22, 170);
  }
  // rendu : du plus loin au plus près, 2 × 2 sous-pixels
  quads.sort((a, b) => Math.max(...b.pts.map(p => p[1])) - Math.max(...a.pts.map(p => p[1])));
  for (const q of quads) {
    const P = q.pts.map(p => projeter(p[0], p[1], p[2], cam)); if (P.some(p => !p)) continue;
    const xs = P.map(p => p[0]), ys = P.map(p => p[1]), xa = Math.max(0, Math.floor(Math.min(...xs))), xb = Math.min(w - 1, Math.ceil(Math.max(...xs))), ya = Math.max(0, Math.floor(Math.min(...ys))), yb = Math.min(h - 1, Math.ceil(Math.max(...ys)));
    const dedans = (x, y) => { let s = 0; for (let i = 0; i < 4; i++) { const a = P[i], b = P[(i + 1) % 4], c = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]); if (c > 0) s++; else if (c < 0) s--; } return s === 4 || s === -4; };
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) { let n = 0; for (let i = 0; i < SS; i++) for (let j = 0; j < SS; j++) if (dedans(x + (i + 0.5) / SS, y + (j + 0.5) / SS)) n++;
      if (n) { const k = n / (SS * SS), i = y * w + x; img[i] = img[i] * (1 - k) + q.gris * k; } }
  }
  // traits obliques (ombres, câbles, lignes du sol) : des droites qui ne sont pas des verticales du monde
  for (let k = 0; k < obliques; k++) { const x0 = rnd() * w, y0 = rnd() * h, ang = (rnd() * 50 - 25 + (rnd() < 0.5 ? 0 : 180)) * RAD + Math.PI / 2 * (rnd() < 0.7 ? 1 : 0.6), L = 40 + rnd() * 120, g = rnd() < 0.5 ? 40 : 230;
    for (let t = 0; t < L; t += 0.5) for (let e = -1; e <= 1; e++) { const x = Math.round(x0 + Math.cos(ang) * t + e * Math.sin(ang) * 0.6), y = Math.round(y0 + Math.sin(ang) * t - e * Math.cos(ang) * 0.6); if (x >= 0 && y >= 0 && x < w && y < h) img[y * w + x] = g; } }
  const g = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) g[i] = Math.max(0, Math.min(255, Math.round(img[i] + (rnd() * 2 - 1) * bruit)));
  return { g, w, h, f };
}
