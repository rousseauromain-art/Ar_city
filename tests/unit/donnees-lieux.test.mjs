// Données des lieux : décodeur MVT, fusion, Overpass, cache, atlas, orchestration — parité avec la v1 quand son code est extractible.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decoderTuileMVT, pointsDeFeature, etiquettesDeFeature, localVersLonLat, tuilesDeBoite, tuileDepuisPoint } from '../../src/donnees/mvt.js';
import { fusionnerParNomEtProximite } from '../../src/donnees/fusion.js';
import { typeDepuisEtiquettes, lireReponseOverpass, clausesLieux, requeteOverpass, creerOverpass } from '../../src/donnees/overpass.js';
import { creerCacheDonnees } from '../../src/donnees/cache-donnees.js';
import { creerAtlas, ATLAS_MAX, cleLieu } from '../../src/donnees/atlas.js';
import { creerOpenFreeMap, zoomPourRayon } from '../../src/donnees/openfreemap.js';
import { creerSourcesRelais, baseRelais } from '../../src/donnees/relais-lieux.js';
import { creerSourceLieux, sourceVivante } from '../../src/donnees/lieux.js';
import { listeIntegree } from '../../src/donnees/lieux-integres.js';
import { ErreurReseau } from '../../src/donnees/reseau.js';
import { normaliser } from '../../src/noyau/texte.js';
import { coucheMVT, tuileMVT } from './aide-mvt.mjs';
import { alea } from './aide-relief.mjs';
import { fauxCaches } from './aide-caches.mjs';

const src = readFileSync(new URL('../../v1/villes-horizon.html', import.meta.url), 'utf8');
/** @param {string} debut @param {string} fin */
const extraire = (debut, fin) => { const i = src.indexOf(debut), j = src.indexOf(fin, i); assert.ok(i >= 0 && j > i, `introuvable : ${debut}`); return src.slice(i, j + fin.length); };
/** Extrait de `debut` jusqu'à `fin` EXCLU. @param {string} debut @param {string} fin */
const extraireAvant = (debut, fin) => { const i = src.indexOf(debut), j = src.indexOf(fin, i); assert.ok(i >= 0 && j > i, `introuvable : ${debut}`); return src.slice(i, j); };
const v1 = new Function('D', `
${extraireAvant('function readVarint(buf,pos){', 'function tileRangeForBBox(bbox,z){')}
${extraire('function tileRangeForBBox(bbox,z){', '\n}\n')}
${extraire('const norm=t=>', ';\n')}
${extraire('function distBrg(a,b){', '\n}\n')}
${extraire('function mergeByNameProximity(lists,maxKm){', '\n}\n')}
${extraire('function kindOf(t){', '\n}\n')}
${extraire('function parseOverpass(j){', '\n}\n')}
${extraire('function zoomForRadius(rKm,lat){', '\n}\n')}
const SETTLE=new Set(['city','town','village','hamlet','isolated_dwelling']);
return {decodeMVTTile,featureMVTPoints,featureMVTTags,tileLocalToLonLat,tileRangeForBBox,lonLatToTileXY,mergeByNameProximity,kindOf,parseOverpass,zoomForRadius};`);
// kindOf et SETTLE sont déclarés plus haut dans la v1 : on les redéfinit autour de leur extraction
const V1 = (() => {
  try { return v1(Math.PI / 180); } catch { return null; }
})();

test('MVT : décodage identique à la v1 sur une tuile construite', { skip: V1 ? false : 'extraction v1 impossible' }, () => {
  const tuile = tuileMVT(
    coucheMVT('place', [{ x: 100, y: 200, tags: { name: 'Rennes', class: 'city', population: '216268' } }, { x: -5, y: 4095, tags: { 'name:fr': 'Saint-Malo', class: 'town' } }]),
    coucheMVT('water', [{ x: 1, y: 1, tags: { class: 'lake' } }]),
    coucheMVT('mountain_peak', [{ x: 2048, y: 2048, tags: { name: 'Mont Blanc', ele: '4808' } }]),
  );
  const a = decoderTuileMVT(tuile, ['place', 'mountain_peak']), b = V1.decodeMVTTile(tuile, ['place', 'mountain_peak']);
  assert.deepEqual(a, b); assert.deepEqual(Object.keys(a), ['place', 'mountain_peak']); // la couche « water » n'est pas décodée
  assert.deepEqual(Object.keys(decoderTuileMVT(tuile)), ['place', 'water', 'mountain_peak']);
  const f = a.place.features[1];
  assert.deepEqual(pointsDeFeature(f), [[-5, 4095]]); assert.deepEqual(pointsDeFeature(f), V1.featureMVTPoints(f));
  assert.deepEqual(etiquettesDeFeature(f, a.place), { 'name:fr': 'Saint-Malo', class: 'town' });
  assert.deepEqual(pointsDeFeature({ tags: [], type: 2, geometry: [] }), []); // seuls les points
});

