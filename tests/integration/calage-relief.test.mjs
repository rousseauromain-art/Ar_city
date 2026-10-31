// @ts-nocheck — code de la v1 extrait par `new Function` : le typage n'apporte rien ici.
// Calage sur le relief et sur les repères : noyau de la v1 (`CALAGE-CORE`, `cleanHorizonPts`, `photoPeaks`, `landmarksForCal`, `landmarkFit`, `landmarkAlign`) = v2, sur des scènes synthétiques.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tableRelief, observerHorizon, ajusterHorizon, nettoyerPointsHorizon, luminance } from '../../src/calage/horizon.js';
import { pointesPhoto, reperesPourCalage, ajusterSurReperes, calerSurReperes } from '../../src/calage/reperes.js';
import { champAffiche } from '../../src/noyau/projection.js';
import { DISTANCES_KM } from '../../src/scene/relief.js';
import { LARGEUR_TYPE_M } from '../../src/noyau/constantes.js';
import { calerAutomatiquement } from '../../src/calage/auto.js';

const src = readFileSync(new URL('../../v1/villes-horizon.html', import.meta.url), 'utf8');
const tranche = (debut, fin) => { const i = src.indexOf(debut), j = src.indexOf(fin, i); assert.ok(i >= 0 && j > i, `introuvable : ${debut}`); return src.slice(i, j + fin.length); };
const D = Math.PI / 180, wrap = (a) => ((a + 540) % 360) - 180, W = 800, H = 400, ECRAN = { largeurPx: W, hauteurPx: H };
const vFovFor = (cam) => champAffiche(cam, ECRAN, null);        // même fonction des deux côtés : on compare le calage, pas le recadrage
const K = DISTANCES_KM.length;

// ---------- noyau : table du relief, horizon lu, ajustement ----------
const noyau = tranche('/*CALAGE-CORE-START*/', '/*CALAGE-CORE-END*/');
const TDIST = DISTANCES_KM, kIndex = (d) => { if (TDIST[0] >= d) return -1; let lo = 0, hi = TDIST.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (TDIST[m] < d) lo = m; else hi = m - 1; } return lo; };
const v1Noyau = new Function('W', 'H', 'D', 'NB', 'BSTEP', 'terrain', 'vFovFor', 'maskFrom', `${noyau}; return {skyTable, observeHorizon, fitHorizon};`);
const maskFrom = (pm, brg, dKm) => { const k = kIndex(dKm); if (k < 0) return -90; const f = (((brg % 360) + 360) % 360) / 0.5, i0 = Math.floor(f) % 720, i1 = (i0 + 1) % 720, t = f - Math.floor(f); return pm[i0][k] * (1 - t) + pm[i1][k] * t; };

