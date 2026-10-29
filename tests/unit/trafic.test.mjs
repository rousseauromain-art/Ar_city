// Trafic en direct (données) : formules de la v1 extraites de son fichier, puis sources (relais, quota, mémoire en direct, flux muet).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boiteDeRecherche, requeteBoite, extrapoler, lireAvions, fusionnerNavires, dureeConservation, listerMobiles, categorieNavire, MOBILES_MAX } from '../../src/donnees/trafic.js';
import { creerMemoireDirect, VALIDITE_DIRECT_MS } from '../../src/donnees/memoire-direct.js';
import { creerSourceAvions } from '../../src/donnees/avions.js';
import { creerSourceNavires } from '../../src/donnees/navires.js';
import { creerCacheDonnees } from '../../src/donnees/cache-donnees.js';
import { fauxCaches } from './aide-caches.mjs';
import { alea } from './aide-relief.mjs';

const src = readFileSync(new URL('../../v1/villes-horizon.html', import.meta.url), 'utf8');
const entre = (/** @type {string} */ debut, /** @type {string} */ fin) => { const i = src.indexOf(debut), j = src.indexOf(fin, i); assert.ok(i >= 0 && j > i, `introuvable : ${debut}`); return src.slice(i, j); };
const V = new Function('pos', 'D', `
${entre('function bbox(km){', '// extrapolation entre')}
${entre('// extrapolation entre', '// ---------- CALQUES EN DIRECT')}
${entre('const shipKeepMs=', '// avions : via le relais')}
${entre('const SHIP_CAT=', 'const SHIP_STOP_MS')}
return {bbox,boxQuery,dr,shipKeepMs,shipStyle};`);
const POS = { lat: 48.644, lon: -2.023 };
const v1 = V(POS, Math.PI / 180);

test('boîte de recherche, extrapolation, durée de garde et catégorie : identiques à la v1', () => {
  const r = alea(5);
  for (let i = 0; i < 400; i++) {
    const km = 5 + r() * 400, p = { lat: -60 + r() * 120, lon: -170 + r() * 340 }, V2 = V(p, Math.PI / 180);
    const b = boiteDeRecherche(p, km), b1 = V2.bbox(km);
    assert.deepEqual(b, b1); assert.equal(requeteBoite(b), V2.boxQuery(b1));
    const o = { lat: p.lat, lon: p.lon, alt: r() * 10000, vr: (r() - 0.5) * 20, trk: r() * 360, vel: r() * 300, t: 1e12 - r() * 2e6 }, now = 1e12;
    assert.deepEqual(extrapoler(o, now), (() => { const real = Date.now; Date.now = () => now; try { return V2.dr(o); } finally { Date.now = real; } })());
    const n = { vel: r() < 0.3 ? 0.1 : r() * 10 };
    assert.equal(dureeConservation(n), v1.shipKeepMs(n));
  }
  for (const t of [undefined, null, 0, 30, 31, 35, 36, 37, 41, 49, 50, 58, 60, 69, 70, 79, 80, 89, 90, 99, '36', 'x']) assert.deepEqual(categorieNavire(/** @type {any} */ (t)), v1.shipStyle(t), String(t));
  assert.match(requeteBoite(boiteDeRecherche(POS, 1000)), /^lamin=[\d.]+&lomin=-?[\d.]+&lamax=[\d.]+&lomax=-?[\d.]+$/);
  const b = boiteDeRecherche(POS, 1000), q = requeteBoite(b), nums = Object.fromEntries(q.split('&').map((x) => x.split('=')));
  assert.ok(+nums.lamax - +nums.lamin <= 3.4 + 1e-9 && +nums.lomax - +nums.lomin <= 3.4 + 1e-9, 'côtés limités à 3,4°');
});

test('avions et navires lus comme la v1', () => {
  const etats = [['a1', ' AF1 ', 'F', 0, 0, 2.3, 48.8, 9000, false, 200, 90, 3, null, 9100], ['a2', '', 'F', 0, 0, 2.4, 48.9, 8000, false, 100, 10, 0, null, null], ['sol', 'SOL', 'F', 0, 0, 2, 48, 0, true, 0, 0, 0, null, null],
    ['sans', 'X', 'F', 0, 0, null, 48, 10, false, 1, 1, 1, null, null], ['bas', 'BAS', 'F', 0, 0, 2.5, 48.7, 0, false, undefined, undefined, undefined, null, null]];
  const av = lireAvions({ states: etats }, 5000);
  assert.deepEqual(av.map((a) => [a.name, a.alt, a.trk, a.vel, a.vr, a.t]), [['AF1', 9100, 90, 200, 3, 5000], ['a2', 8000, 10, 100, 0, 5000], ['BAS', 0, 0, 0, 0, 5000]]);
  assert.deepEqual(lireAvions({}, 1), []);
  const anciens = new Map([['100', { name: 'ANCIEN', mmsi: '100', type: 70, lat: 1, lon: 1, trk: 0, vel: 0, alt: 0, vr: 0, t: 1 }]]);
  const m = fusionnerNavires(anciens, { ships: [{ mmsi: 100, lat: 2, lon: 2, cog: 45, sog: 10, t: 9e15 }, { mmsi: 200, name: '', lat: 3, lon: 3 }, { mmsi: 300, lat: null, lon: 3 }] }, 1000);
  assert.equal(anciens.get('100')?.lat, 1, 'la table reçue n’est pas modifiée');
  assert.deepEqual([...m.keys()], ['100', '200']);
  assert.deepEqual([m.get('100')?.name, m.get('100')?.type, m.get('100')?.vel, m.get('100')?.t], ['ANCIEN', 70, 10 * 0.5144, 1000], 'nom et type conservés, instant ramené à maintenant');
  assert.deepEqual([m.get('200')?.name, m.get('200')?.type], ['MMSI 200', null]);
});

