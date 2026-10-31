// @ts-nocheck
// Deuxième source de la hauteur d'œil : l'altitude GPS.
import test from 'node:test';
import assert from 'node:assert/strict';
import { correctionDepuisGps, altitudeOeil, decisionOeilAuto } from '../../src/scene/hauteur-oeil.js';

test('la correction amène l\'œil exactement à l\'altitude GPS', () => {
  for (const [gps, sol] of [[45, 13], [120.4, 100], [13, 13], [30, 40]]) {
    const c = correctionDepuisGps(gps, 5, sol); assert.notEqual(c, null);
    assert.ok(Math.abs(altitudeOeil(sol, /** @type {number} */ (c)) - Math.max(1, gps)) <= 0.6, `${gps} / ${sol}`);
  }
});
test('altitude absente, imprécise ou sol inconnu : aucune correction ; bornée comme le curseur', () => {
  assert.equal(correctionDepuisGps(null, 5, 10), null); assert.equal(correctionDepuisGps(undefined, 5, 10), null); assert.equal(correctionDepuisGps(NaN, 5, 10), null);
  assert.equal(correctionDepuisGps(50, 45, 10), null); assert.equal(correctionDepuisGps(50, 30, 10) !== null, true); assert.equal(correctionDepuisGps(50, null, 10) !== null, true);
  assert.equal(correctionDepuisGps(50, 5, NaN), null);
  assert.equal(correctionDepuisGps(900, 5, 10), 250); assert.equal(correctionDepuisGps(-100, 5, 10), -30);
});

test('recalage automatique : précision, cohérence, hystérésis, délai et réglage manuel', () => {
  const base = { altitudeM: 45, precisionAltM: 8, solM: 13, obsHeight: 0, derniereMs: 0, maintenantMs: 100000, manuel: false };
  assert.equal(decisionOeilAuto(base), correctionDepuisGps(45, 8, 13)); // 45 − 13 − 1,6 → 30
  assert.equal(decisionOeilAuto({ ...base, precisionAltM: 80 }), null, 'imprécise');
  assert.equal(decisionOeilAuto({ ...base, altitudeM: null }), null, 'absente');
  assert.equal(decisionOeilAuto({ ...base, altitudeM: 400 }), null, 'incohérente avec le sol (> 100 m)');
  assert.equal(decisionOeilAuto({ ...base, obsHeight: 29 }), null, 'moins de 3 m de gain');
  assert.equal(decisionOeilAuto({ ...base, obsHeight: 26 }), 30, '4 m de gain');
  assert.equal(decisionOeilAuto({ ...base, derniereMs: 80000 }), null, 'dernier recalage il y a moins de 30 s');
  assert.equal(decisionOeilAuto({ ...base, manuel: true }), null, 'réglé à la main');
});

test('Android : l\'altitude GPS est au-dessus de l\'ellipsoïde, on retranche le géoïde (49 m en Bretagne : plus de +48 m fantôme)', () => {
  // voiture à Saint-Malo : sol 9 m, altitude GPS (ellipsoïde) 59 m → 10 m au-dessus du niveau de la mer
  assert.equal(correctionDepuisGps(59, 8, 9), 48, 'sans correction du géoïde : 48 m de trop');
  assert.equal(correctionDepuisGps(59, 8, 9, 49.2), -1, 'avec le géoïde : œil à peu près au sol');
  const base = { altitudeM: 59, precisionAltM: 8, solM: 9, obsHeight: 48, derniereMs: 0, maintenantMs: 100000, manuel: false, ondulationM: 49.2 };
  assert.equal(decisionOeilAuto(base), -1, 'une correction de +48 m déjà appliquée est ramenée à son vrai niveau');
  assert.equal(decisionOeilAuto({ ...base, ondulationM: 0, obsHeight: 48 }), null, 'sans géoïde (iOS) : inchangé');
});
