import test from 'node:test';
import assert from 'node:assert/strict';
import { construireRapport, nomFichierRapport, TAILLE_MAX_OCTETS } from '../../src/outils/rapport.js';
import { creerEtat } from '../../src/outils/etat.js';
import { creerJournal } from '../../src/outils/journal.js';

test('le rapport réunit version, navigateur, réglages, drapeaux, calage, chronos et fin du journal', () => {
  const etat = creerEtat({ version: '2.0.0' }); etat.definirReglage('rayonKm', 60); etat.definirDrapeau('lune', true); etat.enregistrerCalage({ methode: 'soleil', dCapDeg: -2.3 }); etat.enregistrerChrono('scene', 4);
  const journal = creerJournal(); journal.info('app', 'démarrage');
  const r = construireRapport({ etat, journal, navigateur: { agent: 'Pixel 9', langue: 'fr-FR', ecran: '412x915' }, maintenant: () => new Date('2026-10-27T20:00:00Z') });
  assert.equal(r.format, 'vh2-rapport-1'); assert.equal(r.version, '2.0.0'); assert.equal(r.cree, '2026-10-27T20:00:00.000Z');
  assert.deepEqual(r.reglages, { rayonKm: 60 }); assert.deepEqual(r.drapeaux, { lune: true }); assert.deepEqual(r.calage, { methode: 'soleil', dCapDeg: -2.3 });
  assert.deepEqual(r.chronos, { scene: 4 }); assert.equal(r.journal[0].message, 'démarrage'); assert.equal(r.navigateur.agent, 'Pixel 9');
  assert.equal(nomFichierRapport(r), 'villes-horizon-rapport_2026-10-27T20-00-00.json');
});

test('la taille est bornée : seules les plus anciennes entrées du journal sont retirées', () => {
  const journal = creerJournal({ capacite: 500 });
  for (let i = 0; i < 400; i++) journal.erreur('m', 'x'.repeat(900) + i, { gros: 'y'.repeat(1500) });
  const r = construireRapport({ etat: creerEtat({ version: 'v' }), journal });
  assert.ok(JSON.stringify(r).length <= TAILLE_MAX_OCTETS); assert.ok(r.journal.length >= 10);
  assert.ok(r.journal.at(-1)?.message.endsWith('399'));
});
