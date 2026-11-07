// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { hitBest, hitIn, inQuad, hitsDeScene } from '../../src/scene/toucher.js';
import { rectangleIncline } from '../../src/rendu/etiquettes.js';

const W = 400, H = 300;

test('le rectangle d\'un nom incliné suit la rotation de l\'ancre', () => {
  const droit = rectangleIncline(100, 200, 0, 50, 12, 4);
  assert.deepEqual(droit, [[100, 188], [150, 188], [150, 204], [100, 204]]);
  const incline = rectangleIncline(100, 200, -Math.PI / 4, 50, 12, 4);
  assert.ok(incline[1][1] < incline[0][1], 'le bout du nom est plus haut à l\'écran');
});

test('inQuad (v1) : dedans, dehors, marge', () => {
  const q = [[10, 10], [50, 10], [50, 30], [10, 30]];
  assert.equal(inQuad(q, 20, 20, 0), true);
  assert.equal(inQuad(q, 55, 20, 0), false);
  assert.equal(inQuad(q, 55, 20, 6), true);
});

test('hitBest (v1) : franchement dedans d\'abord, puis à 6 px ; le centre le plus proche l\'emporte', () => {
  const a = { t: 'a', g: null, roll: 0, x0: 0, x1: 100, y0: 0, y1: 20 }, b = { t: 'b', g: null, roll: 0, icon: [50, 70, 0, 20], poly: null };
  assert.equal(hitBest(58, 10, [[a, b]], W, H).t, 'b'); // dans les deux : le centre de b (60) est plus proche que celui de a (50)
  assert.equal(hitBest(90, 10, [[a, b]], W, H).t, 'a');
  assert.equal(hitBest(104, 10, [[a]], W, H).t, 'a'); // marge de 6 px
  assert.equal(hitBest(120, 10, [[a]], W, H), null);
});

test('roulis : le point tapé est ramené dans le repère de l\'image (v1 : hitLocal)', () => {
  const h = { t: 'x', g: null, roll: 90, x0: 190, x1: 210, y0: 40, y1: 60 }; // zone posée au-dessus du centre, image tournée de 90°
  assert.equal(hitIn(200, 50, h, 0, W, H), false);
  assert.equal(hitIn(100, 150, h, 0, W, H) || hitIn(300, 150, h, 0, W, H), true);
});

test('zones de la scène au format de la v1 : icône et nom d\'un monument dans une seule zone, +N dans _hidObjs, objet d\'origine de la bande', () => {
  const m = { name: 'Fort', kind: 'monument' }, cache1 = { name: 'Caché' }, site = { name: 'Pylône', kind: 'telecom' };
  const hits = hitsDeScene({ etiquettes: [{ element: m, icone: [0, 10, 0, 10], poly: null, caches: [cache1] }, { element: m, icone: null, poly: [[12, 0], [40, 0], [40, 8], [12, 8]] }],
    bande: [{ element: { nom: 'P', source: site }, elements: [{ source: site }], x0: 0, x1: 5, y0: 0, y1: 5 }], avions: [{ avion: { kind: 'plane' }, avions: [{ kind: 'plane' }], icone: [0, 1, 0, 1], poly: null }],
    bateaux: [{ bateau: { m: { kind: 'ship' } }, bateaux: [{ m: { kind: 'ship' } }], icone: [0, 1, 0, 1], poly: null }] }, 0);
  assert.equal(hits.length, 4);
  assert.deepEqual(hits[0].icon, [0, 10, 0, 10]); assert.equal(hits[0].poly.length, 4); assert.deepEqual(hits[0].t._hidObjs, [cache1]);
  assert.equal(hits[1].t, site); assert.equal(hits[3].t.kind, 'ship');
});
