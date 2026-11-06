// @ts-nocheck — données synthétiques : le typage n'apporte rien ici.
import test from 'node:test';
import assert from 'node:assert/strict';
import { profilBatiments, silhouetteBrute, lisserCouche, occulteur, poserSol, premierPlanM, VIDE } from '../../src/scene/silhouette-batiments.js';

const D = Math.PI / 180, POS = { lat: 48.85, lon: 2.35 }, K_LAT = 111320, K_LON = 111320 * Math.cos(POS.lat * D);
/** Rectangle de largeur 2w (est) et de profondeur 2l (nord), centré à (nord, est) mètres de l'observateur. */
const bati = (N, E, w, l, h) => { const pts = new Float64Array(8); [[-l, -w], [-l, w], [l, w], [l, -w]].forEach(([dn, de], j) => { pts[2 * j] = POS.lat + (N + dn) / K_LAT; pts[2 * j + 1] = POS.lon + (E + de) / K_LON; }); return { h, pts }; };
const OPT = { pos: POS, oeilRelM: 1.6, h0: null, clipM: 3, courbure: false };
const bin = (deg) => Math.floor((((deg % 360) + 360) % 360) / 0.5) % 720;

test('bâtiment en boîte : angle exact atan((h − œil) / distance de la façade), seulement dans ses directions', () => {
  const P = profilBatiments([bati(100, 0, 10, 10, 31.6)], OPT), attendu = Math.atan2(30, Math.hypot(90, 10)) / D; // façade au nord à 90 m ; arêtes échantillonnées à leurs sommets : la distance est celle du coin (v1)
  assert.ok(Math.abs(P.ang[bin(0)] - attendu) < 1e-4, `${P.ang[bin(0)]} ≠ ${attendu}`);
  assert.ok(Math.abs(P.dist[bin(0)] - Math.hypot(90, 10)) < 1e-3);
  assert.equal(P.ang[bin(20)], VIDE); assert.equal(P.ang[bin(180)], VIDE);
  const coin = Math.atan2(10, 90) / D; assert.ok(P.ang[bin(coin - 1)] > -50 && P.ang[bin(coin + 3)] === VIDE);
});

test('masquage entre deux bâtiments : le plus haut angle gagne, par couche de distance', () => {
  const proche = bati(50, 0, 10, 5, 5), loin = bati(1000, 0, 30, 20, 120), P = profilBatiments([proche, loin], OPT);
  assert.ok(Math.abs(P.la[0][bin(0)] - Math.atan2(3.4, Math.hypot(45, 10)) / D) < 1e-4, 'couche proche : le petit bâtiment');
  assert.ok(Math.abs(P.la[1][bin(0)] - Math.atan2(118.4, Math.hypot(980, 10)) / D) < 1e-4, 'couche moyenne : la tour');
  assert.ok(Math.abs(P.ang[bin(0)] - Math.atan2(118.4, Math.hypot(980, 10)) / D) < 1e-4 && P.ang[bin(0)] > P.la[0][bin(0)], 'toutes couches : la tour passe devant');
  assert.equal(P.la[2][bin(0)], VIDE);
});

test('observateur contre un mur : en deçà du premier plan rien ne compte ; au-delà, l\'angle est celui de la façade', () => {
  const mur = bati(1.5, 0, 30, 0.5, 20); // façade à 1 m, plus près que 3 m
  assert.equal(profilBatiments([mur], OPT).ang[bin(0)], VIDE);
  const mur5 = bati(21, 0, 30, 0.5, 11.6), P = profilBatiments([mur5], OPT); // à 20,5 m : les arêtes vues à plus de 90° (mur trop proche) sont ignorées, comme dans la v1
  assert.ok(Math.abs(P.ang[bin(0)] - Math.atan2(10, Math.hypot(20.5, 10)) / D) < 1e-3);
  const rue = profilBatiments([bati(100, 0, 10, 10, 31.6)], { ...OPT, clipM: premierPlanM(0, true) });
  assert.ok(rue.ang[bin(0)] === VIDE, 'à hauteur de rue, la façade à 90 m est dans le premier plan masqué de 150 m');
  assert.equal(premierPlanM(0, true), 150); assert.equal(premierPlanM(12, true), 3); assert.equal(premierPlanM(0, false), 3);
});

test('relief : le sommet est z + h − h0 ; sans z, terrain plat', () => {
  const b = bati(100, 0, 10, 10, 20), plat = profilBatiments([b], OPT), r = [{ ...b }];
  poserSol(r, () => 30, POS);
  const P = profilBatiments(r, { ...OPT, h0: 35 }), attendu = Math.atan2(30 + 20 - 35, Math.hypot(90, 10)) / D;
  assert.ok(Math.abs(P.ang[bin(0)] - attendu) < 1e-4); assert.ok(P.ang[bin(0)] < plat.ang[bin(0)]);
  const nul = [{ ...b }]; poserSol(nul, () => NaN, POS); assert.equal(nul[0].z, null);
  assert.ok(Math.abs(profilBatiments(nul, { ...OPT, h0: 35 }).ang[bin(0)] - plat.ang[bin(0)]) < 1e-9);
});

test('silhouette brute : 3600 directions au pas de 0,1°, sans masque, bâtiments plus proches que distMinM ignorés', () => {
  const b = [bati(40, 0, 5, 5, 31.6), bati(200, 80, 10, 10, 31.6)];
  const S = silhouetteBrute(b, { pos: POS, oeilRelM: 1.6, h0: null, courbure: false, distMinM: 60 });
  assert.equal(S.ang.length, 3600);
  assert.equal(S.ang[Math.floor(0 / 0.1)], VIDE, 'le bâtiment à 35 m est écarté');
  const brg = Math.atan2(80, 200) / D; assert.ok(S.ang[Math.floor(brg / 0.1)] > 5);
  const tout = silhouetteBrute(b, { pos: POS, oeilRelM: 1.6, h0: null, courbure: false, distMinM: 3 });
  assert.ok(tout.ang[0] > 40, 'sans distance minimale, le bâtiment proche domine');
});

test('lissage : une rue étroite est comblée, un trou de plus de 4° reste, les blocs ont un sommet plat', () => {
  const a = new Float32Array(720).fill(VIDE); a.fill(10, 100, 110); a.fill(12, 111, 120); // trou d'un bin : comblé
  const l = lisserCouche(a, 1); assert.ok(l[110] > 9 && l[110] < 13);
  const b = new Float32Array(720).fill(VIDE); b.fill(8, 100, 105); b.fill(8, 130, 140); // trou de 25 bins (12,5°) : reste
  assert.equal(lisserCouche(b, 1)[117], VIDE);
  const c = new Float32Array(720).fill(VIDE); c[0] = 20; c[1] = 4; c[2] = 4; c[3] = 4; c[4] = 4; c[5] = 4;
  const bl = lisserCouche(c, 6); assert.ok(bl.slice(0, 6).every((v) => v === bl[0]) && bl[0] > 4 && bl[0] < 20);
});

test('occulteur : le bâtiment plus proche (de plus de 200 m) qui masque un monument, sinon VIDE', () => {
  const P = profilBatiments([bati(300, 0, 20, 10, 50)], OPT), ls = [P.la[0], P.la[1], P.la[2]];
  assert.ok(occulteur({ ls, ld: P.ld }, 0, 1500) > 5);
  assert.equal(occulteur({ ls, ld: P.ld }, 0, 400), VIDE, 'monument trop proche du bâtiment : pas masqué');
  assert.equal(occulteur({ ls, ld: P.ld }, 90, 1500), VIDE); assert.equal(occulteur(null, 0, 1000), VIDE);
});
