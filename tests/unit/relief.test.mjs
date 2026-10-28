// Parité du relief (masque, altitude, hauteur d'œil, visibilité) avec le bloc TERRAIN-CORE de la v1 figée, sur des tuiles synthétiques.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { creerBandes, BANDES_HR, BANDES_AWS, altitudeEn, masqueRelevement, masqueDans, causeMasque, pixelGlobal, DISTANCES_KM, NB_RELEVEMENTS } from '../../src/scene/relief.js';
import { solFin, solLocal, estimerSol, altitudeOeil } from '../../src/scene/hauteur-oeil.js';
import { alea, tuile } from './aide-relief.mjs';
import { evaluerElement, verdictRelief } from '../../src/scene/visibilite.js';

const src = readFileSync(new URL('../../v1/villes-horizon.html', import.meta.url), 'utf8');
const debut = src.indexOf('/*TERRAIN-CORE-START*/'), fin = src.indexOf('/*TERRAIN-CORE-END*/');
assert.ok(debut > 0 && fin > debut, 'bloc TERRAIN-CORE introuvable dans la v1');
const v1 = new Function('D', `${src.slice(debut, fin)}
return {bandsFor,BANDS_HR,BANDS_LEGACY,elevAt,maskRow,maskFrom,assessPlace,fineGround,localGroundElev,maskCause,TDIST,NB,pixElev};`)(Math.PI / 180);

const POS = { lat: 48.6459, lon: -2.0281 };
/** Mêmes bandes pour la v1 et la v2 (tuiles partagées, quelques-unes absentes). @param {readonly import('../../src/scene/relief.js').ConfigBande[]} cfg2 @param {any[]} cfg1 @param {number} [trous] */
function bandesPaires(cfg2, cfg1, trous = 0.25) {
  const b2 = creerBandes(cfg2, POS), b1 = v1.bandsFor(cfg1, POS), r = alea(7);
  b2.forEach((b, bi) => {
    assert.deepEqual([b.z, b.tx0, b.ty0, b.nx, b.ny, b.shift], [b1[bi].z, b1[bi].tx0, b1[bi].ty0, b1[bi].nx, b1[bi].ny, b1[bi].shift]);
    for (let iy = 0; iy < b.ny; iy++) for (let ix = 0; ix < b.nx; ix++) {
      const k = iy * b.nx + ix, absent = !b.garantie && r() < trous;
      const t = absent ? null : tuile(b.z, b.tx0 + ix, b.ty0 + iy, b.ts);
      b.tiles[k] = t; b1[bi].tiles[k] = t;
    }
  });
  return { b2, b1 };
}
const { b2: HR2, b1: HR1 } = bandesPaires(BANDES_HR, v1.BANDS_HR);

test('relief : constantes identiques à la v1', () => {
  assert.equal(NB_RELEVEMENTS, v1.NB); assert.deepEqual([...DISTANCES_KM], [...v1.TDIST]);
  assert.deepEqual(BANDES_HR.map((b) => [b.z, b.max, b.ts, b.garantie]), v1.BANDS_HR.map((/** @type {any} */ b) => [b.z, b.max, b.ts, b.guaranteed]));
  assert.deepEqual(BANDES_AWS.map((b) => [b.z, b.max, b.ts, b.garantie]), v1.BANDS_LEGACY.map((/** @type {any} */ b) => [b.z, b.max, b.ts, b.guaranteed]));
  assert.deepEqual(pixelGlobal(12, 48.6, -2, 512).map(Math.floor).length, 2);
});

test('relief : altitude en un point identique à la v1 (bande fine incomplète, cascade, mer)', () => {
  const r = alea(11);
  for (let i = 0; i < 600; i++) {
    const d = r() < 0.5 ? r() * 6 : r() * 190, brg = r() * 2 * Math.PI, lat = POS.lat + (d * Math.cos(brg)) / 111.32, lon = POS.lon + (d * Math.sin(brg)) / (111.32 * Math.cos(POS.lat * Math.PI / 180));
    const skip = r() < 0.3, a = altitudeEn(HR2, lat, lon, d, skip), b = v1.elevAt(HR1, lat, lon, d, skip);
    assert.ok(Object.is(a, b), `${d} km : ${a} ≠ ${b}`);
  }
});