test('MVT : géométrie des tuiles identique à la v1', { skip: V1 ? false : 'extraction v1 impossible' }, () => {
  const r = alea(21);
  for (let i = 0; i < 200; i++) {
    const z = 5 + Math.floor(r() * 9), lon = (r() - 0.5) * 340, lat = (r() - 0.5) * 140, ext = 4096;
    assert.deepEqual(tuileDepuisPoint(lon, lat, z), V1.lonLatToTileXY(lon, lat, z));
    const x = Math.floor(r() * 2 ** z), y = Math.floor(r() * 2 ** z), lx = r() * ext, ly = r() * ext;
    assert.deepEqual(localVersLonLat(z, x, y, lx, ly, ext), V1.tileLocalToLonLat(z, x, y, lx, ly, ext));
    const bb = { la1: lat - 0.5, la2: lat + 0.5, lo1: lon - 0.7, lo2: lon + 0.7 };
    assert.deepEqual(tuilesDeBoite(bb, z), V1.tileRangeForBBox(bb, z));
  }
});

test('lieux : type, réponse Overpass, zoom et fusion identiques à la v1', { skip: V1 ? false : 'extraction v1 impossible' }, () => {
  /** @type {Record<string, string>[]} */
  const etiquettes = [{ place: 'city' }, { man_made: 'lighthouse' }, { 'seamark:type': 'light_major' }, { natural: 'cape' }, { natural: 'peak' }, { place: 'islet' }, { natural: 'arch' }, { natural: 'beach' }, { tourism: 'viewpoint' }, { historic: 'fort' }, { man_made: 'windmill' }, {}];
  for (const t of etiquettes) assert.equal(typeDepuisEtiquettes(t), V1.kindOf(t), JSON.stringify(t));
  const rep = { elements: [
    { type: 'node', lat: 48.1, lon: -1.7, tags: { name: 'Rennes', place: 'city', population: '216268' } },
    { type: 'node', lat: 48.1, lon: -1.7, tags: { name: 'Rennes', place: 'city' } }, // doublon exact
    { type: 'way', center: { lat: 48.6, lon: -2 }, tags: { 'name:fr': 'Fort', name: 'Fortezza', historic: 'fort', ele: '12.5' } },
    { type: 'node', lat: 1, lon: 1, tags: { place: 'town' } }, // sans nom
    { type: 'node', tags: { name: 'Sans position' } },
  ] };
  assert.deepEqual(lireReponseOverpass(rep), V1.parseOverpass(rep));
  for (const [rKm, lat] of [[5, 48], [30, 48.6], [60, 45], [180, 48], [500, 70], [1, 0]]) assert.equal(zoomPourRayon(rKm, lat), V1.zoomForRadius(rKm, lat));
  const r = alea(5), noms = ['Rennes', 'rennes', 'Saint-Malo', 'Saint Malo', 'Dinard', 'Dinan', 'Cancale'];
  const liste = (/** @type {number} */ n) => Array.from({ length: n }, () => ({ name: noms[Math.floor(r() * noms.length)], lat: 48 + r() * 0.05, lon: -2 + r() * 0.05, kind: 'town', pop: r() < 0.5 ? 0 : 1000, ele: r() < 0.5 ? null : 10 }));
  for (let i = 0; i < 30; i++) {
    const L = [liste(8), liste(6), liste(4)], a = fusionnerParNomEtProximite(structuredClone(L), 1.5), b = V1.mergeByNameProximity(structuredClone(L), 1.5);
    assert.deepEqual(a, b);
  }
});

