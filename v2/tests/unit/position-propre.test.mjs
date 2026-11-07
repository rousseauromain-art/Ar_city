// @ts-nocheck — mesures synthétiques.
import test from 'node:test';
import assert from 'node:assert/strict';
import { nettoyerPosition, ramenerHorsBatiment, medianePonderee, distanceM } from '../../src/scene/position.js';

const O = { lat: 48.8566, lon: 2.3522 }, kLon = 111320 * Math.cos(O.lat * Math.PI / 180);
const P = (N, E) => ({ lat: O.lat + N / 111320, lon: O.lon + E / kLon });
const mes = (t, N, E, precisionM) => ({ t, ...P(N, E), precisionM });

test('à l\'arrêt : médiane pondérée des 10 dernières secondes, les mesures imprécises sont écartées', () => {
  const m = [mes(1000, 0, 0, 5), mes(2000, 1, -1, 5), mes(3000, -1, 1, 5), mes(4000, 0.5, 0, 5), mes(5000, 80, 80, 40), mes(6000, 0, 1, 5)]; // une mesure à 40 m de précision, loin
  const r = nettoyerPosition({ mesures: m, vitesseMs: 0.1, immobile: true, maintenantMs: 6500 });
  assert.equal(r.mode, 'mediane'); assert.equal(r.n, 5); assert.ok(distanceM(r.pos, P(0, 0)) < 1.5, `${distanceM(r.pos, P(0, 0))} m`);
  assert.equal(r.precisionM, 5);
  const vieille = nettoyerPosition({ mesures: [mes(0, 50, 50, 5), ...m.slice(0, 4).map((x) => ({ ...x, t: x.t + 20000 }))], vitesseMs: 0, immobile: true, maintenantMs: 25000 });
  assert.ok(distanceM(vieille.pos, P(0, 0)) < 1.5, 'la mesure de plus de 10 s est ignorée');
});

test('la médiane est tirée par les mesures précises (poids 1 / précision²)', () => {
  assert.equal(medianePonderee([0, 10, 20], [1, 1, 1]), 10);
  assert.equal(medianePonderee([0, 10, 20], [0.1, 0.1, 5]), 20);
});

test('en marche, ou en mouvement, ou avec trop peu de mesures : la dernière mesure', () => {
  const m = [mes(1000, 0, 0, 5), mes(2000, 3, 0, 5), mes(3000, 6, 0, 5)];
  for (const e of [{ vitesseMs: 1.4, immobile: true }, { vitesseMs: 0, immobile: false }]) { const r = nettoyerPosition({ mesures: m, ...e, maintenantMs: 3100 }); assert.equal(r.mode, 'derniere'); assert.ok(distanceM(r.pos, P(6, 0)) < 0.01); assert.equal(r.n, 1); }
  assert.equal(nettoyerPosition({ mesures: m.slice(0, 2), vitesseMs: 0, immobile: true, maintenantMs: 3100 }).mode, 'derniere');
  assert.equal(nettoyerPosition({ mesures: [], vitesseMs: 0, immobile: true, maintenantMs: 0 }), null);
  assert.equal(nettoyerPosition({ mesures: m, vitesseMs: null, immobile: true, maintenantMs: 3100 }).mode, 'mediane', 'vitesse inconnue : on se fie à l\'immobilité du téléphone');
});

/** Bâtiment rectangulaire (nord min/max, est min/max en m). */
const bati = (n0, n1, e0, e1) => { const c = [[n0, e0], [n0, e1], [n1, e1], [n1, e0]], pts = new Float64Array(8); c.forEach(([n, e], i) => { const p = P(n, e); pts[2 * i] = p.lat; pts[2 * i + 1] = p.lon; }); return { pts }; };

test('position dans un bâtiment : ramenée au point extérieur le plus proche + 1,5 m', () => {
  const r = ramenerHorsBatiment({ pos: P(3, 0), batiments: [bati(0, 20, -10, 10)], oeilRelM: 1.6 }); // à 3 m du mur sud
  assert.equal(r.dans, true); assert.ok(Math.abs(distanceM(r.pos, P(-1.5, 0))) < 0.05, `${JSON.stringify(r)}`); assert.ok(Math.abs(r.deplaceM - 4.5) < 0.05);
  const dehors = ramenerHorsBatiment({ pos: P(-5, 0), batiments: [bati(0, 20, -10, 10)], oeilRelM: 1.6 }); assert.equal(dehors.dans, false); assert.equal(dehors.deplaceM, 0);
});

test('cour intérieure : le trou du polygone fait partie du bâtiment, la position en est sortie', () => {
  const ext = bati(0, 60, 0, 60); // la cour (20..40) n'est pas gardée par le décodeur : un seul anneau extérieur
  const r = ramenerHorsBatiment({ pos: P(30, 31), batiments: [ext], oeilRelM: 1.6 });
  assert.equal(r.dans, true); assert.ok(r.deplaceM > 28, `${r.deplaceM} m`); // du centre de la cour au mur extérieur le plus proche
});

test('balcon ou toit (œil relevé de plus de 5 m) : rien ne bouge ; bâtiment voisin : on passe de l\'un à l\'autre', () => {
  const b = bati(0, 20, -10, 10);
  assert.equal(ramenerHorsBatiment({ pos: P(3, 0), batiments: [b], oeilRelM: 1.6 + 5.1 }).dans, false);
  assert.equal(ramenerHorsBatiment({ pos: P(3, 0), batiments: [b], oeilRelM: 1.6 + 4.9 }).dans, true);
  const r = ramenerHorsBatiment({ pos: P(3, 0), batiments: [bati(0, 20, -10, 10), bati(-3, -0.5, -10, 10)], oeilRelM: 1.6 });
  assert.equal(r.dans, true); assert.ok(distanceM(r.pos, P(-1.5, 0)) > 0.1, 'sortie du premier tombée dans le second : ramenée encore une fois');
  assert.ok(ramenerHorsBatiment({ pos: r.pos, batiments: [bati(0, 20, -10, 10), bati(-3, -0.5, -10, 10)], oeilRelM: 1.6 }).dans === false, 'le résultat final est dehors');
});
