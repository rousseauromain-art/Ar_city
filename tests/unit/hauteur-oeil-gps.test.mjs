// @ts-nocheck
// Deuxième source de la hauteur d'œil : l'altitude GPS.
import test from 'node:test';
import assert from 'node:assert/strict';
import { correctionDepuisGps, altitudeOeil } from '../../src/scene/hauteur-oeil.js';

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
