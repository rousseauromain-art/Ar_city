// @ts-nocheck — scènes synthétiques.
import test from 'node:test';
import assert from 'node:assert/strict';
import { capDepuisOmbre, pointDuSol } from '../../src/calage/ombre.js';

const D = Math.PI / 180, ECRAN = { largeurPx: 800, hauteurPx: 400 }, CHAMP = 70, FH = (800 / 2) / Math.tan(CHAMP / 2 * D);
/** Pixel où l'on voit un point du sol (est, nord en m), la caméra étant réellement dirigée vers `capVrai`, inclinée de `incl`, roulis `roulis`, œil à `oeil` m. */
function pixelDuSol(est, nord, { capVrai, incl, roulis = 0, oeil = 1.6 }) {
  const C = capVrai * D, E = incl * D, w = [est, nord, -oeil];
  const f = [Math.cos(E) * Math.sin(C), Math.cos(E) * Math.cos(C), Math.sin(E)], r = [Math.cos(C), -Math.sin(C), 0], u = [-Math.sin(E) * Math.sin(C), -Math.sin(E) * Math.cos(C), Math.cos(E)];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cz = dot(w, f), cx = dot(w, r), cy = dot(w, u), roll = roulis * D;
  const xs = FH * cx / cz, ys = FH * cy / cz;
  return { x: 400 + xs * Math.cos(roll) - ys * Math.sin(roll), y: 200 - (xs * Math.sin(roll) + ys * Math.cos(roll)) };
}
/** Un poteau et son ombre : pied à 3 m de l'observateur, `dAz`° à côté du cap réel, ombre de `L` m vers `azSoleil + 180`. */
function scene({ azSoleil, elSoleil = 40, capVrai, erreur, incl = -25, dAz = 5, L = 2, roulis = 0 }) {
  const az = (azSoleil + 180) * D, pied = [3 * Math.sin((capVrai + dAz) * D), 3 * Math.cos((capVrai + dAz) * D)], bout = [pied[0] + L * Math.sin(az), pied[1] + L * Math.cos(az)];
  const o = { capVrai, incl, roulis };
  return { trait: { pied: pixelDuSol(...pied, o), bout: pixelDuSol(...bout, o) }, pose: { capDeg: capVrai + erreur, inclinaisonDeg: incl, roulisDeg: roulis }, champDeg: CHAMP, ecran: ECRAN, oeilM: 1.6, soleil: { azDeg: azSoleil, elDeg: elSoleil } };
}

test('soleil à 150° : l\'ombre tracée donne le cap à ±2° (boussole fausse de +25°, −40°, +10°)', () => {
  for (const [capVrai, erreur] of [[100, 25], [310, -40], [20, 10]]) {
    const r = capDepuisOmbre(scene({ azSoleil: 150, capVrai, erreur }));
    assert.equal(r.ok, true, JSON.stringify(r)); assert.ok(Math.abs(r.dh + erreur) < 2, `dh ${r.dh} pour ${-erreur}`); assert.match(r.message, /calé sur l'ombre/);
  }
});

test('avec un roulis de 8° et un téléphone moins incliné : toujours ±2°', () => {
  const r = capDepuisOmbre(scene({ azSoleil: 230, capVrai: 60, erreur: 18, incl: -35, roulis: 8, dAz: -8, L: 3 }));
  assert.equal(r.ok, true); assert.ok(Math.abs(r.dh + 18) < 2, `dh ${r.dh}`);
});

test('refus : soleil trop bas, trait trop court, trait vers le ciel, soleil inconnu, ombre incohérente (ciel couvert)', () => {
  const base = scene({ azSoleil: 150, capVrai: 100, erreur: 25 });
  assert.match(capDepuisOmbre({ ...base, soleil: { azDeg: 150, elDeg: 8 } }).message, /soleil trop bas/);
  assert.match(capDepuisOmbre({ ...base, soleil: null }).message, /soleil inconnu/);
  assert.match(capDepuisOmbre({ ...base, trait: { pied: base.trait.pied, bout: { x: base.trait.pied.x + 10, y: base.trait.pied.y } } }).message, /trop court/);
  assert.match(capDepuisOmbre({ ...base, trait: { pied: { x: 400, y: -400 }, bout: { x: 480, y: -380 } } }).message, /au sol/); // bien au-dessus de l'horizon
  const faux = capDepuisOmbre({ ...base, soleil: { azDeg: 150 + 170, elDeg: 40 } }); assert.equal(faux.ok, false); assert.match(faux.message, /incohérente|ciel couvert/);
});

test('point du sol : le centre de l\'image, caméra inclinée de −30° à 1,6 m, est à 1,6 / tan(30°) = 2,77 m devant', () => {
  const p = pointDuSol(400, 200, { capDeg: 90, inclinaisonDeg: -30, roulisDeg: 0 }, FH, ECRAN, 1.6);
  assert.ok(Math.abs(p.est - 2.77) < 0.01 && Math.abs(p.nord) < 0.01, JSON.stringify(p));
  assert.equal(pointDuSol(400, 200, { capDeg: 0, inclinaisonDeg: 5, roulisDeg: 0 }, FH, ECRAN, 1.6), null);
});
