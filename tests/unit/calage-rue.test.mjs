// @ts-nocheck — rues synthétiques.
import test from 'node:test';
import assert from 'node:assert/strict';
import { capDepuisRue, portionsDroites } from '../../src/calage/rue.js';

const POS = { lat: 48.8566, lon: 2.3522 }, kLon = 111320 * Math.cos(POS.lat * Math.PI / 180);
/** Point à (nord, est) mètres. */
const P = (N, E) => ({ lat: POS.lat + N / 111320, lon: POS.lon + E / kLon });
/** Rue le long du cap `capDeg`, de -a à +b mètres autour du point (N0, E0). */
const rue = (nom, capDeg, N0 = 0, E0 = 0, a = 150, b = 150) => { const c = capDeg * Math.PI / 180, pts = []; for (let s = -a; s <= b; s += 20) pts.push(P(N0 + s * Math.cos(c), E0 + s * Math.sin(c))); return { nom, classe: 'minor', points: pts }; };
const base = { pos: POS, precisionM: 8 };

test('rue droite à 127° : le cap affiché (boussole fausse de 30°) est ramené à l\'axe', () => {
  const r = capDepuisRue({ ...base, capAfficheDeg: 97, rues: [rue('Rue de Rivoli', 127, 10, 10)] });
  assert.equal(r.ok, true); assert.ok(Math.abs(r.capDeg - 127) < 0.05, `${r.capDeg}`); assert.equal(r.rue, 'Rue de Rivoli'); assert.ok(Math.abs(r.ecartDeg - 30) < 0.05);
});

test('deux sens : la boussole choisit le sens (127° ou 307°)', () => {
  const rues = [rue('Rue X', 127)];
  assert.ok(Math.abs(capDepuisRue({ ...base, capAfficheDeg: 300, rues }).capDeg - 307) < 0.05);
  assert.ok(Math.abs(capDepuisRue({ ...base, capAfficheDeg: 140, rues }).capDeg - 127) < 0.05);
});

test('rue trop courbe : aucune portion droite de 60 m, refus avec la raison', () => {
  const pts = []; for (let a = 0; a <= 90; a += 8) pts.push(P(60 * Math.sin(a * Math.PI / 180) - 5, 60 * (1 - Math.cos(a * Math.PI / 180)) - 5));
  const r = capDepuisRue({ ...base, capAfficheDeg: 45, rues: [{ nom: 'Rue Ronde', classe: 'minor', points: pts }] });
  assert.equal(r.ok, false); assert.match(r.raison, /courbe/);
});

test('aucune rue proche, ou aucune rue connue : refus', () => {
  assert.match(capDepuisRue({ ...base, capAfficheDeg: 0, rues: [rue('Loin', 90, 200, 0)] }).raison, /aucune rue/);
  assert.match(capDepuisRue({ ...base, capAfficheDeg: 0, rues: [] }).raison, /aucune rue connue/);
});

test('la rue doit passer à moins de max(25 m, précision) : avec un GPS à 60 m, une rue à 50 m compte', () => {
  const rues = [rue('Rue lointaine', 90, 50, 0)];
  assert.equal(capDepuisRue({ ...base, capAfficheDeg: 90, rues }).ok, false);
  assert.equal(capDepuisRue({ pos: POS, precisionM: 60, capAfficheDeg: 90, rues }).ok, true);
});

test('carrefour en T : la boussole départage si une seule rue est à moins de 45° ; sinon deux boutons', () => {
  const rues = [rue('Rue du Tronc', 0, 0, 0, 20, 180), rue('Rue de la Barre', 90, 0, 0, 150, 150)]; // le tronc part vers le nord, la barre est est-ouest
  const a = capDepuisRue({ ...base, capAfficheDeg: 10, rues });
  assert.equal(a.ok, true); assert.equal(a.rue, 'Rue du Tronc'); assert.ok(Math.abs(a.capDeg) < 0.1 || Math.abs(a.capDeg - 360) < 0.1);
  const b = capDepuisRue({ ...base, capAfficheDeg: 45, rues });
  assert.equal(b.ok, false); assert.equal(b.choix.length, 2); assert.deepEqual(b.choix.map((c) => c.rue).sort(), ['Rue de la Barre', 'Rue du Tronc']);
});

test('ambiguïté : deux rues parallèles (même cap à 20° près) ne sont pas ambiguës, on prend la plus proche', () => {
  const r = capDepuisRue({ ...base, capAfficheDeg: 85, rues: [rue('Rue A', 90, 15, 0), rue('Rue B', 100, -5, 0)] });
  assert.equal(r.ok, true); assert.equal(r.rue, 'Rue B');
});

test('boussole douteuse : les deux sens de la rue la plus proche en boutons', () => {
  const r = capDepuisRue({ ...base, capAfficheDeg: 200, boussoleDouteuse: true, rues: [rue('Rue Y', 127)] });
  assert.equal(r.ok, false); assert.equal(r.choix.length, 2);
  assert.deepEqual(r.choix.map((c) => Math.round(c.capDeg)).sort((a, b) => a - b), [127, 307]);
  assert.equal(capDepuisRue({ ...base, capAfficheDeg: null, rues: [rue('Rue Y', 127)] }).choix.length, 2);
});

test('rue à plus de 45° du cap affiché : refus explicite', () => {
  const r = capDepuisRue({ ...base, capAfficheDeg: 0, rues: [rue('Rue Z', 90)] });
  assert.equal(r.ok, false); assert.match(r.raison, /45°/);
});

test('portions droites : une rue en L donne deux portions, la courbe aucune assez longue', () => {
  const pts = [[0, 0], [0, 40], [0, 80], [0, 120], [40, 120], [80, 120], [120, 120]];
  const p = portionsDroites(pts); assert.equal(p.length, 2); assert.ok(Math.abs(p[0].capDeg - 90) < 0.01 && Math.abs(p[1].capDeg - 0) < 0.01);
});
