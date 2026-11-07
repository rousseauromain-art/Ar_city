// @ts-nocheck
// Symbole de la lune et fraction éclairée.
import test from 'node:test';
import assert from 'node:assert/strict';
import { phaseLune, positionLune } from '../../src/noyau/astro.js';
import { commandesLune } from '../../src/rendu/lune.js';

test('fraction éclairée : à moins de 4 points de l\'éphéméride (PyEphem)', () => {
  for (const [t, ref] of [[1793307600000, 0.8182], [1792706400000, 0.874], [1793907000000, 0.1223], [1797045300000, 0.0843], [1800486600000, 0.963], [1790530500000, 0.9859]]) assert.ok(Math.abs(phaseLune(t) - ref) < 0.04, `${new Date(t).toISOString()} : ${phaseLune(t)} / ${ref}`);
});
const vue = { largeurPx: 800, hauteurPx: 400, capDeg: 200, inclinaisonDeg: 5, roulisDeg: 0, champDeg: 70 };
const o = { familles: { mono: 'monospace' } };
test('la lune est dessinée dans le champ, avec sa fraction éclairée ; absente sous l\'horizon, hors du champ ou sans position', () => {
  const c = commandesLune(vue, { azDeg: 205, elDeg: 10 }, 0.82, o);
  assert.equal(c.length, 4); assert.equal(c[3].type, 'texte'); assert.match(/** @type {any} */ (c[3]).texte, /^lune 205\.0° · 10\.0° · 82 %$/);
  assert.deepEqual(commandesLune(vue, { azDeg: 205, elDeg: -3 }, 0.5, o), []); assert.deepEqual(commandesLune(vue, { azDeg: 20, elDeg: 10 }, 0.5, o), []); assert.deepEqual(commandesLune(vue, null, 0.5, o), []);
  assert.ok(positionLune(Date.parse('2026-10-29T21:00:00Z'), 48.6, -2).elDeg > 10);
});
