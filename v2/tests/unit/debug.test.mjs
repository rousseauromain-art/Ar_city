import test from 'node:test';
import assert from 'node:assert/strict';
import { chargerEruda, debugDemande, VERSION_ERUDA, URL_ERUDA } from '../../src/outils/debug.js';
import { creerJournal } from '../../src/outils/journal.js';

/** Document simulé : le script « se charge » ou « échoue » à la demande. @param {'ok'|'erreur'|'rien'} issue */
function faux(issue) {
  const ajoutes = /** @type {any[]} */ ([]);
  return { ajoutes, document: /** @type {any} */ ({ createElement: () => ({}), head: { appendChild: (/** @type {any} */ s) => { ajoutes.push(s); setTimeout(() => { if (issue === 'ok') s.onload(); else if (issue === 'erreur') s.onerror(); }, 0); } } }) };
}

test("pas de ?debug=1 : rien n'est chargé", async () => {
  const { ajoutes, document } = faux('ok');
  assert.equal(debugDemande('?x=1'), false); assert.equal(await chargerEruda({ recherche: '?x=1', document }), false); assert.equal(ajoutes.length, 0);
});

test('?debug=1 : Eruda (version figée) est chargée puis lancée', async () => {
  const { ajoutes, document } = faux('ok'); const journal = creerJournal(); let initialisee = false;
  /** @type {any} */ (globalThis).eruda = { init: () => { initialisee = true; } };
  assert.equal(await chargerEruda({ recherche: '?debug=1', document, journal }), true);
  assert.equal(ajoutes[0].src, URL_ERUDA); assert.ok(URL_ERUDA.includes('@' + VERSION_ERUDA + '/')); assert.equal(initialisee, true);
  delete /** @type {any} */ (globalThis).eruda;
});

test("sans réseau ou trop lent : false, avertissement au journal, aucune exception", async () => {
  const j1 = creerJournal(); assert.equal(await chargerEruda({ recherche: '?debug=1', document: faux('erreur').document, journal: j1 }), false);
  assert.equal(j1.entrees()[0].niveau, 'avert');
  const j2 = creerJournal(); assert.equal(await chargerEruda({ recherche: '?debug=1', document: faux('rien').document, journal: j2, delaiMs: 20 }), false);
  assert.match(j2.entrees()[0].message, /délai/);
});
