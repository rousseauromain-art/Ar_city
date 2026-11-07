import test from 'node:test';
import assert from 'node:assert/strict';
import { lireDrapeaux, memoriserDrapeaux, DRAPEAUX_CONNUS } from '../../src/outils/drapeaux.js';
import { creerStockage, adaptateurMemoire } from '../../src/outils/stockage.js';
import { creerJournal } from '../../src/outils/journal.js';

test('tout est désactivé par défaut', () => {
  const d = lireDrapeaux();
  assert.deepEqual(Object.keys(d).sort(), Object.keys(DRAPEAUX_CONNUS).sort()); assert.ok(Object.values(d).every((v) => v === false));
});

test("?drapeaux= active les drapeaux connus et signale les autres", () => {
  const journal = creerJournal();
  const d = lireDrapeaux({ recherche: '?x=1&drapeaux=lune, profondeur,inconnu', journal });
  assert.equal(d.lune, true); assert.equal(d.profondeur, true); assert.equal(d.ancrage, false);
  assert.equal(journal.entrees().filter((e) => e.niveau === 'avert').length, 1);
});

test('réglage mémorisé et adresse se cumulent', () => {
  const stockage = creerStockage({ adaptateur: adaptateurMemoire() });
  assert.equal(memoriserDrapeaux({ lune: true, profondeur: false }, stockage), true);
  const d = lireDrapeaux({ stockage, recherche: '?drapeaux=ancrage' });
  assert.deepEqual(d, { lune: true, profondeur: false, ancrage: true });
});
