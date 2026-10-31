// @ts-nocheck
// Position : « même endroit » à 300 m près, bruit du GPS sous 10 m.
import test from 'node:test';
import assert from 'node:assert/strict';
import { memeEndroit, estBruitGps, BRUIT_GPS_KM, MEME_ENDROIT_KM } from '../../src/app/position.js';

const A = { lat: 48.6459, lon: -2.0281 };
const decale = (m) => ({ lat: A.lat + m / 111320, lon: A.lon });

test('un fix GPS à quelques mètres est du bruit, un déplacement de 50 m n\'en est pas', () => {
  assert.equal(estBruitGps(A, decale(3)), true);
  assert.equal(estBruitGps(A, decale(50)), false);
  assert.equal(estBruitGps(null, A), false, 'la toute première position n\'est jamais du bruit');
  assert.equal(BRUIT_GPS_KM, 0.01);
});

test('même endroit : moins de 300 m (le seuil de recalcul du relief)', () => {
  assert.equal(memeEndroit(A, decale(5)), true);
  assert.equal(memeEndroit(A, decale(250)), true);
  assert.equal(memeEndroit(A, decale(400)), false);
  assert.equal(memeEndroit(A, null), false);
  assert.equal(MEME_ENDROIT_KM, 0.3);
});
