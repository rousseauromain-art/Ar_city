// @ts-nocheck — code de la v1 extrait par `new Function` : le typage n'apporte rien ici.
// Caractérisation : silhouette des bâtiments de la v1 (`urbCompute`, `urbSmooth`, `urbOccluder`) = v2 (`scene/silhouette-batiments.js`), courbure terrestre neutralisée, sur des villes synthétiques.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { profilBatiments, lisserCouches, occulteur, poserSol, premierPlanM } from '../../src/scene/silhouette-batiments.js';

const src = readFileSync(new URL('../../../v1/villes-horizon.html', import.meta.url), 'utf8');
const i0 = src.indexOf('const URB_LMAX='), i1 = src.indexOf('function urbOccluder'), i2 = src.indexOf('\n}\n', i1) + 3;
assert.ok(i0 > 0 && i1 > i0 && i2 > i1, 'code de la silhouette introuvable dans la v1');
const v1 = new Function('pos', 'S', 'terrain', 'elevAt', 'D', `const URB_NB=720, URB_R_KM=2.5; let urbTiles=new Map(), urbAng=null, urbDist=null, urbAt=null, urbVer=0, urbStats={};
${src.slice(i0, i2)}
return { urbCompute, urbOccluder, poser(t){ urbTiles=t; }, etat(){ return { urbRaw, urbLS, urbAng, urbDist }; } };`);

const D = Math.PI / 180, POS = { lat: 48.8566, lon: 2.3522 };
const alea = (graine) => { let a = (graine * 2654435761) >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
/** Ville synthétique : rectangles et L de hauteurs variées, de 20 m à 3,3 km, tous azimuts. */
function ville(graine, n = 400) {
  const r = alea(graine), kLat = 111320, kLon = 111320 * Math.cos(POS.lat * D), bl = [];
  for (let k = 0; k < n; k++) {
    const rho = 20 + Math.pow(r(), 1.7) * 3300, th = r() * 2 * Math.PI, N = rho * Math.cos(th), E = rho * Math.sin(th), w = 8 + r() * 40, l = 8 + r() * 60, a = r() * Math.PI;
    const coins = [[-w, -l], [w, -l], [w, l], [-w, l]].map(([x, y]) => [N + x * Math.cos(a) - y * Math.sin(a), E + x * Math.sin(a) + y * Math.cos(a)]);
    const pts = new Float64Array(8); coins.forEach(([n2, e2], j) => { pts[2 * j] = POS.lat + n2 / kLat; pts[2 * j + 1] = POS.lon + e2 / kLon; });
    bl.push({ h: [6, 9, 12, 15, 18, 25, 40, 90][Math.floor(r() * 8)] + r() * 3, pts });
  }
  return bl;
}
const egal = (a, b, msg) => { assert.equal(a.length, b.length, msg); for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) assert.fail(`${msg} : direction ${i} : ${a[i]} ≠ ${b[i]}`); };

function comparer({ graine, obsHeight, relief, lisse = true }) {
  const bl = ville(graine), terrain = relief ? { bands: {}, h0: 35 + obsHeight } : null;
  const elevAt = (bands, lat, lon) => 12 + 40 * Math.sin(lat * 900) * Math.cos(lon * 700); // relief synthétique déterministe
  const S = { obsHeight, relief: !!relief, layers: { urbClip: true, urbSmooth: lisse } };
  const A = v1(POS, S, terrain, elevAt, D); A.poser(new Map([['t', { bl: bl.map((b) => ({ h: b.h, pts: b.pts })) }]])); A.urbCompute();
  const ref = A.etat();
  const mien = bl.map((b) => ({ h: b.h, pts: b.pts }));
  if (relief) poserSol(mien, (lat, lon, dk) => elevAt(null, lat, lon, dk), POS);
  const P = profilBatiments(mien, { pos: POS, oeilRelM: 1.6 + obsHeight, h0: relief ? terrain.h0 : null, clipM: premierPlanM(obsHeight, true), courbure: false });
  egal(P.ang, ref.urbAng, 'angles toutes couches'); egal(P.dist, ref.urbDist, 'distances toutes couches');
  for (let li = 0; li < 3; li++) { egal(P.la[li], ref.urbRaw.la[li], `couche ${li} : angles`); egal(P.ld[li], ref.urbRaw.ld[li], `couche ${li} : distances`); }
  const ls = lisserCouches(P.la, lisse);
  for (let li = 0; li < 3; li++) egal(ls[li], ref.urbLS[li], `couche ${li} lissée`);
  const r = alea(graine + 99);
  for (let k = 0; k < 200; k++) { const brg = r() * 360, d = 50 + r() * 3000; assert.equal(occulteur({ ls, ld: P.ld }, brg, d), A.urbOccluder(brg, d), `occulteur ${brg.toFixed(1)}° ${d.toFixed(0)} m`); }
  return P;
}

test('v1 = v2, terrain plat, œil à hauteur de rue (premier plan de 150 m masqué)', () => { for (const g of [1, 2, 3]) comparer({ graine: g, obsHeight: 0, relief: false }); });
test('v1 = v2, œil en hauteur (balcon à 25 m : premier plan de 3 m seulement)', () => { for (const g of [4, 5]) comparer({ graine: g, obsHeight: 25, relief: false }); });
test('v1 = v2 avec le relief sous les bâtiments (altitude du pied, h0)', () => { for (const g of [6, 7, 8]) comparer({ graine: g, obsHeight: 0, relief: true }); comparer({ graine: 9, obsHeight: 12, relief: true }); });
test('v1 = v2 sans lissage (réglage « lissage » décoché)', () => { comparer({ graine: 10, obsHeight: 0, relief: false, lisse: false }); });

test('la courbure terrestre (écart voulu avec la v1) ne baisse que les angles lointains, et très peu', () => {
  const bl = ville(11), cle = { pos: POS, oeilRelM: 1.6, h0: null, clipM: 150 };
  const a = profilBatiments(bl, { ...cle, courbure: false }), b = profilBatiments(bl, { ...cle, courbure: true });
  let pires = 0;
  for (let i = 0; i < 720; i++) { if (a.ang[i] > -50) { assert.ok(b.ang[i] <= a.ang[i] + 1e-6); pires = Math.max(pires, a.ang[i] - b.ang[i]); } }
  assert.ok(pires > 0 && pires < 0.2, `baisse maximale ${pires}°`);
});
