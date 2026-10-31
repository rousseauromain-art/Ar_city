// Silhouette et crêtes : parité avec le code de la v1 figée (extrait du fichier), sur un masque calculé de tuiles synthétiques.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { creerBandes, BANDES_HR, NB_RELEVEMENTS } from '../../src/scene/relief.js';
import { calculerMasque } from '../../src/scene/masque.js';
import { lignesDeCretes, pointsDeCretes, distancesSilhouette, distanceSilhouette, angleSilhouette } from '../../src/scene/cretes.js';
import { classerCretes } from '../../src/calques/relief.js';
import { tuile, alea } from '../unit/aide-relief.mjs';

const src = readFileSync(new URL('../../v1/villes-horizon.html', import.meta.url), 'utf8');
const coeur = src.slice(src.indexOf('/*TERRAIN-CORE-START*/'), src.indexOf('/*TERRAIN-CORE-END*/'));
const iDebut = src.indexOf('const RIDGE_EPS='), iFin = src.indexOf('// ---------- trafic en direct');
const iSky = src.indexOf('function skylineElevAt'), iSkyFin = src.indexOf('// ---------- cretes interieures');
assert.ok(iDebut > 0 && iFin > iDebut && iSky > 0 && iSkyFin > iSky, 'repères introuvables dans la v1');
const v1 = new Function('D', 'terrain', `${coeur}
${src.slice(iSky, iSkyFin)}
${src.slice(iDebut, iFin)}
return {skylineElevAt,skylineDistAt,ridgePoints,ridgeLines,TDIST,NB,BSTEP};`);

const POS = { lat: 48.6459, lon: -2.0281 };
/** Masque réel (tuiles synthétiques avec une crête nette) + masque artificiel à plusieurs plans. */
async function masqueSynthetique() {
  const bands = creerBandes(BANDES_HR, POS);
  for (const b of bands) for (let i = 0; i < b.tiles.length; i++) b.tiles[i] = tuile(b.z, b.tx0 + (i % b.nx), b.ty0 + Math.floor(i / b.nx), b.ts);
  return calculerMasque(bands, POS, 15.6, async () => {});
}
/** Masque à plusieurs plans : des paliers qui montent, séparés par des plateaux, avec des angles bruts plongeants derrière chaque crête. */
function masquePlans() {
  const pm = /** @type {any} */ (new Array(NB_RELEVEMENTS)), raw = new Array(NB_RELEVEMENTS), r = alea(3);
  for (let i = 0; i < NB_RELEVEMENTS; i++) {
    const row = new Float32Array(500), brut = new Float32Array(500);
    let m = -3;
    const sauts = [60 + Math.round(10 * Math.sin(i / 40)), 180, 330].map((k) => k + (i % 7 === 0 ? 1 : 0));
    for (let k = 0; k < 500; k++) {
      const a = sauts.includes(k) ? m + 0.6 + 0.4 * r() : -4 + 0.01 * k + (sauts.some((s) => k > s && k < s + 12) ? -2.5 : 0);
      brut[k] = k % 97 === 5 ? NaN : a; if (a > m) m = a; row[k] = m;
    }
    pm[i] = row; raw[i] = brut;
  }
  pm.raw = raw;
  return pm;
}

test('crêtes : silhouette, distances, points et lignes identiques à la v1 (relief synthétique)', async () => {
  const pm = await masqueSynthetique();
  const M = v1(Math.PI / 180, { pm, at: 1 });
  assert.equal(NB_RELEVEMENTS, M.NB);
  const d2 = distancesSilhouette(pm), r = alea(9);
  for (let i = 0; i < 300; i++) {
    const brg = r() * 360;
    assert.ok(Object.is(angleSilhouette(pm, brg), M.skylineElevAt(brg)), `silhouette ${brg}`);
    assert.ok(Object.is(distanceSilhouette(d2, brg), M.skylineDistAt(brg)), `distance ${brg}`);
  }
  const L1 = M.ridgeLines(), L2 = lignesDeCretes(pm);
  assert.equal(L2.length, L1.length);
  for (let i = 0; i < L1.length; i++) assert.deepEqual(L2[i], { pts: L1[i].pts, d: L1[i].d, g: L1[i].g, drop: L1[i].drop, len: L1[i].len });
});

test('crêtes : masque à plusieurs plans — mêmes lignes que la v1, et il y en a', () => {
  const pm = masquePlans(), M = v1(Math.PI / 180, { pm, at: 2 });
  for (const i of [0, 7, 100, 359, 719]) {
    const a = pointsDeCretes(pm[i], pm.raw[i]), b = M.ridgePoints(pm[i], pm.raw[i]);
    assert.deepEqual(a.map((/** @type {any} */ { ligne: _l, ...p }) => p), b.map((/** @type {any} */ { line: _l, ...p }) => p));
    assert.deepEqual(pointsDeCretes(pm[i]).map((p) => p.drop), b.map(() => 1e9)); // sans angles bruts : dénivelé supposé infini
  }
  const L1 = M.ridgeLines(), L2 = lignesDeCretes(pm);
  assert.ok(L1.length >= 3, `la v1 doit voir des crêtes : ${L1.length}`);
  assert.deepEqual(L2.map((l) => [l.d, l.g, l.drop, l.len, l.pts.length]), L1.map((/** @type {any} */ l) => [l.d, l.g, l.drop, l.len, l.pts.length]));
});

test('relief : Essentiel garde les crêtes principales, Tout voir les ajoute — chacune avec sa raison', () => {
  const lignes = lignesDeCretes(masquePlans());
  const ess = classerCretes(lignes, { toutVoir: false }), tout = classerCretes(lignes, { toutVoir: true });
  const nets = (/** @type {any[]} */ c) => c.filter((x) => x.etat === 'net').length;
  assert.ok(nets(tout) >= nets(ess), 'passer en Tout voir ne retire jamais une crête');
  for (let i = 0; i < lignes.length; i++) {
    if (ess[i].etat === 'net') assert.equal(tout[i].etat, 'net'); // jamais une crête affichée en Essentiel qui disparaît en Tout voir
    if (ess[i].etat === 'absent') assert.ok(ess[i].raison);
  }
  const L = { pts: [], d: 5, g: 2, drop: 100, len: 10 };
  assert.equal(classerCretes([L], { toutVoir: false })[0].etat, 'net');
  assert.equal(classerCretes([{ ...L, len: 3 }], { toutVoir: false })[0].raison, 'crête trop courte');
  assert.equal(classerCretes([{ ...L, len: 3 }], { toutVoir: true })[0].etat, 'net');
  assert.equal(classerCretes([{ ...L, drop: 20 }], { toutVoir: false })[0].raison, 'dénivelé caché trop faible');
  assert.equal(classerCretes([{ ...L, drop: 20 }], { toutVoir: true })[0].etat, 'net');
  assert.equal(classerCretes([{ ...L, g: 1.3 }], { toutVoir: false })[0].raison, 'plan trop proche du suivant');
  assert.equal(classerCretes([{ ...L, d: 0.5 }], { toutVoir: false })[0].raison, 'crête trop proche');
});
