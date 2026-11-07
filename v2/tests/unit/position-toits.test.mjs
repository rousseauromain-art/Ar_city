// @ts-nocheck — villes synthétiques.
// Position par les toits : un décalage de 12 m est retrouvé à ±4 m ; un alignement répétitif ou déjà bon : refus.
import test from 'node:test';
import assert from 'node:assert/strict';
import { corrigerPositionParToits } from '../../src/calage/position-toits.js';
import { tableFusionnee } from '../../src/calage/toits.js';
import { observerHorizon, elevationRelief } from '../../src/calage/horizon.js';
import { silhouetteBrute } from '../../src/scene/silhouette-batiments.js';

const D = Math.PI / 180, W = 800, H = 400, ECRAN = { largeurPx: W, hauteurPx: H }, VRAIE = { lat: 48.8566, lon: 2.3522 }, K_LAT = 111320, K_LON = 111320 * Math.cos(VRAIE.lat * D);
const alea = (graine) => { let a = (graine * 2654435761) >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const bati = (N, E, w, l, h) => { const pts = new Float64Array(8); [[-l, -w], [-l, w], [l, w], [l, -w]].forEach(([dn, de], j) => { pts[2 * j] = VRAIE.lat + (N + dn) / K_LAT; pts[2 * j + 1] = VRAIE.lon + (E + de) / K_LON; }); return { h, pts }; };
/** Immeubles proches (70 à 300 m) : la silhouette dépend fortement de la position, comme dans une rue étroite. */
const ville = (graine, n = 160) => { const r = alea(graine); return Array.from({ length: n }, () => { const rho = 70 + r() * 230, th = r() * 2 * Math.PI; return bati(rho * Math.cos(th), rho * Math.sin(th), 5 + r() * 12, 5 + r() * 12, 8 + r() * 24); }); };
const decaler = (p, n, e) => ({ lat: p.lat + n / K_LAT, lon: p.lon + e / K_LON });
const champ = 70, fh = (W / 2) / Math.tan(champ / 2 * D);

/** Points d'horizon lus dans l'image prise depuis la VRAIE position, cap juste (0°). */
function points(bats, capVrai = 0) {
  const brute = silhouetteBrute(bats, { pos: VRAIE, oeilRelM: 1.6, h0: null, courbure: true, distMinM: 3 }).ang, tab = tableFusionnee(null, brute), cw = 480, ch = Math.round(cw * H / W), k = cw / W, L = new Float32Array(cw * ch);
  for (let py = 0; py < ch; py++) for (let px = 0; px < cw; px++) { const brg = capVrai + Math.atan((px / k - W / 2) / fh) / D, el = -Math.atan((py / k - H / 2) / fh) / D; L[py * cw + px] = el > elevationRelief(tab, brg) ? 220 : 40; }
  return observerHorizon({ L, cw, ch }, { capDeg: capVrai, inclinaisonDeg: 0, roulisDeg: 0 }, fh, -4, 70, ECRAN);
}
const entree = (bats, pts, pos) => ({ pos, batiments: bats, oeilRelM: 1.6, h0: null, pts, pose: { capDeg: 0, inclinaisonDeg: 0, roulisDeg: 0 }, ecran: ECRAN, fh, reliefTab: null });
const dist = (a, b) => Math.hypot((b.lat - a.lat) * K_LAT, (b.lon - a.lon) * K_LON);

test('un décalage de 12 m de la position est retrouvé à ±4 m', () => {
  for (const [graine, n, e] of [[1, -5, 11], [2, 8, -9], [3, 0, 12]]) {
    const bats = ville(graine), pts = points(bats), estimee = decaler(VRAIE, n, e);
    const r = corrigerPositionParToits(entree(bats, pts, estimee));
    assert.equal(r.ok, true, `graine ${graine} : ${JSON.stringify(r)}`); assert.ok(dist(r.pos, VRAIE) <= 4, `graine ${graine} : ${dist(r.pos, VRAIE).toFixed(1)} m d'erreur restante`);
    assert.ok(r.ecartM >= 8 && r.ecartM <= 16 && r.cout < r.cout0 * 0.7);
  }
});

test('position déjà juste : aucune correction ; trop peu de bâtiments ou de colonnes : refus', () => {
  const bats = ville(4), pts = points(bats);
  const r = corrigerPositionParToits(entree(bats, pts, VRAIE)); assert.equal(r.ok, false); assert.match(r.raison, /déjà aussi bien/);
  assert.match(corrigerPositionParToits(entree(bats.slice(0, 3), pts, decaler(VRAIE, 8, 8))).raison, /trop peu de bâtiments/);
  assert.match(corrigerPositionParToits(entree(bats, pts.slice(0, 10), decaler(VRAIE, 8, 8))).raison, /peu visible/);
});

test('rue de façades régulières (silhouette identique le long de la rue) : plusieurs positions presque aussi bonnes, refus', () => {
  // deux alignements d'immeubles identiques, tous les 12 m le long d'une rue nord-sud : décaler la position de 12 m donne la même silhouette
  const bats = []; for (let k = -30; k <= 30; k++) { bats.push(bati(k * 12, 15, 5, 5, 25), bati(k * 12, -15, 5, 5, 25)); }
  const pts = points(bats, 0), r = corrigerPositionParToits(entree(bats, pts, decaler(VRAIE, 12, 0)));
  assert.equal(r.ok, false, JSON.stringify(r));
});