test('mobiles proches : portée, tri, plafond de 60, expiration, photo rejouée', () => {
  const r = alea(9), now = 1e12;
  const avions = Array.from({ length: 50 }, (_, i) => ({ name: 'A' + i, id: 'a' + i, lat: POS.lat + (r() - 0.5), lon: POS.lon + (r() - 0.5), alt: 5000, trk: 0, vel: 0, vr: 0, t: now }));
  const navires = new Map(Array.from({ length: 40 }, (_, i) => /** @type {[string, any]} */ ([String(i), { name: 'N' + i, mmsi: String(i), type: 60, lat: POS.lat + (r() - 0.5) * 0.3, lon: POS.lon + (r() - 0.5) * 0.3, trk: 0, vel: i % 2 ? 0 : 5, alt: 0, vr: 0, t: now - (i < 5 ? 20 * 60000 : 0) }])));
  const e = { pos: POS, avions, navires, reglages: { air: true, sea: true, airMaxKm: 120, seaMaxKm: 40 }, maintenantMs: now };
  const { mobiles, expires } = listerMobiles(e);
  assert.equal(mobiles.length, MOBILES_MAX); assert.ok(mobiles.every((m, i) => i === 0 || m.dist >= mobiles[i - 1].dist), 'trié par distance');
  assert.deepEqual(expires.sort(), ['0', '2', '4'], 'en route depuis plus de 15 min : périmés (les pairs bougent) ; à quai : gardés');
  assert.deepEqual(listerMobiles({ ...e, photo: true }).mobiles, []);
  assert.ok(listerMobiles({ ...e, reglages: { ...e.reglages, sea: false } }).mobiles.every((m) => m.kind === 'plane'));
  assert.ok(listerMobiles({ ...e, reglages: { ...e.reglages, airMaxKm: 5 } }).mobiles.filter((m) => m.kind === 'plane').every((m) => m.dist <= 5));
});

const cache = () => creerCacheDonnees('vh2-direct', { caches: /** @type {any} */ (fauxCaches()), maintenant: () => horloge });
let horloge = 1e12;

test('mémoire en direct : 9 cases voisines fusionnées, le plus récent gagne, validité par genre', async () => {
  horloge = 1e12;
  const c = cache(), m = creerMemoireDirect(c);
  assert.equal(await m.restaurer('air', POS), null);
  const voisin = { lat: POS.lat + 0.1, lon: POS.lon }; // case voisine
  await m.sauver('air', POS, [{ id: 'a', name: 'A', t: 5 }, { id: 'b', name: 'B', t: 1 }]);
  await m.sauver('air', voisin, [{ id: 'b', name: 'B2', t: 9 }]);
  const h = await m.restaurer('air', POS);
  assert.deepEqual(h?.d.map((x) => [x.id, x.name]).sort(), [['a', 'A'], ['b', 'B2']]);
  assert.equal(await m.restaurer('air', { lat: POS.lat + 0.5, lon: POS.lon }), null, 'trop loin');
  horloge += VALIDITE_DIRECT_MS.air + 1;
  assert.equal(await m.restaurer('air', POS), null, 'un avion de plus de 2 min est oublié');
  await m.sauver('sea', POS, [['227', { name: 'N', t: 1 }]]);
  horloge += VALIDITE_DIRECT_MS.air + 1;
  assert.deepEqual((await m.restaurer('sea', POS))?.d, [['227', { name: 'N', t: 1 }]], 'un bateau reste valable 1 h');
  assert.deepEqual(c.compteurs().air, { hit: 1, net: 2, stale: 0, fail: 0 });
});

/** Faux réseau : répond selon la route. */
const reseauFaux = (/** @type {any} */ air, /** @type {any} */ mer, /** @type {string[]} */ urls = []) => ({ requeter: async (/** @type {string} */ url) => { urls.push(url); const r = /planes|opensky/.test(url) ? air : mer; if (r instanceof Error) throw r; return r; } });
const rep = (/** @type {any} */ donnees, statut = 200, entetes = {}) => ({ ok: statut < 300, statut, donnees, entetes: { get: (/** @type {string} */ k) => /** @type {any} */ (entetes)[k] ?? null } });