test('lieux : clauses de la requête (villes, villages, hameaux, repères cochés)', () => {
  const pos = { lat: 48.6, lon: -2 }, cap = (/** @type {number} */ km) => Math.min(30000, km * 1000);
  const cl = clausesLieux(pos, 30000, false, {}, cap);
  assert.equal(cl.length, 2); assert.match(cl[0], /city\|town.*around:30000,48.6,-2/); assert.match(cl[1], /village.*around:30000/);
  const tout = clausesLieux(pos, 200000, true, { lighthouse: true, rock: true }, (km) => Math.min(200000, km * 1000));
  assert.ok(tout.some((c) => /hamlet\|isolated_dwelling.*around:12000/.test(c)));
  assert.ok(tout.some((c) => /lighthouse.*around:40000/.test(c)));
  assert.ok(tout.some((c) => /island\|islet.*around:60000/.test(c))); // les îles ont leur propre portée
  assert.match(requeteOverpass(['a', 'b']), /^\[out:json\]\[timeout:25\];\(a;b;\);out center;$/);
});

/** Minuteur manuel : les échéances se déclenchent à la demande. */
function minuteurManuel() {
  let t = 0, id = 0;
  /** @type {Map<number, {at: number, f: () => void}>} */
  const m = new Map();
  return { setTimeout: (/** @type {() => void} */ f, /** @type {number} */ ms) => { m.set(++id, { at: t + ms, f }); return id; }, clearTimeout: (/** @type {number} */ i) => { m.delete(i); },
    avancer(/** @type {number} */ ms) { t += ms; for (const [i, e] of [...m]) if (e.at <= t) { m.delete(i); e.f(); } }, enAttente: () => m.size };
}
const ok = (/** @type {any} */ elements) => ({ elements });
const liberer = () => new Promise((r) => setImmediate(r));

test('Overpass : le miroir suivant part après 5 s, le premier qui répond gagne, les autres sont annulés', async () => {
  const mn = minuteurManuel(), appels = /** @type {string[]} */ ([]), annules = /** @type {string[]} */ ([]);
  const reseau = { requeter: (/** @type {string} */ ep, /** @type {any} */ o) => new Promise((resolve, reject) => {
    appels.push(ep); o.signal.addEventListener('abort', () => { annules.push(ep); reject(new ErreurReseau('annulée', 0, ep)); });
    if (ep.includes('mail.ru')) setTimeout(() => resolve(ok([{ type: 'node', lat: 1, lon: 2, tags: { name: 'A', place: 'town' } }])), 5);
  }) };
  const ovp = creerOverpass({ reseau, minuteur: mn, miroirs: ['https://a.test/x', 'https://maps.mail.ru/x', 'https://c.test/x'] });
  const p = ovp.interroger('q', 20000);
  await liberer(); assert.deepEqual(appels, ['https://a.test/x']);
  mn.avancer(5000); await liberer(); assert.equal(appels.length, 2);
  const r = await p;
  assert.deepEqual(r.map((/** @type {any} */ l) => l.name), ['A']); assert.deepEqual(annules, ['https://a.test/x']); assert.equal(ovp.dernierMiroir(), 'maps.mail.ru');
  assert.equal(mn.enAttente(), 0, 'plus de minuteur en attente');
});

test('Overpass : un échec franc passe au miroir suivant sans attendre ; tous en échec → erreur', async () => {
  const mn = minuteurManuel(), appels = /** @type {string[]} */ ([]);
  const reseau = { requeter: async (/** @type {string} */ ep) => { appels.push(ep); throw new ErreurReseau('HTTP 429', 429, ep); } };
  const ovp = creerOverpass({ reseau, minuteur: mn, miroirs: ['https://a.test/x', 'https://b.test/x'] });
  await assert.rejects(ovp.interroger('q', 1000), (/** @type {Error} */ e) => e.name === 'OverpassAllFailed' && /a\.test.*b\.test/.test(e.message));
  assert.deepEqual(appels, ['https://a.test/x', 'https://b.test/x']);
  // la file continue après une erreur
  const reseau2 = { requeter: async () => ok([]) };
  assert.deepEqual(await creerOverpass({ reseau: reseau2, minuteur: mn }).interroger('q', 1000), []);
});

test('Overpass : les requêtes sont exécutées une à la fois', async () => {
  let enCours = 0, max = 0;
  const reseau = { requeter: async () => { enCours++; max = Math.max(max, enCours); await liberer(); enCours--; return ok([]); } };
  const ovp = creerOverpass({ reseau, minuteur: minuteurManuel() });
  await Promise.all([ovp.interroger('1', 1000), ovp.interroger('2', 1000), ovp.interroger('3', 1000)]);
  assert.equal(max, 1);
});

