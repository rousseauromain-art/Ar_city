// @ts-nocheck
// Migration unique du 1/11 : le GPS propose au lieu d'imposer (comme la v1).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fusionnerReglages, reglagesParDefaut, reglagesAMemoriser, reprendreReglagesV1 } from '../../src/moteur/reglages.js';

test('nouveaux réglages : mode automatique décoché, déjà migrés', () => {
  const S = fusionnerReglages(null);
  assert.equal(S.oeilGps, false); assert.equal(S.obsHeight, 0); assert.equal(S.migrationOeil, 1); assert.equal(reglagesParDefaut().oeilGps, false);
});

test('correction venue du GPS : remise à 0 ; correction à la main : gardée', () => {
  assert.equal(fusionnerReglages({ obsHeight: 48, obsHeightSrc: 'gps', oeilGps: true }).obsHeight, 0);
  assert.equal(fusionnerReglages({ obsHeight: 6, obsHeightSrc: 'main', oeilGps: true }).obsHeight, 6);
  const m = fusionnerReglages({ obsHeight: 6, obsHeightSrc: 'main', oeilGps: true });
  assert.equal(m.oeilGps, false, 'le mode automatique est décoché dans tous les cas'); assert.equal(m.obsHeightSrc, 'main');
});

test('origine inconnue (avant le correctif) : remise à 0 seulement si le mode automatique n\'avait jamais été décoché', () => {
  assert.equal(fusionnerReglages({ obsHeight: 48 }).obsHeight, 0, 'seul le recalage automatique par défaut pouvait l\'écrire');
  assert.equal(fusionnerReglages({ obsHeight: 48, oeilGps: true }).obsHeight, 0);
  assert.equal(fusionnerReglages({ obsHeight: 6, oeilGps: false }).obsHeight, 6, 'décoché à la main : la correction est de Romain');
  const S = fusionnerReglages({ obsHeight: 6, oeilGps: false }); assert.equal(S.obsHeightSrc, 'main');
  assert.equal(fusionnerReglages({ obsHeight: 0 }).obsHeightSrc, '');
});

test('une seule fois : une fois migrés, les choix suivants sont respectés', () => {
  const apres = reglagesAMemoriser(fusionnerReglages({ obsHeight: 48 }));
  assert.equal(apres.migrationOeil, 1);
  const coche = fusionnerReglages({ ...apres, oeilGps: true, obsHeight: 30, obsHeightSrc: 'gps' }); // il recoche le mode automatique, qui recale
  assert.equal(coche.oeilGps, true); assert.equal(coche.obsHeight, 30); assert.equal(coche.obsHeightSrc, 'gps');
});

test('la correction reprise de la v1 est marquée « main » (elle vient de Romain)', () => {
  const ecrits = {}, stockage = { lire: (k, o) => (k === 'reglages-v1-repris' ? false : k === 'reglages' ? null : o.parDefaut), ecrire: (k, v) => { ecrits[k] = v; return true; } };
  reprendreReglagesV1(stockage, () => JSON.stringify({ obsHeight: 12, radius: 40 }));
  assert.equal(ecrits.reglages.obsHeight, 12); assert.equal(ecrits.reglages.obsHeightSrc, 'main');
  assert.equal(fusionnerReglages(ecrits.reglages).obsHeight, 12, 'la migration ne la remet pas à 0');
});
