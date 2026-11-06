// @ts-nocheck — données synthétiques : le typage n'apporte rien ici.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hauteurBatiment, batimentsDeTuile, tuilesBatiments, creerSourceBatiments, GABARIT_BDTOPO } from '../../src/donnees/bdtopo.js';
import { creerCacheDonnees } from '../../src/donnees/cache-donnees.js';
import { tuileDepuisPoint, localVersLonLat } from '../../src/donnees/mvt.js';
import { coucheGeometriesMVT, tuileMVT } from './aide-mvt.mjs';
import { fauxCaches } from './aide-caches.mjs';

const POS = { lat: 48.8566, lon: 2.3522 }, T = { z: 15, ...tuileDepuisPoint(POS.lon, POS.lat, 15) };
const carre = (x, y, c) => [[x, y], [x + c, y], [x + c, y + c], [x, y + c]];
const tuile = () => tuileMVT(coucheGeometriesMVT('batiment', [
  { type: 'polygone', tags: { hauteur: '25.5' }, traces: [carre(2000, 2000, 80)] },
  { type: 'polygone', tags: { nombre_d_etages: '5' }, traces: [carre(2200, 2000, 80)] },
  { type: 'polygone', tags: {}, traces: [carre(2400, 2000, 80)] }]), coucheGeometriesMVT('autre', [{ type: 'polygone', traces: [carre(0, 0, 50)] }]));

test('hauteur : tag hauteur, sinon étages × 3, sinon 6 m', () => {
  assert.deepEqual(hauteurBatiment({ hauteur: '12.5' }), { h: 12.5, connue: true });
  assert.deepEqual(hauteurBatiment({ nombre_d_etages: '4' }), { h: 12, connue: true });
  assert.deepEqual(hauteurBatiment({ hauteur: '0', nombre_d_etages: 'x' }), { h: 6, connue: false });
});

test('tuile : trois bâtiments, hauteurs, coordonnées exactes, couche « autre » ignorée', () => {
  const r = batimentsDeTuile(tuile(), T);
  assert.equal(r.batiments.length, 3); assert.equal(r.n, 3); assert.equal(r.nHauteur, 2);
  assert.deepEqual(r.batiments.map((b) => b.h), [25.5, 15, 6]);
  const ll = localVersLonLat(T.z, T.x, T.y, 2000, 2000, 4096);
  assert.ok(Math.abs(r.batiments[0].pts[0] - ll.lat) < 1e-9 && Math.abs(r.batiments[0].pts[1] - ll.lon) < 1e-9);
  assert.equal(r.batiments[0].pts.length, 8);
  assert.deepEqual(batimentsDeTuile(new Uint8Array(0), T).batiments, []);
});

test('tuilesBatiments : les plus proches d\'abord, la tuile de la position en tête', () => {
  const t = tuilesBatiments(POS), moi = tuileDepuisPoint(POS.lon, POS.lat, 15);
  assert.ok(t.length >= 4 && t.length <= 70);
  assert.ok(t.some((x) => x.x === moi.x && x.y === moi.y));
  for (let i = 1; i < t.length; i++) assert.ok(t[i].distKm >= t[i - 1].distKm);
});

function source({ ign = 'ok', relais = 'https://relais.exemple' } = {}) {
  const appels = [];
  const reseau = { requeter: async (url) => {
    appels.push(url);
    if (url.startsWith('https://data.geopf.fr')) { if (ign === '404') { const e = new Error('HTTP 404'); e.statut = 404; throw e; } if (ign === 'refuse') throw new Error('échec réseau'); }
    return tuile();
  } };
  return { appels, src: creerSourceBatiments({ reseau, cache: creerCacheDonnees('vh2-bd', { caches: fauxCaches() }), relais }) };
}

test('source : direct, puis mémoire (aucune 2e requête) ; 404 = tuile vide', async () => {
  const a = source(), r1 = await a.src.charger({ pos: POS, rayonKm: 0.3 }), n1 = a.appels.length;
  assert.ok(r1.batiments.length >= 3 && r1.tuilesOk === r1.tuiles && !r1.viaRelais);
  const r2 = await a.src.charger({ pos: POS, rayonKm: 0.3 });
  assert.equal(a.appels.length, n1); assert.equal(r2.tuilesCache, r2.tuiles);
  const b = source({ ign: '404' }), r3 = await b.src.charger({ pos: POS, rayonKm: 0.3 });
  assert.equal(r3.batiments.length, 0); assert.equal(r3.tuilesEchec, 0);
});

test('source : IGN refusé → relais /bdtopo, le reste de la session passe par lui', async () => {
  const a = source({ ign: 'refuse' }), r = await a.src.charger({ pos: POS, rayonKm: 1 });
  assert.ok(r.viaRelais && r.batiments.length > 0);
  assert.ok(a.appels.some((u) => u.startsWith('https://relais.exemple/bdtopo?z=15&x=')));
  const directs = a.appels.filter((u) => u.startsWith('https://data.geopf.fr')).length;
  assert.ok(directs >= 1 && directs <= 4, 'au plus une tentative directe par tuile en vol, puis tout par le relais');
  const apres = (await a.src.charger({ pos: POS, rayonKm: 1 })).viaRelais; assert.ok(apres);
  const b = source({ ign: 'refuse', relais: '' }), r2 = await b.src.charger({ pos: POS, rayonKm: 0.3 });
  assert.equal(r2.tuilesEchec, r2.tuiles); assert.ok(GABARIT_BDTOPO.includes('{z}'));
});