test('cache : mémoire fraîche sans requête, requête enregistrée, secours périmé si le réseau échoue', async () => {
  let t = 1000;
  const c = creerCacheDonnees('vh2-test', { caches: /** @type {any} */ (fauxCaches()), maintenant: () => t });
  let appels = 0;
  const charger = async () => { appels++; return [{ a: 1 }]; };
  const r1 = await c.obtenir('pl', 'pl/x', { ttlMs: 100, charger });
  assert.deepEqual([r1.source, appels], ['reseau', 1]);
  t += 50; assert.equal((await c.obtenir('pl', 'pl/x', { ttlMs: 100, charger })).source, 'cache'); assert.equal(appels, 1);
  t += 200; // périmée : nouvelle requête qui échoue → secours
  const r3 = await c.obtenir('pl', 'pl/x', { ttlMs: 100, charger: async () => { throw new Error('panne'); } });
  assert.deepEqual([r3.source, r3.donnees], ['secours', [{ a: 1 }]]); assert.match(String(r3.erreur), /panne/);
  await assert.rejects(c.obtenir('pl', 'pl/jamais', { ttlMs: 100, charger: async () => { throw new Error('panne'); } }), /panne/);
  c.contournerPendant(1000); // bouton Recharger
  assert.equal((await c.obtenir('pl', 'pl/x', { ttlMs: 1e9, charger })).source, 'reseau');
  assert.deepEqual(c.compteurs().pl, { hit: 1, net: 2, stale: 1, fail: 1 });
});

test('cache : élagage des entrées les plus anciennes d’un préfixe', async () => {
  const caches = fauxCaches(), c = creerCacheDonnees('vh2-test', { caches: /** @type {any} */ (caches) });
  for (let i = 0; i < 12; i++) await c.obtenir('pl', `pl/k${i}`, { ttlMs: 1e9, charger: async () => [i], elaguer: ['pl/', 5] });
  const n = caches.noms.get('vh2-test')?.size ?? 0;
  assert.ok(n <= 12 && n >= 5, `entrées ${n}`);
});

test('atlas : cumul, plafond et reprise depuis le stockage', () => {
  /** @type {Record<string, any>} */
  const mem = {};
  const stockage = { lire: (/** @type {string} */ n, /** @type {any} */ d) => mem[n] ?? d, ecrire: (/** @type {string} */ n, /** @type {any} */ v) => { mem[n] = JSON.parse(JSON.stringify(v)); return true; } };
  const a = creerAtlas(stockage);
  const lieu = (/** @type {string} */ n, /** @type {number} */ i) => ({ name: n, lat: 48 + i * 0.01, lon: -2, kind: 'town', pop: 1, ele: null });
  assert.equal(a.absorber([lieu('A', 0), lieu('B', 1)], { lat: 48, lon: -2 }, 30, 1), 2);
  assert.equal(a.absorber([lieu('B', 1), lieu('C', 2)], { lat: 48, lon: -2 }, 30, 2), 1);
  assert.equal(a.nombre(), 3); assert.equal(a.zones().length, 2);
  assert.equal(creerAtlas(stockage).nombre(), 3); // repris du stockage
  assert.equal(cleLieu(lieu('A', 0)), 'A@48.000,-2.000');
  const gros = Array.from({ length: ATLAS_MAX + 50 }, (_, i) => ({ name: 'L' + i, lat: 40 + (i % 1000) * 0.001, lon: i * 0.0001, kind: 'village', pop: 0, ele: null }));
  a.absorber(gros, null, 30, 3);
  assert.equal(a.nombre(), ATLAS_MAX);
  a.effacer(); assert.equal(a.nombre(), 0);
});

