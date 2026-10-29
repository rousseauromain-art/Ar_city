// Symbole du soleil : présent dans le champ au-dessus de −1°, absent sinon ; position d'après le relèvement et la hauteur.
import test from 'node:test';
import assert from 'node:assert/strict';
import { commandesSoleil } from '../../src/rendu/soleil.js';
import { positionSoleil } from '../../src/noyau/astro.js';

const vue = { largeurPx: 400, hauteurPx: 800, capDeg: 200, inclinaisonDeg: 0, roulisDeg: 0, champDeg: 60 };
const o = { familles: { mono: 'M' }, jointure: /** @type {'round'} */ ('round'), extremite: /** @type {'butt'} */ ('butt') };

test('le soleil dans l’axe est au centre de l’écran, avec ses rayons et son relèvement', () => {
  const c = commandesSoleil(vue, { azDeg: 200, elDeg: 0 }, o);
  assert.equal(c.length, 3);
  const [halo, or, nom] = /** @type {any[]} */ (c);
  assert.equal(halo.chemin[0][0], 'A'); assert.equal(halo.chemin.length, 17);
  assert.ok(Math.abs(halo.chemin[0][1] - 200) < 1e-9 && Math.abs(halo.chemin[0][2] - 400) < 1e-9);
  assert.equal(or.couleur, '#FFD23F'); assert.equal(nom.texte, 'soleil 200.0° · 0.0°');
});

test('absent : sous l’horizon, hors du champ, hors de l’écran, ou sans position', () => {
  assert.deepEqual(commandesSoleil(vue, { azDeg: 200, elDeg: -1 }, o), []);
  assert.deepEqual(commandesSoleil(vue, { azDeg: 260, elDeg: 0 }, o), []);   // 60° à côté : au-delà de 0,8 × champ
  assert.deepEqual(commandesSoleil(vue, { azDeg: 200, elDeg: 70 }, o), []);  // trop haut dans le ciel
  assert.deepEqual(commandesSoleil(vue, null, o), []);
});

test('astro : midi solaire à Paris au solstice d’été, le soleil est au sud, haut', () => {
  const p = positionSoleil(Date.UTC(2026, 5, 21, 11, 51, 0), 48.85, 2.35);
  assert.ok(p.azDeg > 170 && p.azDeg < 195, `azimut ${p.azDeg}`);
  assert.ok(p.elDeg > 62 && p.elDeg < 66, `hauteur ${p.elDeg}`);
});
