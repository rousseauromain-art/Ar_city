// Parité du noyau avec la v1 figée : les fonctions de la v1 sont extraites du fichier et exécutées telles quelles.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { ecartAngle, normaliserCap, borner } from '../../src/noyau/maths.js';
import { distanceEtCap, pointAuCap, angleHorizonDeg, elevationApparenteDeg, chuteCourbureM, lirePoint } from '../../src/noyau/geo.js';
import { positionSoleil } from '../../src/noyau/astro.js';
import { lireExif, champDepuisFocale, directionPhoto } from '../../src/noyau/exif.js';
import { jpegExif } from './aide-jpeg.mjs';
import { RAYON_EFFECTIF_M } from '../../src/noyau/constantes.js';

const src = readFileSync(new URL('../../v1/villes-horizon.html', import.meta.url), 'utf8');
/** Extrait le texte d'une déclaration de la v1 (de `debut` jusqu'à la ligne contenant `fin`). */
/** @param {string} debut @param {string} fin */
function extraire(debut, fin) {
  const i = src.indexOf(debut); assert.ok(i >= 0, `introuvable dans la v1 : ${debut}`);
  const j = src.indexOf(fin, i); assert.ok(j >= 0, `fin introuvable : ${fin}`);
  return src.slice(i, j + fin.length);
}
const v1 = new Function('D', `${extraire('const wrap=', ';\n')}
${extraire('function distBrg(a,b){', '\n}\n')}
${extraire('function sunPos(t,lat,lon){', 'el+R}; }')}
${extraire('function parseLatLon(s){', 'null; }')}
${extraire('function readExif(buf){', '  return r; }')}
return {wrap,distBrg,sunPos,parseLatLon,readExif};`)(Math.PI / 180);