test('OpenFreeMap : lieux et sommets d’une tuile, hameaux filtrés, tuile en échec tolérée', async () => {
  const tuile = tuileMVT(
    coucheMVT('place', [{ x: 2048, y: 2048, tags: { name: 'Rennes', class: 'city', population: '216268' } }, { x: 2100, y: 2100, tags: { name: 'La Lande', class: 'hamlet' } }, { x: 10, y: 10, tags: { name: 'Quartier', class: 'suburb' } }]),
    coucheMVT('mountain_peak', [{ x: 3000, y: 3000, tags: { name: 'Mont Dol', ele: '65' } }]));
  const reseau = { requeter: async (/** @type {string} */ url) => { if (url.endsWith('/planet')) return { tiles: ['https://t.test/{z}/{x}/{y}.pbf'] }; return tuile; } };
  const ofm = creerOpenFreeMap({ reseau });
  const sans = await ofm.charger({ lat: 48.1, lon: -1.7 }, 30, false);
  assert.ok(sans.some((l) => l.name === 'Rennes' && l.kind === 'city' && l.pop === 216268));
  assert.ok(!sans.some((l) => l.name === 'La Lande'), 'hameau écarté sans l’option'); assert.ok(!sans.some((l) => l.name === 'Quartier'), 'classe inconnue écartée');
  assert.ok(sans.some((l) => l.name === 'Mont Dol' && l.kind === 'peak' && l.ele === 65));
  const avec = await ofm.charger({ lat: 48.1, lon: -1.7 }, 30, true);
  assert.ok(avec.some((l) => l.name === 'La Lande' && l.kind === 'hamlet'));
  const toutEnEchec = creerOpenFreeMap({ reseau: { requeter: async (/** @type {string} */ u) => { if (u.endsWith('/planet')) return { tiles: ['https://t.test/{z}/{x}/{y}.pbf'] }; throw new Error('HTTP 500'); } } });
  await assert.rejects(toutEnEchec.charger({ lat: 48.1, lon: -1.7 }, 30, false), /toutes en échec/);
  await assert.rejects(creerOpenFreeMap({ reseau: { requeter: async () => ({}) } }).charger({ lat: 48, lon: -1 }, 30, false), /TileJSON/);
});

test('relais : adresse normalisée, catégories demandées, panne partielle tolérée', async () => {
  assert.equal(baseRelais('villes-horizon-relais.x.workers.dev'), 'https://villes-horizon-relais.x.workers.dev'); assert.equal(baseRelais(' '), ''); assert.equal(baseRelais(undefined), '');
  const urls = /** @type {string[]} */ ([]);
  const reseau = { requeter: async (/** @type {string} */ u) => { urls.push(u); if (/kind=view/.test(u)) throw new Error('boum'); return { places: [{ name: 'X', lat: 1, lon: 2, kind: 'town', pop: 0, ele: null }] }; } };
  const s = creerSourcesRelais({ reseau, relais: 'https://r.test' });
  assert.equal(s.disponible, true);
  const r = await s.geoapify({ lat: 48, lon: -2 }, 30, { cape: true, view: true, beach: true });
  assert.equal(r.length, 3); // villes + sommets + plages ; points de vue en échec
  assert.ok(urls.some((u) => /geoapify\?lat=48.00000&lon=-2.00000&radius_km=30&kind=sommets/.test(u)));
  await s.geonames({ lat: 48, lon: -2 }, 30, { view: true }); assert.ok(!urls.some((u) => /geonames.*kind=view/.test(u)), 'GeoNames ne cherche pas les points de vue');
  await assert.rejects(creerSourcesRelais({ reseau: { requeter: async () => { throw new Error('tout en panne'); } }, relais: 'r.test' }).geonames({ lat: 1, lon: 1 }, 5, {}), /tout en panne/);
  assert.equal(creerSourcesRelais({ reseau, relais: '' }).disponible, false);
});

/** Orchestrateur avec des sources factices. */
function orchestre({ osm = /** @type {any} */ ([]), ofm = /** @type {any} */ ([]), relais = false, t = { v: 1000 }, echecOsm = false } = {}) {
  const cache = creerCacheDonnees('vh2-t', { caches: /** @type {any} */ (fauxCaches()), maintenant: () => t.v });
  /** @type {Record<string, any>} */
  const mem = {};
  const atlas = creerAtlas({ lire: (n, d) => mem[n] ?? d, ecrire: (n, v) => { mem[n] = JSON.parse(JSON.stringify(v)); return true; } });
  const appels = /** @type {string[]} */ ([]);
  const src = creerSourceLieux({
    cache, atlas,
    overpass: /** @type {any} */ ({ interroger: async () => { appels.push('osm'); if (echecOsm) throw new Error('osm en panne'); return osm; } }),
    openfreemap: /** @type {any} */ ({ charger: async () => { appels.push('ofm'); return ofm; } }),
    relais: /** @type {any} */ ({ disponible: relais, geoapify: async () => { appels.push('gpf'); return []; }, geonames: async () => { appels.push('gnm'); return []; } }),
  });
  return { src, appels, atlas, cache };
}
const L = (/** @type {string} */ name, /** @type {string} */ kind, /** @type {number} */ lat = 48, /** @type {number} */ lon = -2, /** @type {number|null} */ ele = null) => ({ name, lat, lon, kind, pop: 0, ele });
const base = { pos: { lat: 48.1, lon: -1.7 }, rayonKm: 30, hameaux: true, reperes: { lighthouse: true } };