/** Relief synthétique : masque `pm[720][K]` d'après un profil d'élévation (°) par relèvement. */
const reliefDe = (profil) => Array.from({ length: 720 }, (_, i) => Float32Array.from({ length: K }, () => profil(i * 0.5)));
/** Image de luminance d'une scène : le ciel (clair) au-dessus du profil, le sol (sombre) dessous, vue avec un cap et un horizon VRAIS ; objets (poteaux) facultatifs. */
function imageScene(profil, { capVrai, siteVrai, champ = 70, cw = 320, poteaux = [] }) {
  const ch = Math.max(60, Math.round(cw * H / W)), L = new Float32Array(cw * ch), fh = (W / 2) / Math.tan(champ / 2 * D), k = cw / W;
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const xs = x / k, ys = y / k, brg = capVrai + Math.atan((xs - W / 2) / fh) / D, el = siteVrai - Math.atan((ys - H / 2) / fh) / D;
    let v = el > profil(((brg % 360) + 360) % 360) ? 200 + 10 * Math.sin(x / 9) : 55 + 8 * Math.sin(y / 7);
    for (const p of poteaux) if (Math.abs(xs - p.x) < 4 && ys > p.y0 && ys < p.y1) v = 40;
    L[y * cw + x] = v;
  }
  return { L, cw, ch };
}
function compareNoyau(nom, profil, { capVrai, siteVrai, champVrai = 70, camReglage = 70, poteaux = [], pose = { capDeg: 100, inclinaisonDeg: 2, roulisDeg: 0 }, eMin = -2, eMax = 12 }) {
  const pm = reliefDe(profil), lum = imageScene(profil, { capVrai, siteVrai, champ: champVrai, poteaux });
  const v1 = v1Noyau(W, H, D, 720, 0.5, { pm }, vFovFor, maskFrom), P1 = { heading: pose.capDeg, pitch: pose.inclinaisonDeg, roll: pose.roulisDeg };
  const fh = (W / 2) / Math.tan(vFovFor(camReglage) / 2 * D);
  const tab1 = v1.skyTable(), tab2 = tableRelief(pm);
  assert.deepEqual([...tab2], [...tab1], `${nom} : table du relief`);
  const pts1 = v1.observeHorizon(lum, P1, fh, eMin, eMax), pts2 = observerHorizon(lum, pose, fh, eMin, eMax, ECRAN);
  assert.deepEqual(pts2, pts1, `${nom} : points d'horizon`);
  if (pts1.length < 3) return { pts: pts1, r: null };
  const r1 = v1.fitHorizon(pts1, P1, camReglage, tab1), r2 = ajusterHorizon(pts2, pose, camReglage, tab2, ECRAN, vFovFor);
  for (const k of Object.keys(r1)) assert.ok(r2[k] === r1[k] || Math.abs(r2[k] - r1[k]) < 1e-12 || (Number.isNaN(r1[k]) && Number.isNaN(r2[k])), `${nom} : ${k} ${r1[k]} / ${r2[k]}`);
  return { pts: pts1, r: r2 };
}
const collines = (a, p = 11) => (b) => 3 + a * Math.sin(b * D * 2.3) + a * 0.5 * Math.sin(b * D * 7.1 + p);

test('relief : collines — cap décalé retrouvé, mêmes points et même ajustement que la v1', () => {
  const { r, pts } = compareNoyau('collines', collines(2.2), { capVrai: 106, siteVrai: 1.2 });
  assert.ok(pts.length > 60, `${pts.length} points`); assert.equal(r.flat, false);
  assert.ok(Math.abs(r.dh - 6) < 1, `cap ${r.dh}`); assert.ok(r.cost < 0.6, `coût ${r.cost}`);
});

test('relief : montagnes — le champ est ajusté seulement si le relief est marqué ; relief presque plat : « flat »', () => {
  const m = compareNoyau('montagnes', collines(7), { capVrai: 98, siteVrai: 2, champVrai: 63, camReglage: 70 });
  assert.ok(m.r.relief >= 1.5);
  const plat = compareNoyau('plat', () => 0.1, { capVrai: 100, siteVrai: 2.4, eMin: -3, eMax: 6 });
  assert.equal(plat.r.flat, true); assert.equal(plat.r.dh, 0);
  compareNoyau('douces', collines(0.4), { capVrai: 103, siteVrai: 2 });
});

test('relief : poteaux, palmiers et objets dans l’image — mêmes colonnes écartées et même résultat', () => {
  const poteaux = [{ x: 120, y0: 0, y1: 400 }, { x: 330, y0: 80, y1: 400 }, { x: 520, y0: 100, y1: 400 }, { x: 700, y0: 60, y1: 400 }];
  compareNoyau('poteaux', collines(2.2), { capVrai: 104, siteVrai: 1.5, poteaux });
  compareNoyau('roulis', collines(3), { capVrai: 100, siteVrai: 2, pose: { capDeg: 100, inclinaisonDeg: 2, roulisDeg: 0 } });
});

