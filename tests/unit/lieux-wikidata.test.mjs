// @ts-nocheck — doublures de test.
// Repli Wikidata pour les lieux : requête, lecture de la réponse, et appel seulement quand OpenStreetMap (Overpass) est en échec.
import test from 'node:test';
import assert from 'node:assert/strict';
import { requeteSparql, lireReponse, creerWikidataLieux, CLASSES, RAYON_MAX_KM } from '../../src/donnees/wikidata-lieux.js';
import { creerSourceLieux } from '../../src/donnees/lieux.js';
import { creerCacheDonnees } from '../../src/donnees/cache-donnees.js';
import { creerAtlas } from '../../src/donnees/atlas.js';
import { fauxCaches } from './aide-caches.mjs';

const b = (id, nom, lon, lat, classe, pop) => ({ item: { value: 'http://www.wikidata.org/entity/' + id }, itemLabel: { value: nom }, coord: { value: `Point(${lon} ${lat})` }, classe: { value: 'http://www.wikidata.org/entity/' + classe }, ...(pop ? { pop: { value: String(pop) } } : {}) });
const JSON_WD = { results: { bindings: [b('Q1', 'Dinard', -2.0667, 48.633, 'Q484170', 10000), b('Q1', 'Dinard', -2.0667, 48.633, 'Q3957', 11000), b('Q2', 'Saint-Malo', -2.0172, 48.6493, 'Q484170', 46000), b('Q3', 'Cézembre', -2.0, 48.68, 'Q23442'), b('Q4', 'Q4567', -2, 48.6, 'Q532'), b('Q5', 'La Lande', -2.1, 48.5, 'Q5084'), b('Q6', 'Inconnu', -2, 48.6, 'Q99999')] } };

test('requête : centre « Point(lon lat) », rayon borné, toutes les classes', () => {
  const q = requeteSparql({ lat: 48.65, lon: -2.03 }, 500);
  assert.match(q, /Point\(-2\.03000 48\.65000\)/); assert.match(q, new RegExp(`radius "${RAYON_MAX_KM}"`)); for (const c of Object.keys(CLASSES)) assert.ok(q.includes('wd:' + c));
});
test('réponse : un lieu par entité (le plus peuplé), libellés « Q… » et classes inconnues écartés, hameaux filtrés', () => {
  const avec = lireReponse(JSON_WD, true), sans = lireReponse(JSON_WD, false);
  assert.deepEqual(avec.map((l) => [l.name, l.kind, l.pop]), [['Dinard', 'town', 11000], ['Saint-Malo', 'village', 46000], ['Cézembre', 'island', 0], ['La Lande', 'hamlet', 0]]);
  assert.ok(!sans.some((l) => l.name === 'La Lande')); assert.deepEqual(lireReponse(null, true), []);
});
test('chargeur : une requête GET sur le service SPARQL', async () => {
  const urls = []; const w = creerWikidataLieux({ reseau: { requeter: async (u) => { urls.push(u); return JSON_WD; } } });
  const l = await w.charger({ lat: 48.65, lon: -2.03 }, 30, true); assert.equal(l.length, 4); assert.match(urls[0], /^https:\/\/query\.wikidata\.org\/sparql\?format=json&query=/);
});

function orchestre({ echecOsm, wd }) {
  const cache = creerCacheDonnees('vh2-t', { caches: fauxCaches(), maintenant: () => 1000 }), mem = {}, appels = [];
  const atlas = creerAtlas({ lire: (n, d) => mem[n] ?? d, ecrire: (n, v) => { mem[n] = JSON.parse(JSON.stringify(v)); return true; } });
  const src = creerSourceLieux({ cache, atlas, overpass: { interroger: async () => { appels.push('osm'); if (echecOsm) throw new Error('504'); return [{ name: 'Rennes', lat: 48.1, lon: -1.7, kind: 'city', pop: 0, ele: null }]; } },
    openfreemap: { charger: async () => { appels.push('ofm'); return [{ name: 'Dinan', lat: 48.45, lon: -2.04, kind: 'town', pop: 0, ele: null }]; } }, relais: { disponible: false },
    wikidata: { charger: async () => { appels.push('wd'); if (wd === 'echec') throw new Error('wdqs 429'); return [{ name: 'Dinard', lat: 48.633, lon: -2.067, kind: 'town', pop: 10000, ele: null }, { name: 'dinan', lat: 48.45, lon: -2.04, kind: 'town', pop: 14000, ele: null }]; } } });
  return { src, appels };
}
const base = { pos: { lat: 48.1, lon: -1.7 }, rayonKm: 30, hameaux: true, reperes: {} };

test('Wikidata n\'est appelé que si OpenStreetMap est en échec ; ses lieux s\'ajoutent à ceux des autres sources', async () => {
  const bon = orchestre({ echecOsm: false }), r1 = await bon.src.charger(base);
  assert.ok(!bon.appels.includes('wd')); assert.ok(!r1.source.includes('Wikidata'));
  const panne = orchestre({ echecOsm: true }), partiels = [], r2 = await panne.src.charger({ ...base, quandPartiel: (p) => partiels.push(p.source) });
  assert.ok(panne.appels.includes('wd')); assert.equal(r2.source, 'OpenFreeMap+Wikidata'); assert.deepEqual(r2.lieux.map((l) => l.name).sort(), ['Dinan', 'Dinard']); assert.equal(r2.enLigne, true);
  assert.ok(r2.sources.some((s) => s.nom === 'Wikidata' && s.etat === 'réseau' && s.n === 2)); assert.ok(partiels.some((s) => s.includes('OpenFreeMap')) && partiels[partiels.length - 1].includes('Wikidata'));
});
test('Wikidata en échec aussi : le diagnostic le dit, les autres sources restent', async () => {
  const o = orchestre({ echecOsm: true, wd: 'echec' }), r = await o.src.charger(base);
  assert.equal(r.source, 'OpenFreeMap'); assert.deepEqual(r.lieux.map((l) => l.name), ['Dinan']); assert.ok(r.sources.some((s) => s.nom === 'Wikidata' && s.etat === 'échec' && /429/.test(s.raison)));
});
