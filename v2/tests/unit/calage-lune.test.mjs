// @ts-nocheck — images synthétiques : le typage n'apporte rien ici.
// Calage de nuit sur la lune : même détection que le soleil (tache ronde et brillante près de la position calculée), messages propres à la lune, repli de « Caler auto » quand le soleil est couché.
import test from 'node:test';
import assert from 'node:assert/strict';
import { calerSurSoleil } from '../../src/calage/soleil.js';
import { calerAutomatiquement } from '../../src/calage/auto.js';
import { positionLune } from '../../src/noyau/astro.js';

const D = Math.PI / 180, wrap = (a) => ((a + 540) % 360) - 180, W = 800, H = 400, CW = 480, CH = 240;
const nuit = (peindre) => { const d = new Uint8ClampedArray(CW * CH * 4); for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) { const c = peindre(x, y) || [12, 14, 30], i = (y * CW + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; } return { d, cw: CW, ch: CH }; };
const disque = (cx, cy, r) => (x, y) => (Math.hypot(x - cx, y - cy) <= r ? [255, 255, 255] : null);
const versPx = (cap, site, pose, champ = 70) => { const fh = (W / 2) / Math.tan(champ / 2 * D); return { cx: (W / 2 + fh * Math.tan(wrap(cap - pose.capDeg) * D)) * CW / W, cy: (H / 2 - fh * Math.tan((site - pose.inclinaisonDeg) * D)) * CW / W }; };
const POS = { lat: 48.6459, lon: -2.0281 }
const lune = positionLune(Date.parse('2026-10-29T21:00:00Z'), POS.lat, POS.lon);
const pose = { capDeg: lune.azDeg, inclinaisonDeg: lune.elDeg, roulisDeg: 0 }; // la caméra vise la lune calculée
const base = { pos: POS, soleil: lune, astre: 'lune', pose, champDeg: 70, ecran: { largeurPx: W, hauteurPx: H } };

test('lune : le disque brillant est retrouvé, cap et horizon corrigés', () => {
  assert.ok(lune.elDeg > 10, `la lune doit être levée pour ce test (${lune.elDeg})`);
  // le disque apparaît, dans la pose affichée, 3° à gauche et 1° plus bas que la lune calculée : correction attendue +3° en cap, +1° en site
  const { cx, cy } = versPx(lune.azDeg - 3, lune.elDeg - 1, pose);
  const r = calerSurSoleil({ ...base, lirePixels: () => nuit(disque(cx, cy, 5)) });
  assert.equal(r.ok, true); assert.ok(Math.abs(r.dh - 3) < 0.6, `dh ${r.dh}`); assert.ok(Math.abs(r.dp - 1) < 0.6, `dp ${r.dp}`);
});
test('lune : refus avec les mots de la lune', () => {
  assert.equal(calerSurSoleil({ ...base, soleil: { azDeg: 10, elDeg: -20 }, lirePixels: () => null }).message, 'lune couchée');
  assert.equal(calerSurSoleil({ ...base, soleil: { azDeg: (pose.capDeg + 90) % 360, elDeg: 30 }, lirePixels: () => null }).message, 'lune hors du champ');
  assert.equal(calerSurSoleil({ ...base, lirePixels: () => nuit(() => null) }).message, 'pas de disque lunaire net sur l’image (nuages, lune trop pâle ?)');
  assert.equal(calerSurSoleil({ ...base, lirePixels: () => null }).message, 'image illisible');
});
test('« Caler auto » de nuit : le soleil est couché, la lune prend le relais ; sans lune visible, le refus d’avant', async () => {
  const { cx, cy } = versPx(lune.azDeg - 3, lune.elDeg - 1, pose);
  const ok = () => calerSurSoleil({ ...base, lirePixels: () => nuit(disque(cx, cy, 5)) });
  const ko = () => calerSurSoleil({ ...base, lirePixels: () => nuit(() => null) });
  const ctx = (luneFn) => ({ pos: POS, pose, camFov: 70, ecran: { largeurPx: W, hauteurPx: H }, champAffiche: (c) => c, photo: true, villeDense: false, avecRelief: false, attendreRelief: async () => {}, relief: () => null,
    soleil: () => ({ ok: false, message: 'soleil couché' }), lune: luneFn, lireLuminance: () => null, lireSilhouette: () => null, liste: [] });
  const a = await calerAutomatiquement(ctx(ok));
  assert.equal(a.source, 'lune'); assert.equal(a.applique, true); assert.match(a.message, /^calé sur la lune \(/); assert.ok(Math.abs(a.dh - 3) < 0.6);
  const b = await calerAutomatiquement(ctx(ko)); assert.notEqual(b.source, 'lune'); assert.equal(b.applique, false);
  const c = await calerAutomatiquement({ ...ctx(ok), soleil: () => ({ ok: false, message: 'soleil hors du champ' }) }); assert.notEqual(c.source, 'lune'); // la lune ne sert que quand le soleil est couché
});