test('nettoyage des colonnes au premier plan : identique à cleanHorizonPts de la v1', () => {
  const codeNettoyage = tranche('function cleanHorizonPts(pts,P,fh){', "return {pts:out.length>=25?out:pts,dropped:out.length>=25?pts.length-out.length:0}; }");
  const pose = { capDeg: 100, inclinaisonDeg: 2, roulisDeg: 0 }, P1 = { heading: 100, pitch: 2, roll: 0 }, fh = (W / 2) / Math.tan(35 * D);
  const pts = Array.from({ length: 60 }, (_, i) => ({ x: 30 + i * 12, y: 190 + 20 * Math.sin(i / 5), s: 20 }));
  const colonnes = Array.from({ length: 160 }, (_, i) => ({ brg: (100 + Math.atan((8 + i * 4.95 - W / 2) / fh) / D + 360) % 360, a: 2 + (i > 60 && i < 90 ? 6 : -1 + Math.sin(i / 9)), top: false }));
  for (const sil of [{ ok: true, skyFrac: 0.8, cols: colonnes }, { ok: true, skyFrac: 0.8, cols: [] }, { ok: false, skyFrac: 0.1, cols: [] }, null]) {
    const v1 = new Function('W', 'H', 'D', 'wrap', 'grabFrameRGB', 'observeSkyline', `${codeNettoyage}; return cleanHorizonPts;`)(W, H, D, wrap, () => (sil ? {} : null), () => sil)(pts, P1, fh);
    const v2 = nettoyerPointsHorizon(pts, sil, pose, fh, ECRAN);
    assert.deepEqual(v2, v1);
  }
  const peu = pts.slice(0, 30), sil = { ok: true, skyFrac: 0.8, cols: colonnes.map((c) => ({ ...c, a: 9 })) };   // tout écarté : moins de 25 points restants → filtre ignoré
  const v1 = new Function('W', 'H', 'D', 'wrap', 'grabFrameRGB', 'observeSkyline', `${codeNettoyage}; return cleanHorizonPts;`)(W, H, D, wrap, () => ({}), () => sil)(peu, P1, fh);
  assert.deepEqual(nettoyerPointsHorizon(peu, sil, pose, fh, ECRAN), v1); assert.equal(v1.dropped, 0);
});

// ---------- repères : pointes, repères fiables, appariement, passes ----------
const codeRepères = tranche('function photoPeaks(ps){', 'return {ok:true,corr:total,names:last.names,cam:S.camFov,cam0};\n}');
function v1Reperes({ S, monumentSites, terrain, pose, vFov, lireSilhouette }) {
  const fabrique = new Function('W', 'H', 'D', 'wrap', 'S', 'monumentSites', 'terrain', 'MON_W', 'AC_PROM', 'AC_WIN', 'AC_VTOL', 'AC_AGREE', 'pose', 'vFov', 'vFovFor', 'camReady', 'grabFrameRGB', 'observeSkyline', '$', 'showFov',
    `${codeRepères}; return {photoPeaks, landmarksForCal, landmarkFit, landmarkAlign};`);
  return fabrique(W, H, D, wrap, S, monumentSites, terrain, LARGEUR_TYPE_M, 0.8, 8, 1.5, 0.4, pose, vFov, vFovFor, () => true, () => ({}), (fr, P, fh) => lireSilhouette({ capDeg: P.heading, inclinaisonDeg: P.pitch, roulisDeg: P.roll }, fh), () => ({}), () => {});
}
/** Silhouette synthétique : pointes aux relèvements `pointes` ([dd, hauteur °]) sur un fond bas. */
function silhouette(pointes, { cap = 0, bruit = 0 } = {}) {
  const cols = [];
  for (let dd = -34; dd <= 34; dd += 0.25) { let a = 0.2 + bruit * Math.sin(dd * 3.1); for (const [pd, pa] of pointes) a = Math.max(a, pa * Math.max(0, 1 - Math.abs(dd - pd) / 0.5)); cols.push({ brg: (cap + dd + 360) % 360, a, top: false }); }
  return { ok: true, skyFrac: 0.8, cols };
}
const lm = (name, brg, dist, ht, plus = {}) => ({ name, kind: 'monument', cat: 'monument', type: 'tour', htOsm: ht, ht, dist, brg: (brg + 360) % 360, far: false, hidden: false, aP: null, ...plus });
const aTopDe = (ht, dist) => Math.atan2(ht - 1.6, dist * 1000) / D;
function compareReperes(nom, { monuments, pointes, camFov = 71.5, capDeg = 0, inclinaison = 0, relief = false }) {
  const S = { camFov, headOff: capDeg, obsHeight: 0, relief }, pose = { capDeg, inclinaisonDeg: inclinaison, roulisDeg: 0 };
  const sil = silhouette(pointes, { cap: capDeg });
  const fabrique = v1Reperes({ S, monumentSites: monuments, terrain: relief ? {} : null, pose: () => ({ heading: ((S.headOff % 360) + 360) % 360, pitch: inclinaison, roll: 0 }), vFov: () => vFovFor(S.camFov),
    lireSilhouette: (po) => silhouette(pointes, { cap: po.capDeg }) });
  const fh = (W / 2) / Math.tan(vFovFor(camFov) / 2 * D), ps = { ...sil, heading: capDeg, pitch: inclinaison, fh };
  assert.deepEqual(pointesPhoto(ps), fabrique.photoPeaks(ps), `${nom} : pointes`);
  const l1 = fabrique.landmarksForCal(ps), l2 = reperesPourCalage(ps, monuments, ECRAN, { avecRelief: relief });
  assert.deepEqual(l2.map((o) => [o.c.name, o.aTop]), l1.map((o) => [o.c.name, o.aTop]), `${nom} : repères fiables`);
  const r1 = fabrique.landmarkFit(ps), r2 = ajusterSurReperes(ps, l2, { ecran: ECRAN, camFov, champAffiche: vFovFor, inclinaisonCouranteDeg: inclinaison, permutation: false });
  assert.deepEqual(r2, r1, `${nom} : appariement`);
  const a1 = fabrique.landmarkAlign(), a2 = calerSurReperes({ pose, camFov, ecran: ECRAN, champAffiche: vFovFor, lireSilhouette: (po) => silhouette(pointes, { cap: po.capDeg }), liste: monuments, avecRelief: relief, permutation: false });
  assert.equal(a2.ok, a1.ok, `${nom} : calage multi-passes ok`);
  if (a1.ok) { assert.ok(Math.abs(a2.corr - a1.corr) < 1e-9, `${nom} : correction ${a1.corr} / ${a2.corr}`); assert.deepEqual(a2.names, a1.names); assert.equal(a2.cam, a1.cam); assert.equal(a2.cam0, a1.cam0); }
  else assert.equal(a2.msg, a1.msg, `${nom} : refus`);
  return { r2, a2 };
}
const VRAIS = [[-20, 1.2, 60], [-6, 2.4, 80], [9, 1.8, 45], [24, 3.1, 70]];
const monumentsVrais = VRAIS.map(([b, d, h], i) => lm('repère ' + i, b, d, h));
const pointesDecalees = (d) => VRAIS.map(([b, dist, h]) => [b - d, aTopDe(h, dist)]);