test('lieux : sources fusionnées (la première prioritaire), hameaux filtrés, atlas alimenté', async () => {
  const o = orchestre({ osm: [L('Rennes', 'city', 48.1, -1.7), L('La Lande', 'hamlet')], ofm: [L('rennes', 'city', 48.1, -1.7, 40), L('Dinan', 'town')] });
  const r = await o.src.charger(base);
  assert.deepEqual(r.lieux.map((l) => l.name), ['Rennes', 'La Lande', 'Dinan']); assert.equal(r.lieux[0].ele, 40); // altitude complétée par la 2e source
  assert.deepEqual([r.source, r.secours, r.enLigne], ['OSM+OpenFreeMap', false, true]); assert.equal(o.atlas.nombre(), 3);
  assert.deepEqual((await o.src.charger({ ...base, hameaux: false })).lieux.map((l) => l.name), ['Rennes', 'Dinan']);
});

test('lieux : mémoire par zone (7 jours) ; une source en panne n’empêche pas les autres ; la mémoire périmée sert de secours', async () => {
  const t = { v: 1000 }, o = orchestre({ osm: [L('A', 'town')], ofm: [L('B', 'town')], t });
  await o.src.charger(base); const n1 = o.appels.length;
  await o.src.charger(base); assert.equal(o.appels.length, n1, 'deuxième chargement servi par la mémoire');
  t.v += 8 * 86400000; // mémoire périmée, OSM en panne : secours + OpenFreeMap rechargée
  const p = orchestre({ osm: [], ofm: [L('B', 'town')], t, echecOsm: true });
  const r = await p.src.charger(base);
  assert.deepEqual(r.lieux.map((l) => l.name), ['B']); assert.equal(r.source, 'OpenFreeMap');
  const sans = orchestre({ osm: [L('A', 'town')], ofm: [], relais: true });
  await sans.src.charger(base); assert.deepEqual(sans.appels.sort(), ['gnm', 'gpf', 'ofm', 'osm']); // le relais ajoute ses deux sources
});

test('lieux : sans aucune source → lieux déjà chargés si vivants, sinon atlas, sinon liste intégrée', async () => {
  const tout = async (/** @type {string} */ sourceActuelle, /** @type {boolean} */ avecAtlas) => {
    const o = orchestre({ echecOsm: true });
    o.src.charger = o.src.charger.bind(o.src);
    const panne = creerSourceLieux({ cache: o.cache, atlas: o.atlas, overpass: /** @type {any} */ ({ interroger: async () => { throw new Error('x'); } }), openfreemap: /** @type {any} */ ({ charger: async () => { throw new Error('y'); } }), relais: /** @type {any} */ ({ disponible: false }) });
    if (avecAtlas) o.atlas.absorber([L('Atlas', 'town')], null, 30);
    return panne.charger({ ...base, sourceActuelle, lieuxActuels: [L('Actuel', 'town')] });
  };
  assert.deepEqual((await tout('OSM', false)).lieux.map((l) => l.name), ['Actuel']);
  const a = await tout('liste intégrée (hors ligne)', true); assert.deepEqual([a.lieux.map((l) => l.name), a.source, a.enLigne], [['Atlas'], 'atlas local (1 lieux)', false]);
  const i = await tout('', false); assert.equal(i.source, 'liste intégrée (hors ligne)'); assert.equal(i.lieux.length, listeIntegree().length); assert.ok(i.lieux.some((l) => l.name === 'Rennes'));
  assert.equal(sourceVivante('OSM+OpenFreeMap(mémoire)'), false); assert.equal(sourceVivante('OSM+OpenFreeMap'), true); assert.equal(sourceVivante(''), false);
});

