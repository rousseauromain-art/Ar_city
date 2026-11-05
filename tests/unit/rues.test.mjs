// @ts-nocheck — données synthétiques : le typage n'apporte rien ici.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ruesDeTuile, raccorderRues, ruesProches, lireRuesOverpass, requeteRues, creerSourceRues, distanceALigne } from '../../src/donnees/rues.js';
import { creerCacheDonnees } from '../../src/donnees/cache-donnees.js';
import { tuileDepuisPoint, localVersLonLat } from '../../src/donnees/mvt.js';
import { coucheGeometriesMVT, tuileMVT } from './aide-mvt.mjs';
import { fauxCaches } from './aide-caches.mjs';

const T = { z: 14, ...tuileDepuisPoint(2.3522, 48.8566, 14) }, POS = (() => { const c = localVersLonLat(T.z, T.x, T.y, 2150, 2048, 4096); return { lat: c.lat, lon: c.lon }; })();
const tuile = () => tuileMVT(
  coucheGeometriesMVT('transportation', [
    { type: 'ligne', tags: { class: 'minor' }, traces: [[[2000, 2048], [2100, 2048], [2300, 2048]]] },
    { type: 'ligne', tags: { class: 'path' }, traces: [[[2000, 2100], [2300, 2100]]] },
    { type: 'ligne', tags: { class: 'rail' }, traces: [[[2000, 2200], [2300, 2200]]] }]),
  coucheGeometriesMVT('transportation_name', [{ type: 'ligne', tags: { class: 'minor', name: 'Rue de Rivoli' }, traces: [[[1990, 2048], [2310, 2048]]] }]));

test('tuile : seules les voies routières sont gardées, le nom vient de transportation_name', () => {
  const r = ruesDeTuile(tuile(), T);
  assert.equal(r.length, 1); assert.equal(r[0].nom, 'Rue de Rivoli'); assert.equal(r[0].classe, 'minor'); assert.equal(r[0].points.length, 3);
});

test('raccord : deux tronçons de même nom bout à bout deviennent une rue ; noms différents : séparés', () => {
  const a = { nom: 'Rue A', classe: 'minor', points: [{ lat: 48.85, lon: 2.35 }, { lat: 48.85, lon: 2.351 }] };
  const b = { nom: 'Rue A', classe: 'minor', points: [{ lat: 48.85, lon: 2.351 }, { lat: 48.85, lon: 2.352 }] };
  const c = { nom: 'Rue B', classe: 'minor', points: [{ lat: 48.85, lon: 2.352 }, { lat: 48.85, lon: 2.353 }] };
  const r = raccorderRues([a, c, b]);
  assert.equal(r.length, 2); assert.equal(r.find((x) => x.nom === 'Rue A').points.length, 3);
  const inv = raccorderRues([a, { ...b, points: b.points.slice().reverse() }]);
  assert.equal(inv.length, 1); assert.equal(inv[0].points.length, 3);
});

test('distance à une ligne et rues proches', () => {
  const l = [{ lat: 48.8566, lon: 2.3500 }, { lat: 48.8566, lon: 2.3540 }];
  assert.ok(Math.abs(distanceALigne({ lat: 48.8567, lon: 2.352 }, l) - 11.1) < 0.5);
  assert.equal(ruesProches([{ nom: '', classe: 'minor', points: l }], { lat: 48.8600, lon: 2.352 }, 300).length, 0);
});

test('Overpass : requête et analyse de la géométrie complète', () => {
  assert.match(requeteRues(POS, 300), /out geom/);
  const r = lireRuesOverpass({ elements: [{ type: 'way', tags: { highway: 'residential', name: 'Rue X' }, geometry: [{ lat: 1, lon: 2 }, { lat: 1.001, lon: 2 }] }, { type: 'node' }] });
  assert.deepEqual(r, [{ nom: 'Rue X', classe: 'residential', points: [{ lat: 1, lon: 2 }, { lat: 1.001, lon: 2 }] }]);
  assert.throws(() => lireRuesOverpass({}), /sans éléments/);
});

test('source : OpenFreeMap, puis repli Overpass si OpenFreeMap est injoignable', async () => {
  const ofm = { gabaritTuiles: async () => 'https://t.exemple/{z}/{x}/{y}.pbf' };
  const reseau = { requeter: async () => tuile() };
  const cache = () => creerCacheDonnees('vh2-ru', { caches: fauxCaches() });
  const s1 = await creerSourceRues({ reseau, cache: cache(), openfreemap: ofm }).charger({ pos: POS });
  assert.equal(s1.source, 'openfreemap'); assert.ok(s1.rues.some((r) => r.nom === 'Rue de Rivoli'));
  const casse = { requeter: async () => { throw new Error('échec'); } };
  const ov = { interroger: async (q, ms, an) => an({ elements: [{ type: 'way', tags: { highway: 'residential', name: 'Rue Y' }, geometry: [{ lat: POS.lat, lon: POS.lon - 0.0005 }, { lat: POS.lat, lon: POS.lon + 0.0005 }] }] }) };
  const s2 = await creerSourceRues({ reseau: casse, cache: cache(), openfreemap: ofm, overpass: ov }).charger({ pos: POS });
  assert.equal(s2.source, 'overpass'); assert.equal(s2.rues[0].nom, 'Rue Y');
  await assert.rejects(creerSourceRues({ reseau: casse, cache: cache(), openfreemap: ofm }).charger({ pos: POS }));
});