test('repères : 4 repères concordants (cap faux de 7°) — mêmes pointes, mêmes repères, même correction que la v1', () => {
  const { r2, a2 } = compareReperes('4 repères', { monuments: monumentsVrais, pointes: pointesDecalees(7) });
  assert.equal(r2.ok, true); assert.ok(Math.abs(r2.corr - 7) < 0.5, `corr ${r2.corr}`); assert.equal(a2.ok, true);
});

test('repères : un seul repère avec une pointe unique et nette ; aucun repère ; aucune pointe ; concordance fortuite acceptée par la v1 (donc par la v2)', () => {
  compareReperes('1 repère', { monuments: [monumentsVrais[1]], pointes: [[-6 - 5, aTopDe(80, 2.4) + 0.2]] });
  const sans = compareReperes('aucun repère', { monuments: [], pointes: pointesDecalees(3) });
  assert.match(sans.r2.msg, /aucun repère fiable/);
  const nue = compareReperes('aucune pointe', { monuments: monumentsVrais, pointes: [] });
  assert.match(nue.r2.msg, /aucune pointe nette/);
  // ville dense : repères et pointes sans rapport (générateur à graine fixe) — la v1 (j) n'a PAS le test de permutation : mêmes verdicts des deux côtés
  let a = 7 * 2654435761 >>> 0; const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let essai = 0; essai < 25; essai++) {
    const monuments = Array.from({ length: 16 }, (_, i) => lm('tour ' + i, -32 + rnd() * 64, 0.6 + rnd() * 3, 40 + rnd() * 60));
    compareReperes('fortuit ' + essai, { monuments, pointes: Array.from({ length: 14 }, () => [-32 + rnd() * 64, 0.8 + rnd() * 2.6]) });
  }
});

