// @ts-nocheck — données synthétiques : le typage n'apporte rien ici.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decoderTuileMVT, lignesDeFeature, anneauxDeFeature, nomsDeCouches, etiquettesDeFeature } from '../../src/donnees/mvt.js';
import { coucheGeometriesMVT, tuileMVT } from './aide-mvt.mjs';

test('lignes : deux tracés dans une même feature, points locaux exacts', () => {
  const t = tuileMVT(coucheGeometriesMVT('transportation', [{ type: 'ligne', tags: { class: 'primary' }, traces: [[[0, 0], [100, 0], [100, 50]], [[10, 10], [20, 30]]] }]));
  const c = decoderTuileMVT(t, ['transportation']).transportation, l = lignesDeFeature(c.features[0]);
  assert.deepEqual(l, [[[0, 0], [100, 0], [100, 50]], [[10, 10], [20, 30]]]);
  assert.equal(etiquettesDeFeature(c.features[0], c).class, 'primary');
});

test('polygones : le trou (enroulement opposé) est écarté, le 2e bâtiment gardé', () => {
  const ext = [[0, 0], [100, 0], [100, 100], [0, 100]], trou = [[20, 20], [20, 40], [40, 40], [40, 20]], autre = [[200, 0], [300, 0], [300, 100], [200, 100]];
  const t = tuileMVT(coucheGeometriesMVT('batiment', [{ type: 'polygone', traces: [ext, trou, autre] }]));
  const r = anneauxDeFeature(decoderTuileMVT(t).batiment.features[0]);
  assert.equal(r.length, 2); assert.deepEqual(r[0], ext); assert.deepEqual(r[1], autre);
});

test('une ligne n\'est pas un polygone et inversement ; noms de couches et prédicat', () => {
  const t = tuileMVT(coucheGeometriesMVT('transportation', [{ type: 'ligne', traces: [[[0, 0], [5, 5]]] }]), coucheGeometriesMVT('batiment', [{ type: 'polygone', traces: [[[0, 0], [9, 0], [9, 9]]] }]));
  assert.deepEqual(nomsDeCouches(t), ['transportation', 'batiment']);
  const c = decoderTuileMVT(t, (n) => /bati/i.test(n));
  assert.deepEqual(Object.keys(c), ['batiment']);
  assert.deepEqual(anneauxDeFeature(decoderTuileMVT(t).transportation.features[0]), []);
  assert.deepEqual(lignesDeFeature(c.batiment.features[0]), []);
});
