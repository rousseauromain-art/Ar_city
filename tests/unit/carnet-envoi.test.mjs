// @ts-nocheck — doublures de test : le typage n'apporte rien ici.
// Carnet de l'appareil : identifiant (celui de la v1 en lecture seule), stockage, envoi au relais par lots de 100, reprise après un échec.
import test from 'node:test';
import assert from 'node:assert/strict';
import { creerCarnet } from '../../src/app/carnet.js';
import { creerStockage, adaptateurMemoire } from '../../src/outils/stockage.js';

const journal = { info() {}, avert() {}, erreur() {} };
const mesure = (rec) => ({ t: rec, rec, dev: 'd', model: '', ua: '', src: 'repère touché', lat: 0, lon: 0, acc: null, hdg: 0, pitch: 0, raw: 0, off: 1, poff: 0, dOff: 1, dPitch: 0, cam: 67, gyro: false, sun: null });
const faux = () => { const appels = []; return { appels, minuteur: { setTimeout: (f, ms) => { appels.push(ms); return 1; }, clearTimeout() {} } }; };

test('identifiant : celui de la v1 s\'il existe (lu, jamais écrit), sinon un identifiant propre, stable', () => {
  const st = creerStockage({ adaptateur: adaptateurMemoire() });
  const a = creerCarnet({ stockage: st, journal, relais: '', reseau: {}, lireLocal: (k) => (k === 'vh-dev' ? 'abc123' : null), navigateur: {} });
  assert.equal(a.appareil, 'abc123'); assert.equal(st.lire('dev', { parDefaut: '' }), '');
  const b = creerCarnet({ stockage: st, journal, relais: '', reseau: {}, lireLocal: () => null, navigateur: {} }), c = creerCarnet({ stockage: st, journal, relais: '', reseau: {}, lireLocal: () => null, navigateur: {} });
  assert.ok(b.appareil.length >= 8); assert.equal(b.appareil, c.appareil);
});

test('une mesure est marquée v2, gardée, mise en file ; l\'envoi suit 8 s plus tard', async () => {
  const st = creerStockage({ adaptateur: adaptateurMemoire() }), { appels, minuteur } = faux();
  const c = creerCarnet({ stockage: st, journal, relais: 'https://r', reseau: {}, lireLocal: () => 'x', navigateur: {}, minuteur });
  c.consigner(mesure(1));
  assert.equal(c.lire().mesures[0].v, 'v2'); assert.equal(c.lire().file.length, 1); assert.deepEqual(appels, [8000]);
  c.demarrer(); assert.deepEqual(appels, [8000, 15000]);
});

test('envoi par lots de 100 : succès = file purgée de ce lot ; échec = file gardée', async () => {
  const st = creerStockage({ adaptateur: adaptateurMemoire() }), { minuteur } = faux(), requetes = [];
  let ok = true;
  const reseau = { requeter: async (url, o) => { requetes.push({ url, o }); return ok ? { ok: true, statut: 200, donnees: { ok: true, stored: JSON.parse(o.corps).samples.length } } : { ok: false, statut: 500, donnees: { error: 'panne' } }; } };
  const c = creerCarnet({ stockage: st, journal, relais: 'https://r', reseau, lireLocal: () => 'x', navigateur: {}, minuteur });
  for (let i = 1; i <= 130; i++) c.consigner(mesure(i));
  ok = false; await c.envoyer(); assert.equal(c.lire().file.length, 130);
  ok = true; await c.envoyer();
  assert.equal(requetes.length, 2); assert.equal(requetes[1].url, 'https://r/calib'); assert.equal(requetes[1].o.methode, 'POST'); assert.equal(requetes[1].o.entetes['Content-Type'], 'text/plain');
  assert.equal(JSON.parse(requetes[1].o.corps).samples.length, 100); assert.equal(c.lire().file.length, 30); assert.equal(c.lire().mesures.length, 130);
  await c.envoyer(); assert.equal(c.lire().file.length, 0);
});

test('sans relais : rien n\'est envoyé, tout reste en file', async () => {
  const st = creerStockage({ adaptateur: adaptateurMemoire() }), { minuteur } = faux();
  const c = creerCarnet({ stockage: st, journal, relais: '', reseau: { requeter: async () => { throw new Error('ne doit pas être appelé'); } }, lireLocal: () => 'x', navigateur: {}, minuteur });
  c.consigner(mesure(1)); await c.envoyer(); assert.equal(c.lire().file.length, 1);
});