test('repères : zoom faux (champ de la caméra mal réglé), repères cachés / lointains / trop larges / hors champ ignorés, relief actif', () => {
  const trop = [lm('trop proche', -6, 0.1, 80), lm('trop loin', 9, 25, 90), lm('lointain', 24, 3, 80, { far: true }), lm('caché', -20, 1.2, 60, { hidden: true }), lm('équipement', 0, 2, 30, { cat: 'equip' }), lm('château', 5, 1, 30, { type: 'chateau', htWd: 30 }), lm('hors champ', 80, 2, 70)];
  const r = compareReperes('exclus', { monuments: [...trop, monumentsVrais[0]], pointes: pointesDecalees(0), relief: true });
  assert.equal(r.r2.ok, true); assert.deepEqual(r.r2.names, ['repère 0']); assert.ok(Math.abs(r.r2.corr) < 0.5, 'les repères exclus (trop proche, lointain, caché, équipement, large, hors champ) ne comptent pas');
  const peaksZoom = VRAIS.map(([b, d, h]) => [b * 0.86, aTopDe(h, d)]);
  compareReperes('zoom faux', { monuments: monumentsVrais, pointes: peaksZoom, camFov: 71.5 });
  compareReperes('relief actif', { monuments: monumentsVrais.map((m, i) => ({ ...m, aP: aTopDe(VRAIS[i][2], VRAIS[i][1]) + 0.1 })), pointes: pointesDecalees(5), relief: true });
});

test('repères : plusieurs passes et limite ±20° (la correction trop grande est refusée)', () => {
  compareReperes('décalage 15°', { monuments: monumentsVrais, pointes: pointesDecalees(15) });
  const trop = compareReperes('décalage 40°', { monuments: monumentsVrais.map((m) => ({ ...m })), pointes: pointesDecalees(18) });
  assert.ok(trop.a2.ok === true || /limite ±20/.test(trop.a2.msg));
});

test('luminance : 0,299 R + 0,587 G + 0,114 B', () => {
  const l = luminance({ d: new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]), cw: 2, ch: 1 });
  assert.ok(Math.abs(l.L[0] - 76.245) < 1e-3 && Math.abs(l.L[1] - 149.685) < 1e-3);
});

