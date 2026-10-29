// Moteur de scène : réglages (défauts, migration, liste blanche), ruban de cap, message central, bandeau d'état.
import test from 'node:test';
import assert from 'node:assert/strict';
import { reglagesParDefaut, fusionnerReglages, reglagesAMemoriser, CLES_MEMORISEES } from '../../src/moteur/reglages.js';
import { commandesRuban } from '../../src/rendu/ruban-cap.js';
import { messageCentral, texteStatut } from '../../src/moteur/statut.js';

const vue = { largeurPx: 400, hauteurPx: 800, capDeg: 90, inclinaisonDeg: 0, roulisDeg: 0, champDeg: 60 };
const familles = { affichage: 'A', mono: 'M' };

test('réglages : défauts, clés inconnues ignorées, sous-objets fusionnés', () => {
  const S = fusionnerReglages({ radius: 25, inconnue: 1, layers: { places: false }, poi: { beach: false }, filter: 'x' });
  assert.equal(S.radius, 25);
  assert.equal(/** @type {any} */ (S).inconnue, undefined);
  assert.equal(S.layers.places, false);
  assert.equal(S.layers.monuments, true, 'les autres calques gardent leur valeur par défaut');
  assert.equal(S.poi.beach, false);
  assert.equal(S.filter, '', 'le filtre n’est pas mémorisé');
  assert.deepEqual(fusionnerReglages(null), reglagesParDefaut());
  assert.deepEqual(fusionnerReglages('n’importe quoi'), reglagesParDefaut());
});

test('réglages : l’ancienne clé autoCal éteint l’analyse de la photo', () => {
  assert.equal(fusionnerReglages({ autoCal: true, photoVis: true }).photoVis, false);
});

test('réglages : seule la liste blanche est mémorisée ; en photo, le calage d’avant la photo remplace celui de la photo', () => {
  const S = reglagesParDefaut(); S.filter = 'secret'; S.headOff = 40;
  const m = /** @type {Record<string, any>} */ (reglagesAMemoriser(S, { headOff: 5, pitchOff: 1 }));
  assert.deepEqual(Object.keys(m).filter((k) => k !== 'poi' && k !== 'layers').sort(), [...CLES_MEMORISEES].sort());
  assert.equal(m.headOff, 5);
  assert.equal(m.pitchOff, 1);
  assert.equal(m.filter, undefined);
  assert.equal(reglagesAMemoriser(S).headOff, 40);
});

test('ruban de cap : bandeau, repères tous les 5°, cardinal au centre, valeur du cap', () => {
  const c = commandesRuban(vue, { safeT: 10, familles });
  assert.equal(c[0].type, 'remplissage');
  const textes = c.filter((x) => x.type === 'texte').map((x) => /** @type {any} */ (x).texte);
  assert.ok(textes.includes('E'), 'le cap 90° est l’est');
  assert.ok(textes.includes('90°'));
  assert.ok(textes.every((t) => /^(N|NE|E|SE|S|SO|O|NO|\d+°)$/.test(t)));
  const c2 = commandesRuban({ ...vue, capDeg: 0 }, { safeT: 10, familles });
  assert.ok(c2.some((x) => x.type === 'texte' && /** @type {any} */ (x).texte === 'N'));
});

test('message central : priorités', () => {
  const base = { erreurCamera: '', photo: false, pos: {}, nbLieux: 3, nbListe: 2, rayonKm: 30, capteur: true };
  assert.equal(messageCentral({ ...base, erreurCamera: 'Caméra refusée' }), 'Caméra refusée');
  assert.equal(messageCentral({ ...base, erreurCamera: 'Caméra refusée', photo: true }), '', 'en photo, l’erreur de caméra ne compte pas');
  assert.equal(messageCentral({ ...base, pos: null }), 'En attente du GPS…');
  assert.equal(messageCentral({ ...base, nbLieux: 0 }), '');
  assert.equal(messageCentral({ ...base, nbListe: 0 }), 'Aucun lieu dans un rayon de 30 km');
  assert.equal(messageCentral({ ...base, capteur: false }), 'Pas de boussole : glissez pour tourner');
  assert.equal(messageCentral({ ...base, capteur: false, photo: true }), '');
});

test('bandeau d’état : le nombre de lieux, puis seulement ce qui ne va pas', () => {
  const base = { affiches: 12, pos: {}, precisionM: 5, chargement: false, source: 'overpass', relief: true, etatRelief: 'ok', capteur: true, photo: false, air: false, sea: false, messageAir: '', messageSea: '' };
  assert.equal(texteStatut(base), '12 lieux');
  assert.equal(texteStatut({ ...base, pos: null }), '12 lieux · GPS en attente');
  assert.match(texteStatut({ ...base, precisionM: 80.4 }), /GPS imprécis \(±80 m\)/);
  assert.match(texteStatut({ ...base, chargement: true }), /chargement des lieux…/);
  assert.match(texteStatut({ ...base, etatRelief: 'indispo' }), /relief indisponible/);
  assert.match(texteStatut({ ...base, capteur: false }), /pas de boussole/);
  assert.doesNotMatch(texteStatut({ ...base, capteur: false, photo: true }), /boussole/);
  assert.match(texteStatut({ ...base, air: true, messageAir: '3 avions' }), / · 3 avions$/);
});
