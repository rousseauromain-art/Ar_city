// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluerRotation, etatRotationInitial, PAUSE_ENTRE_AVERTISSEMENTS_MS } from '../../src/entrees/rotation.js';

const paysageEnPortrait = (t, extra = {}) => ({ direct: true, roulisDeg: 88, typeEcran: 'portrait-primary', maintenantMs: t, ...extra });
/** Rejoue une suite d'instants avec les mêmes mesures. */
function jouer(etat, instants, mesures) { let e = etat, dernier = null; for (const t of instants) { dernier = evaluerRotation(e, mesures(t)); e = dernier.etat; } return { etat: e, dernier }; }

test('pas d\'avertissement avant 1,5 s, avertissement ensuite', () => {
  let r = evaluerRotation(etatRotationInitial(), paysageEnPortrait(0)); assert.equal(r.avertir, false);
  r = evaluerRotation(r.etat, paysageEnPortrait(1400)); assert.equal(r.avertir, false);
  r = evaluerRotation(r.etat, paysageEnPortrait(1600)); assert.equal(r.avertir, true);
  r = evaluerRotation(r.etat, paysageEnPortrait(5000)); assert.equal(r.avertir, true, 'reste affiché tant que la condition dure');
});

test('le message disparaît dès que la condition cesse (roulis retombé, écran passé en paysage)', () => {
  const { etat } = jouer(etatRotationInitial(), [0, 1000, 2000], paysageEnPortrait);
  assert.equal(evaluerRotation(etat, paysageEnPortrait(2100, { roulisDeg: 5 })).avertir, false);
  assert.equal(evaluerRotation(etat, paysageEnPortrait(2100, { typeEcran: 'landscape-primary' })).avertir, false);
});

test('au plus une fois toutes les 5 minutes', () => {
  let { etat } = jouer(etatRotationInitial(), [0, 1000, 2000], paysageEnPortrait); // premier avertissement à 2000
  etat = evaluerRotation(etat, paysageEnPortrait(3000, { roulisDeg: 0 })).etat; // la condition cesse
  let r = evaluerRotation(etat, paysageEnPortrait(10000)); r = evaluerRotation(r.etat, paysageEnPortrait(12000));
  assert.equal(r.avertir, false, 'condition revenue 8 s après : trop tôt');
  const tard = 2000 + PAUSE_ENTRE_AVERTISSEMENTS_MS + 100;
  r = evaluerRotation(r.etat, paysageEnPortrait(tard)); r = evaluerRotation(r.etat, paysageEnPortrait(tard + 2000));
  assert.equal(r.avertir, true, '5 min après le premier : de nouveau');
});

test('jamais en photo rejouée, jamais sans type d\'écran portrait, roulis négatif compté', () => {
  assert.equal(jouer(etatRotationInitial(), [0, 2000, 4000], (t) => paysageEnPortrait(t, { direct: false })).dernier.avertir, false);
  assert.equal(jouer(etatRotationInitial(), [0, 2000, 4000], (t) => paysageEnPortrait(t, { typeEcran: undefined })).dernier.avertir, false);
  assert.equal(jouer(etatRotationInitial(), [0, 2000, 4000], (t) => paysageEnPortrait(t, { roulisDeg: -80 })).dernier.avertir, true);
  assert.equal(jouer(etatRotationInitial(), [0, 2000, 4000], (t) => paysageEnPortrait(t, { roulisDeg: 49 })).dernier.avertir, false, '50° est la limite');
});
