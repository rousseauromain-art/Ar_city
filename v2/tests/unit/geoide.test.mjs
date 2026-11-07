// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { ondulationGeoide } from '../../src/noyau/geoide.js';

test('ondulation EGM96 : valeurs de référence (paquet egm96-universal), à 2,5 m près ; en montagne (Himalaya) l\'erreur de la grille à 3° est plus grande', () => {
  const ref = [[48.65, -2.03, 49.22], [45.07, 7.68, 48.03], [38.9, 1.4, 49.29], [0, 0, 17.16], [60, 10, 40.46], [-33.9, 151.2, 22.31], [35.7, 139.7, 36.8], [40.7, -74, -32.77], [51.5, -0.1, 45.93]];
  for (const [lat, lon, n] of ref) assert.ok(Math.abs(ondulationGeoide(lat, lon) - n) < 2.5, `${lat},${lon} : ${ondulationGeoide(lat, lon).toFixed(1)} au lieu de ${n}`);
  assert.ok(Math.abs(ondulationGeoide(28, 86.9) - -28.64) < 20);
});

test('la grille est continue au méridien de 180° et aux pôles', () => {
  assert.ok(Math.abs(ondulationGeoide(10, 180) - ondulationGeoide(10, -180)) < 1e-9);
  assert.ok(Number.isFinite(ondulationGeoide(90, 0)) && Number.isFinite(ondulationGeoide(-90, 45)));
});
