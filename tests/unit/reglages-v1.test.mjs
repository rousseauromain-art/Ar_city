// Reprise unique des réglages d'affichage de la v1 (lecture seule) : clés d'affichage seulement, jamais le calage, une seule fois.
import test from 'node:test';
import assert from 'node:assert/strict';
import { reprendreReglagesV1, lireReglages, CLES_REPRISES_V1 } from '../../src/moteur/reglages.js';
import { creerStockage, adaptateurMemoire } from '../../src/outils/stockage.js';

const v1 = { skyline: true, radius: 180, layers: { places: false }, poi: { view: true }, headOff: 33, pitchOff: 4, camFov: 80, simOn: true, simPos: '1,2', filter: 'x' };
const neuf = () => creerStockage({ adaptateur: adaptateurMemoire() });

test('première fois : l\'affichage de la v1 est repris, pas le calage ni la position simulée', () => {
  const st = neuf();
  assert.equal(reprendreReglagesV1(st, () => JSON.stringify(v1)), true);
  const S = lireReglages(st);
  assert.equal(S.skyline, true); assert.equal(S.radius, 180); assert.equal(S.layers.places, false); assert.equal(S.layers.monuments, true); assert.equal(S.poi.view, true);
  assert.equal(S.headOff, 0); assert.equal(S.camFov, 67); assert.equal(S.simOn, false); assert.equal(S.filter, '');
  assert.ok(CLES_REPRISES_V1.every((k) => !['headOff', 'pitchOff', 'camFov', 'simOn', 'simPos'].includes(k)));
});
test('une seule fois : ensuite les choix faits dans la v2 sont gardés', () => {
  const st = neuf(); reprendreReglagesV1(st, () => JSON.stringify(v1));
  const S = lireReglages(st); S.radius = 25; st.ecrire('reglages', S);
  assert.equal(reprendreReglagesV1(st, () => JSON.stringify(v1)), false); assert.equal(lireReglages(st).radius, 25);
});
test('réglages déjà enregistrés par la v2 : l\'affichage est remplacé, le calage gardé', () => {
  const st = neuf(); st.ecrire('reglages', { headOff: 12, skyline: false, radius: 20, layers: { equip: false } });
  reprendreReglagesV1(st, () => JSON.stringify(v1)); const S = lireReglages(st);
  assert.equal(S.skyline, true); assert.equal(S.radius, 180); assert.equal(S.headOff, 12); assert.equal(S.layers.equip, false); assert.equal(S.layers.places, false);
});
test('rien ou illisible dans la v1 : réglages inchangés, et on ne réessaie pas', () => {
  for (const brut of [null, 'pas du json', '42', '{}']) { const st = neuf(); assert.equal(reprendreReglagesV1(st, () => brut), false); assert.equal(lireReglages(st).radius, 60); assert.equal(reprendreReglagesV1(st, () => JSON.stringify(v1)), false); }
});
