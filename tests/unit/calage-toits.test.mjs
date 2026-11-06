// @ts-nocheck — villes synthétiques : le typage n'apporte rien ici.
// Calage sur les toits : une ville irrégulière retrouve un cap décalé de 12° à ±0,2° malgré 20 % de colonnes bruitées (arbres) ; une silhouette répétitive (façades régulières) est refusée ; peu de bâtiments : refus.
import test from 'node:test';
import assert from 'node:assert/strict';
import { calerSurToits, tableFusionnee, couvertureBatiments } from '../../src/calage/toits.js';
import { alignementsAlternatifs } from '../../src/calage/permutation.js';
import { silhouetteBrute } from '../../src/scene/silhouette-batiments.js';
import { elevationRelief } from '../../src/calage/horizon.js';

const D = Math.PI / 180, POS = { lat: 48.8566, lon: 2.3522 }, W = 800, H = 400, ECRAN = { largeurPx: W, hauteurPx: H }, K_LAT = 111320, K_LON = 111320 * Math.cos(POS.lat * D);
const alea = (graine) => { let a = (graine * 2654435761) >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const bati = (N, E, w, l, h) => { const pts = new Float64Array(8); [[-l, -w], [-l, w], [l, w], [l, -w]].forEach(([dn, de], j) => { pts[2 * j] = POS.lat + (N + dn) / K_LAT; pts[2 * j + 1] = POS.lon + (E + de) / K_LON; }); return { h, pts }; };
/** Ville irrégulière : immeubles et tours de 10 à 60 m, de largeurs variées, à 100–420 m, tous azimuts (une silhouette uniforme, sans relief propre, ne permet de caler rien : refusée). */
const villeIrreguliere = (graine, n = 140) => { const r = alea(graine); return Array.from({ length: n }, () => { const rho = 100 + r() * 320, th = r() * 2 * Math.PI; return bati(rho * Math.cos(th), rho * Math.sin(th), 6 + r() * 16, 6 + r() * 16, 10 + r() * 50); }); };
/** Façades régulières : un immeuble de 22 m tous les 6° de relèvement, à 120 m (silhouette périodique). */
const villeRepetitive = () => Array.from({ length: 60 }, (_, k) => { const th = (k * 6) * D; return bati(120 * Math.cos(th), 120 * Math.sin(th), 9, 9, 24); });
const opt = { pos: POS, oeilRelM: 1.6, h0: null, courbure: false, distMinM: 60 };

/** Luminance de ce que l'on VOIT depuis la position, le téléphone étant réellement dirigé vers `capVrai` ; `bruit` : part des colonnes (blocs de 8 px) masquées par des « arbres ». */
function image(brute, { capVrai, champ = 70, cw = 320, bruit = 0, graine = 5 }) {
  const ch = Math.round(cw * H / W), k = cw / W, fh = (W / 2) / Math.tan(champ / 2 * D), L = new Float32Array(cw * ch), r = alea(graine), arbre = new Set();
  for (let b = 0; b < cw / 8; b++) if (r() < bruit) arbre.add(b);
  for (let py = 0; py < ch; py++) for (let px = 0; px < cw; px++) {
    const xs = px / k, ys = py / k, brg = capVrai + Math.atan((xs - W / 2) / fh) / D, el = -Math.atan((ys - H / 2) / fh) / D, sky = elevationRelief(brute, brg);
    L[py * cw + px] = el > sky + (arbre.has(Math.floor(px / 8)) ? 3.5 : 0) ? 220 : 40;
  }
  return { L, cw, ch };
}
const contexte = (bats, { capVrai, erreur, bruit = 0, minM = 60 }) => {
  const brute = silhouetteBrute(bats, { ...opt, distMinM: minM }).ang;
  return { pose: { capDeg: capVrai + erreur, inclinaisonDeg: 0, roulisDeg: 0 }, camFov: 70, ecran: ECRAN, champAffiche: (c) => c, photo: false, relief: () => null, lireSilhouette: () => null,
    lireLuminance: (cw) => image(brute, { capVrai, bruit, cw }), toits: async () => ({ ang: brute }) };
};

test('cap décalé de 12° retrouvé à ±0,2° (ville irrégulière)', async () => {
  const r = await calerSurToits(contexte(villeIrreguliere(1), { capVrai: 130, erreur: 12 }));
  assert.equal(r.ok, true, JSON.stringify(r)); assert.ok(Math.abs(r.dh + 12) < 0.2, `dh ${r.dh}`); assert.match(r.message, /calé sur les toits/);
});

test('cap retrouvé malgré 20 % de colonnes bruitées par des arbres (±0,3° tolérés)', async () => {
  for (const [graine, capVrai, erreur] of [[2, 40, -9], [3, 250, 12]]) {
    const r = await calerSurToits({ ...contexte(villeIrreguliere(graine), { capVrai, erreur, bruit: 0.2 }) });
    assert.equal(r.ok, true, JSON.stringify(r)); assert.ok(Math.abs(r.dh + erreur) < 0.3, `dh ${r.dh} pour ${-erreur}`);
  }
});

test('silhouette répétitive (façades régulières, toits répétés) : refusée, jamais « précise mais fausse »', async () => {
  const r = await calerSurToits(contexte(villeRepetitive(), { capVrai: 100, erreur: 6 }));
  assert.equal(r.ok, false); assert.match(r.raison, /répétitive|plate|incertains/);
});

test('peu de bâtiments dans le champ : refus ; bâtiments indisponibles : refus', async () => {
  const peu = [bati(200, 0, 10, 10, 20)]; // un seul immeuble : il couvre moins de 30 % du champ
  const r = await calerSurToits(contexte(peu, { capVrai: 0, erreur: 5 }));
  assert.equal(r.ok, false); assert.match(r.raison, /peu de bâtiments/);
  assert.equal((await calerSurToits({ ...contexte(peu, { capVrai: 0, erreur: 5 }), toits: async () => null })).ok, false);
});

test('bâtiments trop proches écartés pour le cap : un immeuble à 30 m ne compte pas', () => {
  const b = [bati(30, 0, 10, 5, 40), bati(300, 0, 10, 10, 40)];
  const proche = silhouetteBrute(b, { ...opt, distMinM: 3 }).ang, loin = silhouetteBrute(b, { ...opt, distMinM: 60 }).ang;
  assert.ok(proche[0] > 45); assert.ok(loin[0] > 5 && loin[0] < 12, `${loin[0]}`);
});

test('table fusionnée : maximum du relief et des bâtiments ; couverture du champ', () => {
  const relief = new Float32Array(720).fill(2), bat = new Float32Array(3600).fill(-99); bat.fill(10, 0, 100);
  const t = tableFusionnee(relief, bat); assert.equal(t.length, 3600); assert.equal(t[50], 10); assert.equal(t[500], 2);
  assert.ok(Math.abs(couvertureBatiments(bat, 5, 20) - 0.5) < 0.06); assert.equal(couvertureBatiments(bat, 180, 20), 0);
  assert.ok(Math.abs(tableFusionnee(null, bat)[500] + 0.1) < 1e-6);
});

test('alignements alternatifs : unique ou répétitif', () => {
  const courbe = []; for (let dh = -20; dh <= 20; dh += 0.5) courbe.push({ dh, cost: 0.2 + Math.abs(dh - 4) * 0.4 });
  assert.equal(alignementsAlternatifs(courbe, { dh: 4, cost: 0.2 }).n, 0);
  const rep = courbe.map((c) => ({ ...c, cost: Math.min(c.cost, 0.2 + Math.abs(c.dh + 10) * 0.4) })); // un second creux presque aussi bon à −10°
  const a = alignementsAlternatifs(rep, { dh: 4, cost: 0.2 }); assert.ok(a.n >= 1 && a.chance > 0 && a.pire.dh < -9 && a.pire.dh > -11);
});
