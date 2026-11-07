import test from 'node:test';
import assert from 'node:assert/strict';
import { creerJournal, serialiser } from '../../src/outils/journal.js';

test('le tampon circulaire garde les dernières entrées', () => {
  const j = creerJournal({ capacite: 3, horloge: () => 1 });
  for (let i = 1; i <= 5; i++) j.info('m', 'e' + i);
  assert.deepEqual(j.entrees().map((e) => e.message), ['e3', 'e4', 'e5']);
  assert.deepEqual(j.entrees(2).map((e) => e.message), ['e4', 'e5']);
});

test('niveaux, module et horodatage', () => {
  const j = creerJournal({ horloge: () => 42 });
  j.avert('reseau', 'lent'); j.erreur('calage', 'raté', { x: 1 });
  assert.deepEqual(j.entrees(), [
    { t: 42, niveau: 'avert', module: 'reseau', message: 'lent' },
    { t: 42, niveau: 'erreur', module: 'calage', message: 'raté', donnees: { x: 1 } },
  ]);
});

test('une erreur est sérialisée avec son nom, son message et le début de sa pile', () => {
  const d = /** @type {any} */ (serialiser(new TypeError('boum')));
  assert.equal(d.nom, 'TypeError'); assert.equal(d.message, 'boum'); assert.ok(d.pile.split('\n').length <= 4);
});

test('les données trop grosses ou circulaires sont tronquées, jamais une exception', () => {
  const grosse = serialiser({ a: 'x'.repeat(5000) });
  assert.ok(String(grosse).length <= 2100);
  const cycle = {}; /** @type {any} */ (cycle).moi = cycle;
  assert.equal(typeof serialiser(cycle), 'string');
});

test('abonnement, désabonnement, et un abonné qui plante ne bloque pas le journal', () => {
  const j = creerJournal();
  /** @type {string[]} */ const vus = [];
  const stop = j.abonner((e) => vus.push(e.message));
  j.abonner(() => { throw new Error('abonné cassé'); });
  j.info('m', 'un'); stop(); j.info('m', 'deux');
  assert.deepEqual(vus, ['un']);
  assert.ok(j.entrees().some((e) => e.niveau === 'erreur' && e.module === 'journal'));
  assert.ok(j.entrees().some((e) => e.message === 'deux'));
});
