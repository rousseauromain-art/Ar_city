import test from 'node:test';
import assert from 'node:assert/strict';
import { creerReseau, ErreurReseau } from '../../src/donnees/reseau.js';
import { creerJournal } from '../../src/outils/journal.js';

/** Réponse simulée. @param {number} statut @param {any} corps */
const rep = (statut, corps) => /** @type {any} */ ({ ok: statut >= 200 && statut < 300, status: statut, json: async () => corps, text: async () => JSON.stringify(corps), arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer });
const sansAttente = { attendre: async () => {} };

/** Minuteur manuel : déclenche les délais à la demande. */
function minuteurManuel() {
  /** @type {Map<number, () => void>} */ const m = new Map(); let n = 0;
  return { setTimeout: (/** @type {() => void} */ fn) => { m.set(++n, fn); return n; }, clearTimeout: (/** @type {number} */ id) => { m.delete(id); }, declencher: () => { for (const [id, fn] of [...m]) { m.delete(id); fn(); } } };
}

test('succès : renvoie les données et la source', async () => {
  const r = creerReseau({ ...sansAttente, fetchImpl: async () => rep(200, { ok: 1 }) });
  assert.deepEqual(await r.obtenir('https://a/x'), { donnees: { ok: 1 }, source: 'reseau' });
});

test('nouvelles tentatives sur 5xx et coupure, attente croissante ; pas sur 4xx', async () => {
  const attentes = /** @type {number[]} */ ([]); let appels = 0;
  const r = creerReseau({ attendre: async (ms) => { attentes.push(ms); }, attenteBaseMs: 100, fetchImpl: async () => { appels++; if (appels === 1) return rep(503, {}); if (appels === 2) throw new TypeError('coupure'); return rep(200, 'fin'); } });
  assert.equal((await r.obtenir('https://a/1')).donnees, 'fin'); assert.equal(appels, 3); assert.deepEqual(attentes, [100, 200]);
  let n = 0; const r4 = creerReseau({ ...sansAttente, fetchImpl: async () => { n++; return rep(404, {}); } });
  await assert.rejects(r4.obtenir('https://a/2'), (e) => e instanceof ErreurReseau && e.statut === 404); assert.equal(n, 1);
});

test("toutes les tentatives échouent : l'erreur garde le dernier statut", async () => {
  const journal = creerJournal(); let n = 0;
  const r = creerReseau({ ...sansAttente, journal, tentatives: 3, fetchImpl: async () => { n++; return rep(500, {}); } });
  await assert.rejects(r.obtenir('https://a/3'), (e) => e instanceof ErreurReseau && e.statut === 500);
  assert.equal(n, 3); assert.equal(journal.entrees().length, 3);
});

test('délai maximal : la requête est interrompue (AbortSignal)', async () => {
  const mn = minuteurManuel();
  const r = creerReseau({ ...sansAttente, minuteur: mn, tentatives: 1, fetchImpl: (_u, { signal }) => new Promise((_ok, ko) => { signal.addEventListener('abort', () => ko(new Error('aborted'))); }) });
  const p = r.obtenir('https://a/lent'); await Promise.resolve(); mn.declencher();
  await assert.rejects(p, (e) => e instanceof ErreurReseau && e.statut === 0 && /délai/.test(e.message));
});

test('deux demandes identiques en même temps = une seule requête', async () => {
  let n = 0; let libere = () => {};
  const r = creerReseau({ ...sansAttente, fetchImpl: () => new Promise((ok) => { n++; libere = () => ok(rep(200, 'x')); }) });
  const a = r.obtenir('https://a/dup'), b = r.obtenir('https://a/dup');
  assert.equal(a, b); assert.equal(r.enCours(), 1); libere(); await a;
  assert.equal(n, 1); assert.equal(r.enCours(), 0);
  const c = r.obtenir('https://a/dup'); libere(); await c; // une fois terminée, une nouvelle demande refait la requête
  assert.equal(n, 2);
});

/** Cache simulé. */
const cacheMemoire = (/** @type {Record<string, {donnees: any, t: number}>} */ init = {}) => ({ m: { ...init }, async lire(/** @type {string} */ k) { return this.m[k] ?? null; }, async ecrire(/** @type {string} */ k, /** @type {any} */ d) { this.m[k] = { donnees: d, t: 1000 }; } });

test('cache : donnée fraîche = aucune requête ; réseau en panne = donnée périmée en secours', async () => {
  const cache = cacheMemoire({ k: { donnees: 'vieux', t: 500 } }); let n = 0;
  const r = creerReseau({ ...sansAttente, cache, maintenant: () => 1000, tentatives: 1, fetchImpl: async () => { n++; return rep(500, {}); } });
  assert.deepEqual(await r.obtenir('https://a/k', { cle: 'k', ttlMs: 10_000 }), { donnees: 'vieux', source: 'cache' }); assert.equal(n, 0);
  assert.deepEqual(await r.obtenir('https://a/k', { cle: 'k', ttlMs: 100 }), { donnees: 'vieux', source: 'cache-perime' }); assert.equal(n, 1);
});

test('une réponse réseau est écrite dans le cache', async () => {
  const cache = cacheMemoire();
  const r = creerReseau({ ...sansAttente, cache, fetchImpl: async () => rep(200, { a: 1 }) });
  await r.obtenir('https://a/c', { cle: 'c' }); assert.deepEqual(cache.m.c.donnees, { a: 1 });
});

test('mode hors ligne : aucun appel réseau, cache seulement', async () => {
  let n = 0; const cache = cacheMemoire({ k: { donnees: 'mem', t: 1 } });
  const r = creerReseau({ ...sansAttente, cache, fetchImpl: async () => { n++; return rep(200, {}); } });
  r.definirHorsLigne(true); assert.equal(r.estHorsLigne(), true);
  assert.equal((await r.obtenir('https://a/k', { cle: 'k' })).source, 'cache-perime');
  await assert.rejects(r.obtenir('https://a/autre'), (e) => e instanceof ErreurReseau && /hors ligne/.test(e.message)); assert.equal(n, 0);
});

test('analyses texte et octets', async () => {
  const r = creerReseau({ ...sansAttente, fetchImpl: async () => rep(200, 'abc') });
  assert.equal((await r.obtenir('https://a/t', { analyse: 'texte' })).donnees, '"abc"');
  assert.deepEqual([...(/** @type {Uint8Array} */ ((await r.obtenir('https://a/o', { analyse: 'octets' })).donnees))], [1, 2, 3]);
});
