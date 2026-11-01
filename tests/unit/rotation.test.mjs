// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluerRotation, etatRotationInitial, fermerRotation, PAUSE_ENTRE_AVERTISSEMENTS_MS } from '../../src/entrees/rotation.js';

const paysageEnPortrait = (t, extra = {}) => ({ direct: true, roulisDeg: 88, typeEcran: 'portrait-primary', maintenantMs: t, ...extra });
/** Rejoue une suite d'instants avec les mêmes mesures. */
function jouer(etat, instants, mesures) { let e = etat, dernier = null; for (const t of instants) { dernier = evaluerRotation(e, mesures(t)); e = dernier.etat; } return { etat: e, dernier }; }

test('pas d\'avertissement avant 1,5 s, avertissement ensuite', () => {
  let r = evaluerRotation(etatRotationInitial(), paysageEnPortrait(0)); assert.equal(r.avertir, false);
  r = evaluerRotation(r.etat, paysageEnPortrait(1400)); assert.equal(r.avertir, false);
  r = evaluerRotation(r.etat, paysageEnPortrait(1600)); assert.equal(r.avertir, true);
  r = evaluerRotation(r.etat, paysageEnPortrait(5000)); assert.equal(r.avertir, true, 'reste affiché tant que la condition dure');
});

test('le message disparaît quand la condition cesse VRAIMENT (2 s continues : roulis retombé, écran passé en paysage)', () => {
  const { etat } = jouer(etatRotationInitial(), [0, 1000, 2000], paysageEnPortrait);
  let r = evaluerRotation(etat, paysageEnPortrait(2100, { roulisDeg: 5 })); assert.equal(r.avertir, true, 'pas encore : une oscillation ne retire rien');
  r = evaluerRotation(r.etat, paysageEnPortrait(3000, { roulisDeg: 5 })); assert.equal(r.avertir, true);
  r = evaluerRotation(r.etat, paysageEnPortrait(4200, { roulisDeg: 5 })); assert.equal(r.avertir, false, '2,1 s hors condition : retiré');
  const paysage = jouer(etat, [2100, 3000, 4200], (t) => paysageEnPortrait(t, { typeEcran: 'landscape-primary' }));
  assert.equal(paysage.dernier.avertir, false, 'écran passé en paysage : retiré après 2 s');
});

test('le message reste quand le roulis oscille (téléphone levé vers le ciel) : un seul affichage continu', () => {
  let e = etatRotationInitial(), affiches = 0, debuts = 0, avant = false;
  for (let t = 0; t <= 30000; t += 100) {
    const roulisDeg = 45 + 55 * Math.abs(Math.sin(t / 700)); // oscille entre 45° et 100° (toujours > 35°)
    const r = evaluerRotation(e, paysageEnPortrait(t, { roulisDeg: t === 12000 ? 20 : roulisDeg })); // un seul instant à 20°
    e = r.etat; if (r.avertir) affiches++; if (r.avertir && !avant) debuts++; avant = r.avertir;
  }
  assert.equal(debuts, 1, 'apparu une seule fois'); assert.ok(affiches > 270, 'resté affiché presque tout le temps (après 1,5 s)');
  // oscillation sous 50° mais au-dessus de 35° après l'affichage : maintenu
  let r = jouer(etatRotationInitial(), [0, 1000, 2000], paysageEnPortrait).dernier; r = evaluerRotation(r.etat, paysageEnPortrait(2100, { roulisDeg: 40 }));
  assert.equal(r.avertir, true, '40° est au-dessus du seuil de sortie (35°)');
});

test('au plus une fois toutes les 5 minutes', () => {
  let { etat } = jouer(etatRotationInitial(), [0, 1000, 2000], paysageEnPortrait); // premier avertissement à 2000
  etat = jouer(etat, [3000, 4000, 5000, 6000], (t) => paysageEnPortrait(t, { roulisDeg: 0 })).etat; // la condition cesse vraiment : sortie confirmée à 5100 au plus tard
  let r = evaluerRotation(etat, paysageEnPortrait(10000)); r = evaluerRotation(r.etat, paysageEnPortrait(12000));
  assert.equal(r.avertir, false, 'condition revenue 5 s après la fin : trop tôt');
  const tard = 5000 + PAUSE_ENTRE_AVERTISSEMENTS_MS + 1000;
  r = evaluerRotation(r.etat, paysageEnPortrait(tard)); r = evaluerRotation(r.etat, paysageEnPortrait(tard + 2000));
  assert.equal(r.avertir, true, '5 min après le premier : de nouveau');
});

test('jamais en photo rejouée, jamais sans type d\'écran portrait, roulis négatif compté', () => {
  assert.equal(jouer(etatRotationInitial(), [0, 2000, 4000], (t) => paysageEnPortrait(t, { direct: false })).dernier.avertir, false);
  assert.equal(jouer(etatRotationInitial(), [0, 2000, 4000], (t) => paysageEnPortrait(t, { typeEcran: undefined })).dernier.avertir, false);
  assert.equal(jouer(etatRotationInitial(), [0, 2000, 4000], (t) => paysageEnPortrait(t, { roulisDeg: -80 })).dernier.avertir, true);
  assert.equal(jouer(etatRotationInitial(), [0, 2000, 4000], (t) => paysageEnPortrait(t, { roulisDeg: 49 })).dernier.avertir, false, '50° est la limite');
});

test('un toucher ferme le bandeau et lance la pause de 5 minutes, même si le téléphone reste en paysage', () => {
  const { etat } = jouer(etatRotationInitial(), [0, 1000, 2000], paysageEnPortrait);
  let e = fermerRotation(etat, 2500), r;
  for (let t = 3000; t <= 60000; t += 1000) { r = evaluerRotation(e, paysageEnPortrait(t)); e = r.etat; assert.equal(r.avertir, false); }
  const tard = 2500 + PAUSE_ENTRE_AVERTISSEMENTS_MS + 100; r = evaluerRotation(e, paysageEnPortrait(tard)); r = evaluerRotation(r.etat, paysageEnPortrait(tard + 2000));
  assert.equal(r.avertir, true);
});
