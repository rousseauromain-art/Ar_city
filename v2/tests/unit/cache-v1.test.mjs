// Reprise de la mémoire de la v1 : les caches `vh-data-v1` et `vh-terrain-v1` sont lus en dernier recours, jamais écrits, jamais créés.
import test from 'node:test';
import assert from 'node:assert/strict';
import { creerCacheDonnees } from '../../src/donnees/cache-donnees.js';
import { creerCacheOctets } from '../../src/donnees/cache-api.js';
import { fauxCaches } from './aide-caches.mjs';

const BASE = 'https://vh.cache/';
/** Entrée de la v1 : corps JSON, en-tête x-t = instant d'écriture. */
/** @param {unknown} corps @param {number} t */
const entreeV1 = (corps, t) => new Response(JSON.stringify(corps), { headers: { 'x-t': String(t), 'content-type': 'application/json' } });

test('données : la v2 relit la mémoire de la v1 quand la sienne est vide', async () => {
  const caches = fauxCaches(), t = 1_000_000;
  await (await caches.open('vh-data-v1')).put(BASE + 'pl/osm/x', entreeV1([{ name: 'Dinard' }], t - 1000));
  const c = creerCacheDonnees('vh2-donnees', { caches: /** @type {any} */ (caches), maintenant: () => t, secours: ['vh-data-v1'] });
  const r = await c.obtenir('pl', 'pl/osm/x', { ttlMs: 60000, charger: async () => { throw new Error('réseau coupé'); } });
  assert.deepEqual(r.donnees, [{ name: 'Dinard' }]); assert.equal(r.source, 'cache');
  assert.equal((await (await caches.open('vh-data-v1')).keys()).length, 1, 'la v1 n’est pas modifiée');
});

test('données : la mémoire de la v2 passe avant celle de la v1 ; une entrée périmée de la v1 est ignorée', async () => {
  const caches = fauxCaches(), t = 5_000_000;
  const v1 = await caches.open('vh-data-v1'), v2 = await caches.open('vh2-donnees');
  await v1.put(BASE + 'a', entreeV1('ancienne', t - 1000)); await v2.put(BASE + 'a', entreeV1('récente', t - 10));
  await v1.put(BASE + 'b', entreeV1('périmée', t - 10_000_000));
  const c = creerCacheDonnees('vh2-donnees', { caches: /** @type {any} */ (caches), maintenant: () => t, secours: ['vh-data-v1'] });
  assert.equal((await c.obtenir('g', 'a', { ttlMs: 60000, charger: async () => 'réseau' })).donnees, 'récente');
  assert.equal((await c.obtenir('g', 'b', { ttlMs: 60000, charger: async () => 'réseau' })).source, 'reseau');
});

test('données : sans cache de la v1, on ne le crée pas (la v1 reste intacte)', async () => {
  const caches = fauxCaches();
  const c = creerCacheDonnees('vh2-donnees', { caches: /** @type {any} */ (caches), secours: ['vh-data-v1'] });
  await c.obtenir('g', 'k', { ttlMs: 1000, charger: async () => 'ok' });
  assert.equal(caches.noms.has('vh-data-v1'), false);
  assert.equal(caches.noms.has('vh2-donnees'), true);
});

test('octets : tuiles de relief relues dans le cache de la v1', async () => {
  const caches = fauxCaches();
  await (await caches.open('vh-terrain-v1')).put('https://tiles.mapterhorn.com/8/1/2.webp', new Response(new Uint8Array([1, 2, 3])));
  const c = creerCacheOctets('vh2-terrain', { caches: /** @type {any} */ (caches), secours: ['vh-terrain-v1'] });
  const lu = await c.lire('https://tiles.mapterhorn.com/8/1/2.webp');
  assert.deepEqual(lu && [.../** @type {Uint8Array} */ (lu.donnees)], [1, 2, 3]);
  assert.equal(await c.lire('https://tiles.mapterhorn.com/8/9/9.webp'), null);
  await c.ecrire('https://tiles.mapterhorn.com/8/5/5.webp', new Uint8Array([9]));
  assert.equal(caches.noms.get('vh-terrain-v1')?.size, 1, 'écriture dans le cache de la v2 seulement');
});