test('relief : masque par relèvement identique à la v1 (bruts compris)', () => {
  for (const oeil of [2, 15.6, 80]) for (const bi of [0, 45, 133, 270, 391, 500, 719]) {
    const r2 = new Float32Array(DISTANCES_KM.length), r1 = new Float32Array(DISTANCES_KM.length);
    const m2 = masqueRelevement(HR2, POS, oeil, bi, r2), m1 = v1.maskRow(HR1, POS, oeil, bi, r1);
    assert.deepEqual([...m2], [...m1]); assert.deepEqual([...r2], [...r1]);
  }
});

test('relief : masque lu dans une direction, verdict de visibilité et cause du masque identiques à la v1', () => {
  const oeil = 12, pm = new Array(NB_RELEVEMENTS);
  for (let bi = 0; bi < NB_RELEVEMENTS; bi += 1) pm[bi] = masqueRelevement(HR2, POS, oeil, bi);
  const r = alea(5), masque = { oeilM: oeil, pm }, T1 = { h0: oeil, pm };
  for (let i = 0; i < 300; i++) {
    const c = { dist: 0.2 + r() * 120, brg: r() * 360, kind: ['peak', 'cape', 'town', 'monument', 'lighthouse'][i % 5], dem: i % 7 === 0 ? null : r() * 300, ele: i % 4 === 0 ? r() * 400 : null };
    assert.ok(Object.is(masqueDans(pm, c.brg, c.dist), v1.maskFrom(pm, c.brg, c.dist)));
    const ht = r() * 40, a = evaluerElement(masque, c, ht), b = v1.assessPlace(T1, c, ht, 0.18, 0.28);
    assert.deepEqual(a, b);
  }
  for (const [brg, d] of [[10, 20], [100, 50], [250, 5]]) assert.deepEqual(causeMasque(HR2, POS, oeil, brg, d), v1.maskCause(HR1, POS, oeil, brg, d));
  // tour OSM à peine au-dessus de la crête : transparente (« low »)
  const tour = { lat: POS.lat + 0.1, lon: POS.lon + 0.1, dist: 14, brg: 40, kind: 'monument', src: 'osm', ht: 30 };
  const v = verdictRelief(masque, HR2, tour);
  assert.ok(!v.low || v.hidden); // « low » entraîne toujours « hidden »
  assert.ok(pm.some((/** @type {Float32Array} */ row) => row[row.length - 1] > 0), 'le relief synthétique doit dépasser l’horizontale');
});

test('hauteur d’œil : sol fin et sol local identiques à la v1', () => {
  const pts = [POS, { lat: 48.6501, lon: -2.0334 }, { lat: 48.7, lon: -1.9 }];
  for (const p of pts) {
    assert.ok(Object.is(solFin(HR2, p), v1.fineGround(HR1, p)));
    assert.ok(Object.is(solLocal(HR2, p), v1.localGroundElev(HR1, p)));
  }
});

test('hauteur d’œil : sans donnée fine → bas des valeurs du modèle 30 m, la mer exclue', () => {
  const { b2 } = bandesPaires(BANDES_HR, v1.BANDS_HR, 1); // aucune tuile fine
  const e = estimerSol(b2, POS);
  assert.ok(e.solM >= 0 && e.solM < 400); assert.match(e.origine, /modèle 30 m/);
  assert.ok(Number.isNaN(solFin(b2, POS)));
  const { b2: avecFin } = bandesPaires(BANDES_HR, v1.BANDS_HR, 0);
  assert.equal(estimerSol(avecFin, POS).origine, 'données fines (modèle de terrain)');
});

test('hauteur d’œil : œil = sol + 1,6 m + correction, jamais sous 1 m', () => {
  assert.equal(altitudeOeil(14), 15.6); assert.equal(altitudeOeil(14, 3), 18.6); assert.equal(altitudeOeil(-5), 1); assert.equal(altitudeOeil(NaN), 1.6);
});
