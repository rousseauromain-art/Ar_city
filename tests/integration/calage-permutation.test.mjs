// @ts-nocheck — scènes synthétiques : le typage n'apporte rien ici.
// Calage sur les repères : le test de permutation refuse les concordances fortuites (Turin, 26/10/2026) ; de vrais repères concordants sont toujours acceptés.
// Sans le test (`permutation: false`), on retrouve la v1 (j), qui les acceptait presque toujours.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ajusterSurReperes } from '../../src/calage/reperes.js';
import { champAffiche as champDe } from '../../src/rendu/projection.js';

const D = Math.PI / 180, ECRAN = { largeurPx: 915, hauteurPx: 412 };
const champAffiche = (cam) => champDe(cam, ECRAN, null);
const alea = (graine) => { let a = (graine * 2654435761) >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

/** Une scène : repères [cap, km, hauteur m], pointes [décalage °, hauteur °] ; la silhouette est faite de triangles de 0,5° de demi-largeur. */
function scene(lm, pointes, camFov = 71.5) {
  const monuments = lm.map(([brg, dist, ht], i) => ({ name: 'repère ' + i, kind: 'monument', cat: 'monument', type: 'tour', htOsm: ht, ht, dist, brg: (brg + 360) % 360, far: false, hidden: false, aP: null }));
  const fh = (ECRAN.largeurPx / 2) / Math.tan(champAffiche(camFov) / 2 * D), cols = [];
  for (let dd = -34; dd <= 34; dd += 0.25) { let a = 0; for (const [pd, pa] of pointes) a = Math.max(a, pa * Math.max(0, 1 - Math.abs(dd - pd) / 0.5)); cols.push({ brg: (dd + 360) % 360, a }); }
  const ps = { cols, heading: 0, pitch: 0, fh };
  const lms = monuments.map((c) => ({ c, aTop: Math.atan2(c.ht - 1.6, c.dist * 1000) / D }));
  return { ps, lms, camFov };
}
const ajuster = ({ ps, lms, camFov }, permutation) => ajusterSurReperes(ps, lms, { ecran: ECRAN, camFov, champAffiche, inclinaisonCouranteDeg: 0, permutation });
const dense = (nl, np, graine) => { const r = alea(graine); return scene(Array.from({ length: nl }, () => [-32 + r() * 64, 0.6 + r() * 3, 40 + r() * 60]), Array.from({ length: np }, () => [-32 + r() * 64, 0.8 + r() * 2.6])); };

test('ville dense sans rapport entre repères et pointes : presque toujours refusé, le champ ne bouge jamais ; la v1 (sans test) acceptait la plupart', () => {
  let avec = 0, sans = 0, champBouge = 0, n = 0;
  for (const [nl, np] of [[16, 14], [30, 20]]) for (let k = 1; k <= 60; k++) {
    const sc = dense(nl, np, k), a = ajuster(sc, true), b = ajuster(sc, false); n++;
    if (a.ok) { avec++; if (a.cam !== 71.5) champBouge++; } if (b.ok) sans++;
  }
  assert.equal(champBouge, 0); assert.ok(avec <= n * 0.1, `${avec}/${n} acceptées à tort`); assert.ok(sans >= n * 0.5, `la v1 n'en acceptait que ${sans}/${n} : le test ne prouve rien`);
});

test('repères réellement concordants : le cap est corrigé (+7°), le champ reste', () => {
  const VRAIS = [[-20, 1.2, 60], [-6, 2.4, 80], [9, 1.8, 45], [24, 3.1, 70]];
  const pointes = VRAIS.map(([b, d, h]) => [b - 7, Math.atan2(h - 1.6, d * 1000) / D]);
  for (const n of [4, 3, 2]) {
    const r = ajuster(scene(VRAIS.slice(0, n), pointes.slice(0, n)), true);
    assert.equal(r.ok, true, `${n} repères vrais : ${JSON.stringify(r)}`); assert.ok(Math.abs(r.corr - 7) < 0.5, `corr ${r.corr}`); assert.equal(r.cam, 71.5);
  }
});

test('un repère seul n\'est cru que s\'il y a au plus 3 repères dans le champ', () => {
  const un = [[-6, 1.5, 120]], pointe = [[-6 - 7, Math.atan2(120 - 1.6, 1500) / D]];
  assert.equal(ajuster(scene(un, pointe), true).ok, true);
  const quatre = [[-6, 1.5, 120], [30, 9, 90], [-28, 8, 90], [20, 12, 80]];
  assert.equal(ajuster(scene(quatre, pointe), true).ok, false);
  assert.equal(ajuster(scene(quatre, pointe), false).ok, true, 'la v1 l\'acceptait');
});
