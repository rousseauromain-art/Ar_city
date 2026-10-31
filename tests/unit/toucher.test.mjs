// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { zonesTouchables, zoneSousLeDoigt, distancePolygone } from '../../src/scene/toucher.js';
import { rectangleIncline } from '../../src/rendu/etiquettes.js';

const carre = [[10, 10], [50, 10], [50, 30], [10, 30]];

test('distance à un polygone : 0 dedans, distance au bord dehors', () => {
  assert.equal(distancePolygone(20, 20, carre), 0);
  assert.equal(distancePolygone(60, 20, carre), 10);
  assert.ok(Math.abs(distancePolygone(53, 34, carre) - 5) < 1e-9);
});

test('le rectangle d\'un nom incliné suit la rotation de l\'ancre', () => {
  const droit = rectangleIncline(100, 200, 0, 50, 12, 4);
  assert.deepEqual(droit, [[100, 188], [150, 188], [150, 204], [100, 204]]);
  const incline = rectangleIncline(100, 200, -Math.PI / 4, 50, 12, 4); // monte vers la droite
  assert.ok(incline[1][1] < incline[0][1], 'le bout du nom est plus haut à l\'écran');
  const gauche = rectangleIncline(100, 200, Math.PI / 4, -50, 12, 4); // nom à gauche de l'ancre
  assert.ok(gauche[1][0] < 100);
});

test('toutes les zones sont ramenées à une forme commune et typées', () => {
  const zones = zonesTouchables({
    etiquettes: [{ element: { kind: 'city', name: 'Dinard' }, icone: null, poly: carre }, { element: { kind: 'monument', name: 'Tour' }, icone: [100, 120, 100, 140], poly: null }],
    bande: [{ element: { name: 'Mât' }, elements: [{ name: 'Mât' }, { name: 'Mât 2' }], x0: 200, x1: 220, y0: 10, y1: 30 }],
    avions: [{ avion: { name: 'AF123' }, avions: [{ name: 'AF123' }], icone: [300, 320, 10, 30], poly: null }],
    bateaux: [{ bateau: { name: 'Ferry' }, bateaux: [{ name: 'Ferry' }], icone: [400, 420, 10, 30], poly: null }],
  });
  assert.deepEqual(zones.map((z) => z.type), ['lieu', 'monument', 'bande', 'avion', 'bateau']);
  assert.equal(zones[2].elements.length, 2);
  assert.equal(zonesTouchables(null).length, 0);
});

test('la zone sous le doigt : la plus proche, la plus petite d\'abord, rien hors tolérance', () => {
  const grande = { type: 'lieu', principal: 'grande', elements: ['grande'], poly: [[0, 0], [200, 0], [200, 100], [0, 100]] };
  const petite = { type: 'monument', principal: 'petite', elements: ['petite'], poly: carre };
  assert.equal(zoneSousLeDoigt([grande, petite], 20, 20).principal, 'petite', 'deux zones sous le doigt : la plus petite');
  assert.equal(zoneSousLeDoigt([grande, petite], 150, 50).principal, 'grande');
  assert.equal(zoneSousLeDoigt([petite], 70, 20).principal, 'petite', 'à 20 px : dans la tolérance');
  assert.equal(zoneSousLeDoigt([petite], 90, 20), null, 'à 40 px : trop loin');
});
