import test from 'node:test';
import assert from 'node:assert/strict';
import { creerStockage, adaptateurMemoire, PREFIXE } from '../../src/outils/stockage.js';
import { creerJournal } from '../../src/outils/journal.js';

const neuf = () => { const adaptateur = adaptateurMemoire(), journal = creerJournal(); return { adaptateur, journal, s: creerStockage({ adaptateur, journal }) }; };

test('lecture/écriture : clés préfixées vh2: et enregistrement versionné', () => {
  const { adaptateur, s } = neuf();
  assert.equal(s.ecrire('reglages', { a: 1 }, 2), true);
  assert.equal(adaptateur.getItem(PREFIXE + 'reglages'), '{"v":2,"d":{"a":1}}');
  assert.deepEqual(s.lire('reglages', { version: 2 }), { a: 1 });
  assert.equal(s.lire('absent', { parDefaut: 7 }), 7);
});

test('la v2 ne touche jamais aux clés de la v1', () => {
  const { adaptateur, s } = neuf();
  adaptateur.setItem('vh_settings_v2', '{"radius":60}'); adaptateur.setItem('vh-calib', '[]');
  s.ecrire('a', 1); s.supprimer('a');
  assert.equal(adaptateur.getItem('vh_settings_v2'), '{"radius":60}'); assert.equal(adaptateur.getItem('vh-calib'), '[]');
  assert.deepEqual(s.noms(), []);
});

test('migrations en chaîne, de la version enregistrée à la version demandée', () => {
  const { s } = neuf();
  s.ecrire('x', { km: 5 }, 1);
  const lu = s.lire('x', { version: 3, migrations: { 1: (d) => ({ distKm: d.km }), 2: (d) => ({ ...d, unite: 'km' }) } });
  assert.deepEqual(lu, { distKm: 5, unite: 'km' });
});

test('donnée illisible, trop récente, ou migration manquante : valeur par défaut ET trace au journal', () => {
  const { adaptateur, journal, s } = neuf();
  adaptateur.setItem(PREFIXE + 'a', 'pas du json'); adaptateur.setItem(PREFIXE + 'b', '{"v":9,"d":1}'); adaptateur.setItem(PREFIXE + 'c', '{"v":1,"d":1}');
  assert.equal(s.lire('a', { parDefaut: 'dflt' }), 'dflt'); assert.equal(s.lire('b', { version: 2, parDefaut: 'dflt' }), 'dflt'); assert.equal(s.lire('c', { version: 2, parDefaut: 'dflt' }), 'dflt');
  assert.equal(journal.entrees().filter((e) => e.niveau === 'erreur' && e.module === 'stockage').length, 3);
});

test("écriture refusée (stockage plein) : false et erreur au journal, pas d'exception", () => {
  const journal = creerJournal();
  const s = creerStockage({ journal, adaptateur: { ...adaptateurMemoire(), setItem() { throw new Error('QuotaExceeded'); } } });
  assert.equal(s.ecrire('a', 1), false); assert.equal(journal.entrees().length, 1);
});

test('noms de stockage et de cache validés, caches préfixés vh2-', () => {
  const { s } = neuf();
  assert.throws(() => s.ecrire('a:b', 1)); assert.throws(() => s.lire('')); assert.throws(() => s.nomCache('../x'));
  assert.equal(s.nomCache('tuiles'), 'vh2-tuiles');
});