test('lieux : quand recharger', () => {
  const { src } = orchestre();
  const p = { dernier: { lat: 48, lon: -2 }, source: 'OSM', rayonCharge: 30, pos: { lat: 48, lon: -2 }, rayonKm: 30 };
  assert.equal(src.doitRecharger(p), false);
  assert.equal(src.doitRecharger({ ...p, force: true }), true); assert.equal(src.doitRecharger({ ...p, dernier: null }), true);
  assert.equal(src.doitRecharger({ ...p, source: 'atlas local (3 lieux)' }), true); assert.equal(src.doitRecharger({ ...p, rayonKm: 60 }), true);
  assert.equal(src.doitRecharger({ ...p, pos: { lat: 48.1, lon: -2 } }), true); // ~11 km > 25 % de 30 km
  assert.equal(normaliser('Châteaubriant'), 'chateaubriant');
});

test('lieux : publication progressive — OpenFreeMap s’affiche sans attendre Overpass, le résultat final est celui d’un chargement sans rappel', async () => {
  /** @type {() => void} */
  let finirOsm = () => {};
  const osmLent = new Promise((ok) => { finirOsm = () => ok([L('Rennes', 'city', 48.1, -1.7), L('La Lande', 'hamlet')]); });
  const fabrique = (/** @type {Promise<any>} */ osm) => {
    const mem = /** @type {Record<string, any>} */ ({});
    return creerSourceLieux({ cache: creerCacheDonnees('vh2-p', { caches: /** @type {any} */ (fauxCaches()) }), atlas: creerAtlas({ lire: (n, d) => mem[n] ?? d, ecrire: (n, v) => { mem[n] = v; return true; } }),
      overpass: /** @type {any} */ ({ interroger: () => osm }), openfreemap: /** @type {any} */ ({ charger: async () => [L('rennes', 'city', 48.1, -1.7, 40), L('Dinan', 'town')] }),
      relais: /** @type {any} */ ({ disponible: false }) });
  };
  const partiels = /** @type {{noms: string[], source: string, sources: any[]}[]} */ ([]);
  const enCours = fabrique(osmLent).charger({ ...base, quandPartiel: (p) => partiels.push({ noms: p.lieux.map((l) => l.name), source: p.source, sources: p.sources }) });
  await new Promise((ok) => setTimeout(ok, 20));
  assert.equal(partiels.length, 1, 'une publication partielle, Overpass n’a pas répondu');
  assert.deepEqual(partiels[0].noms, ['rennes', 'Dinan']); assert.equal(partiels[0].source, 'OpenFreeMap (en cours)');
  assert.deepEqual(partiels[0].sources.map((s) => [s.nom, s.etat]), [['OSM', 'en cours'], ['OpenFreeMap', 'réseau']]);
  finirOsm();
  const final = await enCours;
  const sansRappel = await fabrique(Promise.resolve([L('Rennes', 'city', 48.1, -1.7), L('La Lande', 'hamlet')])).charger(base);
  assert.deepEqual(final.lieux, sansRappel.lieux); assert.equal(final.source, 'OSM+OpenFreeMap');
  assert.deepEqual(final.sources.map((s) => s.etat), ['réseau', 'réseau']);
  assert.equal(partiels.length, 2, 'puis une publication par source réglée');
});

test('lieux : une source en échec est annoncée avec sa raison', async () => {
  const mem = /** @type {Record<string, any>} */ ({});
  const src = creerSourceLieux({ cache: creerCacheDonnees('vh2-e', { caches: /** @type {any} */ (fauxCaches()) }), atlas: creerAtlas({ lire: (n, d) => mem[n] ?? d, ecrire: (n, v) => { mem[n] = v; return true; } }),
    overpass: /** @type {any} */ ({ interroger: async () => { throw new Error('HTTP 504'); } }), openfreemap: /** @type {any} */ ({ charger: async () => [L('Dinan', 'town')] }), relais: /** @type {any} */ ({ disponible: false }) });
  const r = await src.charger(base);
  assert.deepEqual(r.sources.map((s) => [s.nom, s.etat, s.raison ?? s.n]), [['OSM', 'échec', 'HTTP 504'], ['OpenFreeMap', 'réseau', 1]]);
});