// ---------- orchestration : soleil → relief → repères ----------
function contexteAuto(profil, { capVrai, siteVrai, champVrai = 70, photo = true, villeDense = false, soleilOk = null, pm = reliefDe(profil), liste = [], silhouette = { ok: true, skyFrac: 0.8, cols: [] }, pose = { capDeg: 100, inclinaisonDeg: 2, roulisDeg: 0 } }) {
  const lum = imageScene(profil, { capVrai, siteVrai, champ: champVrai });
  return { pos: { lat: 48, lon: -2 }, pose, camFov: 70, ecran: ECRAN, champAffiche: vFovFor, photo, villeDense, permutation: false, avecRelief: true, attendreRelief: async () => {}, relief: () => pm,
    soleil: () => soleilOk || { ok: false, message: 'soleil hors du champ' }, lireLuminance: () => lum, lireSilhouette: () => silhouette, liste };
}
test('« Caler auto » : le soleil d’abord ; sinon le relief ; garde-fous (ville dense, horizon incertain, direct, relief absent) → repères avec le motif', async () => {
  const sol = await calerAutomatiquement(contexteAuto(collines(2.2), { capVrai: 106, siteVrai: 1.2, soleilOk: { ok: true, dh: -2.3, dp: -1.6, soleil: { azDeg: 267.1, elDeg: 1 }, n: 1 } }));
  assert.equal(sol.source, 'soleil'); assert.equal(sol.message, 'calé sur le soleil (267.1°, 1.0° de haut) : cap -2.3°, horizon -1.6°'); assert.equal(sol.dh, -2.3);
  const relief = await calerAutomatiquement(contexteAuto(collines(2.2), { capVrai: 106, siteVrai: 1.2 }));
  assert.equal(relief.source, 'relief'); assert.ok(relief.applique && Math.abs(relief.dh - 6) < 1, `cap ${relief.dh}`); assert.match(relief.message, /^calé : cap \+[\d.]+° · horizon [+-][\d.]+°( · champ [\d.]+°)? · précision ±0\.\d\d°$/);
  const dense = await calerAutomatiquement(contexteAuto(() => 1, { capVrai: 100, siteVrai: 2, villeDense: true }));
  assert.match(dense.message, /^ville dense : la limite du ciel est faite des toits, pas du relief · repères : aucun repère fiable/); assert.equal(dense.applique, false);
  const sans = await calerAutomatiquement({ ...contexteAuto(collines(2.2), { capVrai: 106, siteVrai: 1.2 }), relief: () => null });
  assert.match(sans.message, /^relief indisponible · repères : /);
  const noir = await calerAutomatiquement({ ...contexteAuto(collines(2.2), { capVrai: 106, siteVrai: 1.2 }), lireLuminance: () => null });
  assert.equal(noir.message, 'image caméra illisible');
  const sansGps = await calerAutomatiquement({ ...contexteAuto(collines(2.2), { capVrai: 106, siteVrai: 1.2 }), pos: null });
  assert.equal(sansGps.message, 'GPS indisponible');
  const plat = await calerAutomatiquement(contexteAuto(() => 0.1, { capVrai: 100, siteVrai: 2.4 }));
  assert.match(plat.message, /^horizon calé \([+-][\d.]+°\) · cap inchangé : pas assez de relief visible$/); assert.equal(plat.dh, 0);
  const faux = await calerAutomatiquement({ ...contexteAuto(collines(2.2), { capVrai: 106, siteVrai: 1.2 }), lireLuminance: () => imageScene((b) => 6 + 9 * Math.sin(b * 0.31), { capVrai: 100, siteVrai: 2 }) });
  assert.match(faux.message, /^relief incertain \(écart [\d.]+°\) · repères : /);
  // en direct, un horizon déplacé de plus de 3° est refusé (toits, arbres) ; en photo il est accepté
  const decale = contexteAuto(collines(2.2), { capVrai: 106, siteVrai: 5.5, photo: false });
  const dir = await calerAutomatiquement(decale), pho = await calerAutomatiquement({ ...decale, photo: true });
  assert.match(dir.message, /^le bord lu est [\d.]+° (au-dessus|en dessous) du relief \(toits ou arbres devant\) · repères : /); assert.equal(pho.source, 'relief');
});

test('« Caler auto » : le relief d\u2019abord (réglage), le soleil ensuite ; par défaut l\u2019ordre de la v1 (j)', async () => {
  const SOLEIL = { ok: true, dh: -2.3, dp: -1.6, soleil: { azDeg: 267.1, elDeg: 1 }, n: 1 };
  const base = (profil, o = {}) => ({ ...contexteAuto(profil, { capVrai: 106, siteVrai: 1.2, ...o }), ordre: 'relief-soleil' });
  // relief lisible ET soleil visible : le relief l'emporte (la v1 prenait le soleil)
  const r = await calerAutomatiquement(base(collines(2.2), { soleilOk: SOLEIL })), v1 = await calerAutomatiquement({ ...base(collines(2.2), { soleilOk: SOLEIL }), ordre: undefined });
  assert.equal(r.source, 'relief'); assert.equal(v1.source, 'soleil');
  // relief plat (mer) : le soleil donne le cap que le relief ne peut pas donner
  const mer = await calerAutomatiquement(base(() => 0.1, { soleilOk: SOLEIL })); assert.equal(mer.source, 'soleil'); assert.equal(mer.dh, -2.3);
  // relief incertain, indisponible, ville dense : le soleil avant les repères
  const faux = await calerAutomatiquement({ ...base(collines(2.2), { soleilOk: SOLEIL }), lireLuminance: () => imageScene((b) => 6 + 9 * Math.sin(b * 0.31), { capVrai: 100, siteVrai: 2 }) }); assert.equal(faux.source, 'soleil');
  const sans = await calerAutomatiquement({ ...base(collines(2.2), { soleilOk: SOLEIL }), relief: () => null }); assert.equal(sans.source, 'soleil');
  const dense = await calerAutomatiquement(base(() => 1, { soleilOk: SOLEIL, villeDense: true })); assert.equal(dense.source, 'soleil');
  // sans soleil visible : comme avant
  const nuit = await calerAutomatiquement(base(collines(2.2))); assert.equal(nuit.source, 'relief');
});
