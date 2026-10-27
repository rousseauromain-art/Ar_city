import test from 'node:test';
import assert from 'node:assert/strict';
import { creerEtat } from '../../src/outils/etat.js';

test("l'instantané est une copie : le modifier ne change pas l'état", () => {
  const e = creerEtat({ version: 'x' });
  const s = e.instantane(); s.reglages.fou = 1; s.version = 'y';
  assert.equal(e.instantane().version, 'x'); assert.deepEqual(e.instantane().reglages, {});
});

test('les fonctions nommées modifient un seul champ et préviennent les abonnés', () => {
  const e = creerEtat();
  /** @type {any[]} */ const vus = [];
  const stop = e.abonner((s) => vus.push(s));
  e.definirVersion('2.0'); e.definirReglage('rayonKm', 60); e.definirDrapeau('lune', true); e.enregistrerChrono('scene', 3.5);
  stop(); e.definirReglage('rayonKm', 70);
  assert.equal(vus.length, 4);
  const s = e.instantane();
  assert.equal(s.version, '2.0'); assert.equal(s.reglages.rayonKm, 70); assert.deepEqual(s.drapeaux, { lune: true }); assert.deepEqual(s.chronos, { scene: 3.5 });
});

test("la dernière Vue est résumée sans son image", () => {
  const e = creerEtat();
  const image = /** @type {any} */ ({ width: 4, height: 3, data: new Uint8ClampedArray(48) });
  e.enregistrerVue({ image, pos: { lat: 48.6, lon: -2, altM: null }, heure: new Date('2026-10-25T11:22:30Z'), capDeg: 289, inclinaisonDeg: 0, champDeg: 110.5, source: 'photo', meta: {} });
  const v = /** @type {any} */ (e.instantane().derniereVue);
  assert.deepEqual(v.tailleImage, [4, 3]); assert.equal(v.heure, '2026-10-25T11:22:30.000Z'); assert.equal('image' in v, false);
});
