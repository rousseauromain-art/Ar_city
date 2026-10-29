// @ts-nocheck — code de la v1 extrait par `new Function` : le typage n'apporte rien ici.
// Silhouette du ciel lue dans l'image : identique à `observeSkyline` de la v1 sur des images synthétiques (colonne par colonne).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { observerCiel } from '../../src/vision/silhouette-ciel.js';

const src = readFileSync(new URL('../../v1/villes-horizon.html', import.meta.url), 'utf8');
const debut = src.indexOf('function observeSkyline(fr,P,fh){'), fin = src.indexOf('return {ok:cols.length>=20&&skyCols>=cols.length*0.3,skyFrac:nb/n,cols};\n}', debut);
assert.ok(debut > 0 && fin > debut, 'observeSkyline introuvable dans la v1');
const v1 = new Function('W', 'H', 'D', 'fr', 'P', 'fh', `${src.slice(debut, fin + 'return {ok:cols.length>=20&&skyCols>=cols.length*0.3,skyFrac:nb/n,cols};\n}'.length)}; return observeSkyline(fr,P,fh);`);

const W = 800, H = 400, CW = 240, CH = Math.max(60, Math.round(CW * H / W)), D = Math.PI / 180;
/** Image synthétique : `peindre(x, y)` renvoie [r, g, b]. */
function image(peindre) {
  const d = new Uint8ClampedArray(CW * CH * 4);
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) { const c = peindre(x, y), i = (y * CW + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; }
  return { d, cw: CW, ch: CH };
}
const horizon = (x) => 60 + 14 * Math.sin(x / 17) + 9 * Math.sin(x / 5.3);
const SOL = [40, 60, 45], CIEL = [110, 160, 225];
const pose = { capDeg: 120, inclinaisonDeg: 2, roulisDeg: 0 }, champ = 70, fh = (W / 2) / Math.tan(champ / 2 * D);

function compare(nom, pixels, p = pose) {
  const a = v1(W, H, D, pixels, { heading: p.capDeg, pitch: p.inclinaisonDeg, roll: p.roulisDeg }, fh);
  const b = observerCiel(pixels, { ecran: { largeurPx: W, hauteurPx: H }, pose: p, focalePx: fh });
  assert.equal(b.ok, a.ok, `${nom} : ok`);
  assert.ok(Math.abs(b.skyFrac - a.skyFrac) < 1e-12, `${nom} : part de ciel`);
  assert.equal(b.cols.length, a.cols.length, `${nom} : nombre de colonnes`);
  a.cols.forEach((c, i) => { assert.ok(Math.abs(b.cols[i].brg - c.brg) < 1e-9 && Math.abs(b.cols[i].a - c.a) < 1e-9 && b.cols[i].top === c.top, `${nom} : colonne ${i}`); });
  return b;
}

test('ciel bleu au-dessus d’un relief : mêmes colonnes que la v1, limite lue près du relief dessiné', () => {
  const r = compare('bleu', image((x, y) => (y < horizon(x) ? CIEL : SOL)));
  assert.equal(r.ok, true); assert.ok(r.cols.length >= 150, `${r.cols.length} colonnes`);
  assert.ok(r.cols.every((c) => !c.top));
});

test('ciel gris voilé, nuages blancs dans le ciel, dégradé de ciel', () => {
  compare('gris', image((x, y) => (y < horizon(x) ? [200, 200, 205] : SOL)));
  compare('nuages', image((x, y) => (y < horizon(x) ? (Math.hypot(x - 100, y - 25) < 14 || Math.hypot(x - 170, y - 18) < 20 ? [250, 250, 252] : CIEL) : SOL)));
  compare('dégradé', image((x, y) => (y < horizon(x) ? [90 + y, 140 + y * 0.8, 230 - y * 0.3] : SOL)));
});

test('refus : nuit, ciel dans moins de 35 % de la bande haute ; colonnes qui commencent hors du ciel (bâtiment, arbre)', () => {
  assert.equal(compare('nuit', image(() => [18, 18, 40])).ok, false);
  const peu = compare('peu de ciel', image((x, y) => (x < 60 && y < horizon(x) ? CIEL : [60, 55, 50])));
  assert.equal(peu.ok, false); assert.equal(peu.cols.length, 0);
  const bat = compare('bâtiment à gauche', image((x, y) => (x < 40 ? [70, 60, 55] : y < horizon(x) ? CIEL : SOL)));
  assert.ok(bat.cols.some((c) => c.top) && bat.cols.some((c) => !c.top), 'des colonnes « top » et des colonnes de ciel');
});

test('roulis compensé, pose inclinée, image plus étroite que l’écran', () => {
  compare('roulis 10°', image((x, y) => (y < horizon(x) ? CIEL : SOL)), { ...pose, roulisDeg: 10 });
  compare('roulis −7°, cap 350°', image((x, y) => (y < horizon(x) + 10 ? CIEL : SOL)), { capDeg: 350, inclinaisonDeg: -3, roulisDeg: -7 });
  compare('pente', image((x, y) => (y < 20 + x * 0.25 ? CIEL : SOL)));
});

test('poteaux et pieds dans le ciel : une colonne coupée par un objet sombre de 2 pixels s’arrête là, comme la v1', () => {
  compare('poteau', image((x, y) => (x > 118 && x < 122 && y > 20 && y < horizon(x) ? [30, 30, 30] : y < horizon(x) ? CIEL : SOL)));
});