test('avions : relais ou direct, quota (en-tête ou corps, 60 s minimum, 600 s sans indication), pause, panne, restauration', async () => {
  horloge = 1e12;
  const memoire = creerMemoireDirect(cache()), urls = /** @type {string[]} */ ([]);
  const etat = [['a1', 'AF1', 'F', 0, 0, 2.3, 48.8, 9000, false, 200, 90, 3, null, null]];
  const relais = creerSourceAvions({ reseau: reseauFaux(rep({ states: etat, auth: 'jeton', creditsRestants: 100 }), null, urls), memoire, relais: 'r.example.org', maintenant: () => horloge });
  const a = await relais.charger({ pos: POS, rayonKm: 120, avions: [] });
  assert.match(urls[0], /^https:\/\/r\.example\.org\/planes\?lamin=/); assert.deepEqual([a.message, a.avions.length, a.ok, a.pauseJusqua], ['1 av.', 1, true, 0]);
  assert.match(a.detail, /relais, jeton, 100 credits restants/);
  const direct = creerSourceAvions({ reseau: reseauFaux(rep({ states: etat }), null, urls), memoire, relais: '', maintenant: () => horloge });
  await direct.charger({ pos: POS, rayonKm: 120, avions: [] });
  assert.match(urls[1], /^https:\/\/opensky-network\.org\/api\/states\/all\?lamin=/);
  for (const [corps, ent, secondes] of /** @type {[any, any, number][]} */ ([[{ retryAfter: 120 }, {}, 120], [{}, { 'x-rate-limit-retry-after-seconds': '300' }, 300], [{ retryAfter: 5 }, {}, 60], [{}, {}, 600]])) {
    const q = await creerSourceAvions({ reseau: reseauFaux(rep(corps, 429, ent), null), memoire, relais: 'r.example.org', maintenant: () => horloge }).charger({ pos: POS, rayonKm: 120, avions: [] });
    assert.deepEqual([q.message, q.ok, q.pauseJusqua], ['quota atteint', false, horloge + secondes * 1000]);
  }
  const enPause = await relais.charger({ pos: POS, rayonKm: 120, avions: a.avions, pauseJusqua: horloge + 1000 });
  assert.equal(urls.length, 2, 'en pause : aucune requête'); assert.equal(enPause.avions, a.avions);
  const panne = await creerSourceAvions({ reseau: reseauFaux(new Error('coupé'), null), memoire, relais: 'r.example.org', maintenant: () => horloge }).charger({ pos: POS, rayonKm: 120, avions: [] });
  assert.deepEqual([panne.message, panne.ok, panne.restaure, panne.avions.length], ['indispo', false, true, 1], 'la situation restaurée est gardée malgré la panne');
  const err = await creerSourceAvions({ reseau: reseauFaux(rep({ error: 'boom' }, 500), null), memoire, relais: 'r.example.org', maintenant: () => horloge }).charger({ pos: POS, rayonKm: 120, avions: [] });
  assert.match(err.detail, /relais : boom/);
});

test('navires : relais obligatoire, flux muet, restauration des navires encore plausibles, mémoire écrite', async () => {
  horloge = 1e12;
  const c = cache(), memoire = creerMemoireDirect(c);
  const sans = await creerSourceNavires({ reseau: reseauFaux(null, rep({})), memoire, relais: '', maintenant: () => horloge }).charger({ pos: POS, rayonKm: 40, navires: new Map() });
  assert.deepEqual([sans.message, sans.ok], ['relais requis', false]);
  const ok = await creerSourceNavires({ reseau: reseauFaux(null, rep({ ships: [{ mmsi: 1, name: 'A', lat: 48.7, lon: -2, cog: 0, sog: 0, type: 60 }, { mmsi: 2, name: 'B', lat: 48.7, lon: -2, cog: 10, sog: 8, type: 30 }], hub: { seconds: 5, tracked: 2 }, received: 4 })), memoire, relais: 'r.example.org', maintenant: () => horloge })
    .charger({ pos: POS, rayonKm: 40, navires: new Map() });
  assert.deepEqual([ok.message, ok.ok, ok.navires.size], ['2 bat.', true, 2]); assert.match(ok.detail, /2 navires dans la zone \(écoute continue depuis 5 s, 2 suivis, 4 messages\)/);
  horloge += 30 * 60000; // 30 min : le bateau en route n'est plus plausible, celui à quai l'est encore
  const muet = await creerSourceNavires({ reseau: reseauFaux(null, rep({ ships: [], confirmed: false, received: 0, listenMs: 10000 })), memoire, relais: 'r.example.org', maintenant: () => horloge }).charger({ pos: POS, rayonKm: 40, navires: new Map() });
  assert.deepEqual([muet.message, muet.ok, muet.restaure, [...muet.navires.keys()]], ['AISStream muet', false, true, ['1']]);
  assert.match(muet.detail, /AISStream muet : aucun accusé de réception ni message en 10 s/);
  const panne = await creerSourceNavires({ reseau: reseauFaux(null, rep({ error: 'x' }, 503)), memoire, relais: 'r.example.org', maintenant: () => horloge }).charger({ pos: POS, rayonKm: 40, navires: new Map() });
  assert.deepEqual([panne.message, panne.ok, panne.navires.size], ['indispo', false, 1]);
});
