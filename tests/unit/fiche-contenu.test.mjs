// @ts-nocheck
// Fiches : fonctions de la v1 déplacées (le texte est comparé à la v1 sur une scène réelle par tests/e2e/fiches-parite.spec.js) ; ici, l'aiguillage et les ajouts de la v2.
import test from 'node:test';
import assert from 'node:assert/strict';
import { contenuFiche, lienWikipediaLieu } from '../../src/ui/fiche-contenu.js';

const ctx = { S: { relief: true, beyond: false }, terrain: { h0: 12, origine: 'mapterhorn' }, maintenantMs: Date.UTC(2026, 10, 7) };
const texte = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

test('aiguillage comme la v1 (TAP_DETAIL) : monument, équipement, ANFR, avion, bateau, KML', () => {
  assert.equal(contenuFiche({ kind: 'monument', name: 'Fort', type: 'chateau', dist: 1.2, links: 30, qid: 'Q1' }, null, ctx).titre, 'Monument');
  assert.equal(contenuFiche({ kind: 'monument', cat: 'equip', name: 'Gare', type: 'gare', dist: 1.2 }, null, ctx).titre, 'Équipement');
  const anfr = contenuFiche({ kind: 'telecom', name: 'Pylône', dist: 2, sup_id: 7, operators: [{ name: 'Orange', systems: [{ system: '5G NR 3500', status: 'En service', date: '2024-01-02' }] }], owner: 'TDF', address: '1 rue', cp: '35510' }, null, ctx);
  assert.equal(anfr.titre, 'Support telecom'); assert.match(texte(anfr.html), /Orange 5G NR 3500 \(En service, 2024\)/); assert.match(anfr.html, /TDF \(exploitant\)/);
  assert.equal(contenuFiche({ kind: 'plane', name: 'AFR1', id: 'abc', alt: 1000, vel: 200, trk: 90, dist: 5, t: ctx.maintenantMs - 120000 }, null, ctx).titre, 'Avion');
  assert.equal(contenuFiche({ kind: 'ship', name: 'Navire', mmsi: '227', type: 60, vel: 3, trk: 10, dist: 2, t: ctx.maintenantMs }, null, ctx).titre, 'Navire');
  assert.equal(contenuFiche({ kind: 'user', name: 'Site', lname: 'Couche', col: '#fff', lat: 48, lon: -2, dist: 1, cols: [], vals: [], links: [] }, null, ctx).titre, 'Couche');
});

test('monument : diagnostic d\'affichage replié avec toutes les valeurs (verdict, rang, hauteurs, relief, œil, sol, angles, crête, marge)', () => {
  const f = contenuFiche({ kind: 'monument', name: 'Château d\'eau', type: 'tour', dist: 1.8, brg: 80, links: 3, ht: 40, angH: 1.2, rang: 4, demSol: 30, aG: 0.5, aP: 1.7, mask: 0.4, hidden: false }, null, ctx);
  const t = texte(f.html);
  for (const k of ['verdict', 'rang parmi les monuments nets', 'hauteur utilisée', 'hauteur apparente', 'relief : actif · source mapterhorn · œil à 12.0 m', 'altitude du sol sous le monument : 30.0 m', 'angle sol / sommet', 'crête devant', 'marge de visibilité']) assert.ok(t.includes(k), k);
  assert.match(f.html, /<details class="dg"/);
});

test('groupe : liste complète triée par distance, le plus proche déplié ; +N : l\'icône d\'abord puis les cachés, dans l\'ordre', () => {
  const g = [{ kind: 'telecom', name: 'B', dist: 3, sup_id: 2 }, { kind: 'telecom', name: 'A', dist: 1, sup_id: 1 }];
  const f = contenuFiche(g[0], g, ctx);
  assert.equal(f.titre, '2 supports telecom'); assert.ok(f.html.indexOf('A</div>') < f.html.indexOf('B</div>')); assert.equal((f.html.match(/<details class="telgrp" open>/g) || []).length, 1);
  const m = { kind: 'monument', name: 'Tour', type: 'tour', dist: 2, _hidObjs: [{ kind: 'monument', name: 'Clocher', type: 'clocher', dist: 1 }] };
  const h = contenuFiche(m, null, ctx);
  assert.equal(h.titre, '2 monuments'); assert.ok(h.html.indexOf('Tour') < h.html.indexOf('Clocher'));
});

test('lieu : Wikipédia mène à l\'article (tag wikipedia ou wikidata), sinon « Rechercher sur Wikipédia »', () => {
  assert.match(lienWikipediaLieu({ name: 'Dinard', wikipedia: 'fr:Dinard' }), /href="https:\/\/fr\.wikipedia\.org\/wiki\/Dinard">Wikipédia</);
  assert.match(lienWikipediaLieu({ name: 'Dinard', wikidata: 'Q212433' }), /GoToLinkedPage\/frwiki\/Q212433">Wikipédia</);
  assert.match(lienWikipediaLieu({ name: 'Saint-Test' }), />Rechercher sur Wikipédia</);
  const f = contenuFiche({ name: 'Saint-Test', kind: 'town', pop: 12000, dist: 3.5, lat: 48, lon: -2 }, null, ctx);
  assert.equal(f.titre, 'Ville'); assert.match(texte(f.html), /12 000 habitants/);
});