/** Générateur déterministe (mulberry32). */
/** @param {number} graine */
function alea(graine) { let a = graine; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

test('maths : écart d’angle identique à la v1', () => {
  const r = alea(1);
  for (let i = 0; i < 500; i++) { const a = (r() - 0.5) * 2000; assert.equal(ecartAngle(a), v1.wrap(a)); }
  assert.equal(normaliserCap(-10), 350); assert.equal(normaliserCap(370), 10); assert.equal(borner(5, 0, 3), 3);
});

test('géo : distance et cap identiques à la v1', () => {
  const r = alea(2);
  for (let i = 0; i < 500; i++) {
    const a = { lat: (r() - 0.5) * 160, lon: (r() - 0.5) * 360 }, b = { lat: (r() - 0.5) * 160, lon: (r() - 0.5) * 360 };
    const o = v1.distBrg(a, b), n = distanceEtCap(a, b);
    assert.equal(n.distKm, o.dist); assert.equal(n.capDeg, o.brg);
  }
});

test('géo : point au cap retombe sur la bonne distance et le bon cap', () => {
  const p = { lat: 48.65, lon: -2.03 };
  for (const cap of [0, 45, 90, 180, 240, 315]) {
    const q = pointAuCap(p, 10, cap), m = distanceEtCap(p, q);
    assert.ok(Math.abs(m.distKm - 10) < 0.05, `dist ${m.distKm}`); assert.ok(Math.abs(ecartAngle(m.capDeg - cap)) < 0.2, `cap ${m.capDeg}`);
  }
});

test('géo : courbure, horizon et élévation apparente', () => {
  assert.ok(Math.abs(chuteCourbureM(10000) - 10000 ** 2 / (2 * RAYON_EFFECTIF_M)) < 1e-9);
  assert.ok(Math.abs(angleHorizonDeg(0) - -Math.sqrt(2 * 1.6 / (6371000 * 1.13)) * 180 / Math.PI) < 1e-12);
  assert.equal(angleHorizonDeg(-5), angleHorizonDeg(-1.1)); // plancher à 0,5 m
  assert.ok(angleHorizonDeg(100) < angleHorizonDeg(0));
  // formule de la v1 (draw) : atan2(alt − h0 − D²/(2·Reff), D)
  const h0 = 20 + 1.6, d = 25000;
  assert.equal(elevationApparenteDeg(300, h0, 25), Math.atan2(300 - h0 - d * d / (2 * 6371000 * 1.13), d) / (Math.PI / 180));
});

test('géo : lecture de coordonnées identique à la v1', () => {
  for (const s of ['45.0805, 7.6705', '45,0805 ; 7,6705', 'https://maps/@48.6459,-2.0281,17z', '91, 0', 'rien', '', null, '-33.9 151.2']) {
    assert.deepEqual(lirePoint(s), v1.parseLatLon(s), String(s));
  }
});

test('astro : soleil identique à la v1 (dates, lieux variés)', () => {
  const r = alea(3);
  for (let i = 0; i < 500; i++) {
    const t = Date.UTC(2024, 0, 1) + r() * 3 * 365 * 86400000, lat = (r() - 0.5) * 140, lon = (r() - 0.5) * 360;
    const o = v1.sunPos(t, lat, lon), n = positionSoleil(t, lat, lon);
    assert.equal(n.azDeg, o.az); assert.equal(n.elDeg, o.el);
  }
});

test('astro : le soleil d’Ibiza (27/09/2026, coucher) est vers 267°', () => {
  const s = positionSoleil(Date.UTC(2026, 8, 27, 17, 35, 0), 38.9911, 1.5748);
  assert.ok(s.azDeg > 255 && s.azDeg < 280, `azimut ${s.azDeg}`); assert.ok(s.elDeg < 10);
});

test('exif : lecture identique à la v1 sur un JPEG synthétique', () => {
  const buf = jpegExif();
  const n = lireExif(buf), o = v1.readExif(buf);
  assert.deepEqual(n, o);
  if (!n || n.lat === undefined || n.lon === undefined) throw new Error('EXIF illisible');
  assert.equal(n.make, 'Google'); assert.equal(n.orient, 1); assert.equal(n.f35, 24);
  assert.ok(Math.abs(n.lat - 48.6459) < 1e-4); assert.ok(Math.abs(n.lon - -2.0281) < 1e-4); assert.equal(n.dir, 120);
  assert.equal(n.utc, Date.UTC(2026, 9, 25, 10, 22, 30)); assert.match(String(n.timeSrc), /décalage horaire/);
});

test('exif : fichier non JPEG ou sans EXIF → null', () => {
  assert.equal(lireExif(new Uint8Array([1, 2, 3, 4, 5, 6]).buffer), null);
  assert.equal(lireExif(Uint8Array.from([0xFF, 0xD8, 0xFF, 0xD9, 0, 0, 0, 0]).buffer), null);
});

test('exif : direction du Pixel — +90° à l’horizontale, -90° tête en bas, portrait peu fiable, autre marque inchangée', () => {
  const d = (/** @type {object} */ o, /** @type {number} */ w, /** @type {number} */ h) => directionPhoto(lireExif(jpegExif(o)), w, h);
  assert.deepEqual(d({ orient: 1, dir: 177 }, 4000, 3000), { capDeg: 267, correctionDeg: 90, peuFiable: false });
  assert.equal(d({ orient: 3, dir: 100 }, 4000, 3000).capDeg, 10);
  assert.equal(d({ orient: 6, dir: 100 }, 3000, 4000).peuFiable, true);
  assert.deepEqual(d({ make: 'Apple', orient: 1, dir: 100 }, 4000, 3000), { capDeg: 100, correctionDeg: 0, peuFiable: false });
  assert.deepEqual(directionPhoto(null, 10, 10), { capDeg: null, correctionDeg: 0, peuFiable: true });
});

test('exif : champ de vision depuis la focale équivalente', () => {
  // 24 mm éq. sur 4000×3000 : valeur calculée comme dans enterPhoto de la v1
  const D = Math.PI / 180, dd = 2 * Math.atan(43.27 / 2 / 24);
  const attendu = Math.round(2 * Math.atan(Math.tan(dd / 2) * 4000 / 5000) / D * 2) / 2;
  assert.equal(champDepuisFocale(24, 4000, 3000), attendu);
  assert.equal(champDepuisFocale(24, 3000, 4000), attendu);
});

// Photos réelles du dépôt privé Ar_city-photos : ignorées si le dossier est absent (CI sans jeton).
const DOSSIER_PHOTOS = process.env.PHOTOS_DIR || '/home/user/ar_city-photos';
const photos = existsSync(DOSSIER_PHOTOS) ? readdirSync(DOSSIER_PHOTOS).filter((f) => /\.jpe?g$/i.test(f)) : [];
test('exif : photos réelles identiques à la v1', { skip: photos.length === 0 && 'photos absentes' }, () => {
  for (const f of photos) {
    const b = readFileSync(`${DOSSIER_PHOTOS}/${f}`), buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    const n = lireExif(buf);
    assert.deepEqual(n, v1.readExif(buf), f);
    assert.ok(n && n.lat !== undefined && n.utc, `${f} : position et heure lues`);
  }
});
