// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { contenuFiche } from '../../src/ui/fiche-contenu.js';

const noms = (f) => f.lignes.map(([k]) => k);
const urls = (f) => f.liens.map(([, u]) => u).join(' ');

test('lieu : type, distance, direction, altitude, population, liens', () => {
  const f = contenuFiche({ type: 'lieu', principal: { name: 'Dinard', kind: 'town', dist: 3.456, brg: 92.4, ele: 14, pop: 10400, lat: 48.63, lon: -2.06 }, elements: [{}] });
  assert.equal(f.titre, 'Dinard'); assert.equal(f.sousTitre, 'ville');
  assert.deepEqual(f.lignes, [['Distance', '3,5 km'], ['Direction', '92°'], ['Altitude', '14 m'], ['Population', '10 400']]);
  assert.match(urls(f), /wikipedia.*Dinard/); assert.match(urls(f), /openstreetmap/);
});

test('monument : hauteur connue ou supposée, liens Wikidata', () => {
  const connu = contenuFiche({ type: 'monument', principal: { name: 'Tour Solidor', kind: 'monument', type: 'tour', htWd: 65, qid: 'Q123', dist: 1.2, brg: 10, lat: 48.6, lon: -2 }, elements: [{}, {}] });
  assert.equal(connu.plus, 1); assert.ok(noms(connu).includes('Hauteur')); assert.deepEqual(connu.lignes.find(([k]) => k === 'Hauteur'), ['Hauteur', '65 m (Wikidata)']);
  assert.match(urls(connu), /Special:GoToLinkedPage\/frwiki\/Q123/); assert.match(urls(connu), /wikidata\.org\/wiki\/Q123/);
  const inconnu = contenuFiche({ type: 'monument', principal: { name: 'Chapelle', kind: 'monument', dist: 12 }, elements: [{}] });
  assert.deepEqual(inconnu.lignes.find(([k]) => k === 'Hauteur'), ['Hauteur', 'inconnue (supposée 12 m)']); assert.deepEqual(inconnu.lignes[0], ['Distance', '12 km']);
});

test('avion et bateau : vitesses converties, liens externes', () => {
  const a = contenuFiche({ type: 'avion', principal: { name: 'AF123', id: 'abc123', alt: 10000, vel: 250, trk: 45, dist: 20, brg: 200 }, elements: [{}] });
  assert.ok(a.lignes.some(([k, v]) => k === 'Vitesse' && v === '900 km/h')); assert.match(urls(a), /adsbexchange.*abc123/); assert.match(urls(a), /flightradar24.*AF123/);
  const b = contenuFiche({ type: 'bateau', principal: { name: 'Ferry', mmsi: '227000000', vel: 5.14, trk: 90, lat: 48.6, lon: -2.0, dist: 2 }, elements: [{}, {}, {}] });
  assert.equal(b.plus, 2); assert.ok(b.lignes.some(([k, v]) => k === 'Vitesse' && v === '10,0 nœuds')); assert.match(urls(b), /marinetraffic.*227000000/); assert.match(urls(b), /vesselfinder/);
});

test('élément sans données : une fiche minimale, sans erreur', () => {
  const f = contenuFiche({ type: 'bande', principal: null, elements: [] });
  assert.equal(f.titre, 'Sans nom'); assert.deepEqual(f.lignes, []);
});
