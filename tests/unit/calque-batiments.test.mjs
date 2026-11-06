// @ts-nocheck — scènes synthétiques.
import test from 'node:test';
import assert from 'node:assert/strict';
import { commandesSilhouetteUrbaine, occultationMonument, calque } from '../../src/calques/batiments.js';
import { commandesSilhouetteMonument } from '../../src/noyau/icones.js';
import { yDepuisSite } from '../../src/noyau/projection.js';

const VUE = { largeurPx: 800, hauteurPx: 400, champDeg: 70, capDeg: 0, inclinaisonDeg: 0, roulisDeg: 0 };
const couche = (v, deg0 = -10, deg1 = 10) => { const a = new Float32Array(720).fill(-99); for (let i = Math.floor(((deg0 + 360) % 360) / 0.5); i !== Math.floor(((deg1 + 360) % 360) / 0.5); i = (i + 1) % 720) a[i] = v; return a; };
const sil = (v) => ({ ls: [couche(v), new Float32Array(720).fill(-99), new Float32Array(720).fill(-99)], ld: [new Float32Array(720).fill(300), new Float32Array(720), new Float32Array(720)], oeilRelM: 1.6 });

test('silhouette dessinée : remplissage puis halo puis trait ; sans remplissage, pas de remplissage ; rien si éteinte ou vide', () => {
  const c = commandesSilhouetteUrbaine(sil(10), VUE);
  assert.deepEqual(c.map((x) => x.type), ['remplissage', 'trait', 'trait']);
  assert.equal(c[2].couleur, 'rgba(190,172,232,.55)', 'couche proche (indice 0) : style de la v1');
  assert.deepEqual(commandesSilhouetteUrbaine(sil(10), VUE, { remplir: false }).map((x) => x.type), ['trait', 'trait']);
  assert.deepEqual(calque.preparer(sil(10), VUE, { reglages: { urban: false, remplir: true } }), []);
  assert.deepEqual(calque.preparer(null, VUE, { reglages: { urban: true, remplir: true } }), []);
  // le sommet est tracé à la bonne hauteur d'écran (10° au-dessus de l'horizon)
  const y = yDepuisSite(VUE, 10), pts = c[2].chemin.filter((o) => o[0] !== 'Z').map((o) => o[2]);
  assert.ok(pts.every((v) => Math.abs(v - y) < 1e-6 || v > y), 'le trait ne dépasse pas le sommet');
  assert.ok(Math.min(...pts) === y);
});

test('occultation : ordonnée du bâtiment plus proche que le monument, sinon null', () => {
  const f = occultationMonument(sil(10), VUE);
  assert.ok(Math.abs(f(400, 2) - yDepuisSite(VUE, 10)) < 1e-6);
  assert.equal(f(400, 0.4), null, 'monument à moins de 200 m derrière le bâtiment : pas masqué');
  assert.equal(f(790, 2), null, 'hors de la silhouette');
});

test('pictogramme masqué par un bâtiment : visible au-dessus de la ligne, pointillés (remplissage à 35 %) derrière ; sans bâtiment, inchangé', () => {
  const libre = commandesSilhouetteMonument('eiffel', 400, 100, 300, 0.26, 0.95), cache = commandesSilhouetteMonument('eiffel', 400, 100, 300, 0.26, 0.95, 200);
  assert.ok(libre.every((c) => c.type !== 'decoupe'));
  assert.deepEqual(cache.map((c) => c.type), ['decoupe', 'decoupe']);
  assert.deepEqual([cache[0].y, cache[0].h], [90, 110]); // au-dessus de la ligne : de yTop − 10 à occY
  assert.equal(cache[1].y, 200); assert.ok(cache[1].enfants[0].tirets.length === 2 && cache[1].enfants[1].couleur.includes(String(0.26 * 0.35).slice(0, 5)));
  assert.equal(commandesSilhouetteMonument('eiffel', 400, 100, 300, 0.26, 0.95, 400).length, 1, 'ligne sous le pied : tout est visible, rien à cacher');
});
