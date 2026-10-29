// @ts-nocheck — code de la v1 extrait par `new Function` : le typage n'apporte rien ici.
// Calage sur le soleil (détection du disque, reflets, refus) et pointage au doigt : identiques à la v1 sur des images et des listes synthétiques.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calerSurSoleil } from '../../src/calage/soleil.js';
import { pointer } from '../../src/calage/pointage.js';

const src = readFileSync(new URL('../../v1/villes-horizon.html', import.meta.url), 'utf8');
const tranche = (debut, fin) => { const i = src.indexOf(debut), j = src.indexOf(fin, i); assert.ok(i >= 0 && j > i, `introuvable : ${debut}`); return src.slice(i, j + fin.length); };
const D = Math.PI / 180, wrap = (a) => ((a + 540) % 360) - 180;

// ---------- calage sur le soleil ----------
const codeSoleil = tranche('function sunAlign(){', 'n:cands.length}; }');
const v1Soleil = new Function('pos', 'sunNow', 'pose', 'vFov', 'W', 'H', 'D', 'wrap', 'photoMode', 'SUN_WIN', 'grabFrameRGB', `${codeSoleil}; return sunAlign();`);

const W = 800, H = 400, CW = 480, CH = Math.max(60, Math.round(CW * H / W));
/** Image synthétique : fond de ciel, puis `peindre(x, y)` renvoie une couleur ou null. */
function image(peindre) {
  const d = new Uint8ClampedArray(CW * CH * 4);
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) { const c = peindre(x, y) || [120, 160, 220], i = (y * CW + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; }
  return { d, cw: CW, ch: CH };
}
const disque = (cx, cy, rayon, couleur = [255, 255, 255]) => (x, y) => (Math.hypot(x - cx, y - cy) <= rayon ? couleur : null);
const empiler = (...fs) => (x, y) => { for (const f of fs) { const c = f(x, y); if (c) return c; } return null; };
/** Position écran (px d'écran) d'un point de la scène. */
function versEcran(cap, site, pose, champ) {
  const fh = (W / 2) / Math.tan(champ / 2 * D), dB = wrap(cap - pose.capDeg), x = W / 2 + fh * Math.tan(dB * D), y = H / 2 - fh * Math.tan((site - pose.inclinaisonDeg) * D);
  return { x, y };
}
const POS = { lat: 38.99, lon: 1.57 };
function compareSoleil(nom, { pixels, soleil, pose, champ = 70, large = false }) {
  const sortieV1 = v1Soleil(POS, () => (soleil ? { az: soleil.azDeg, el: soleil.elDeg } : null), () => ({ heading: pose.capDeg, pitch: pose.inclinaisonDeg, roll: pose.roulisDeg }), () => champ, W, H, D, wrap,
    large ? { dirWeak: true } : null, 25, () => pixels);
  const sortieV2 = calerSurSoleil({ pos: POS, soleil, pose, champDeg: champ, ecran: { largeurPx: W, hauteurPx: H }, large, lirePixels: () => pixels });
  assert.equal(sortieV2.ok, sortieV1.ok, `${nom} : ok`);
  if (sortieV1.ok) {
    assert.ok(Math.abs(sortieV1.dh - sortieV2.dh) < 1e-9, `${nom} : dh ${sortieV1.dh} / ${sortieV2.dh}`); assert.ok(Math.abs(sortieV1.dp - sortieV2.dp) < 1e-9, `${nom} : dp`);
    assert.equal(sortieV2.n, sortieV1.n, `${nom} : nombre de candidats`);
  } else assert.equal(sortieV2.message, sortieV1.msg, `${nom} : message de refus`);
  return sortieV2;
}
const pose0 = { capDeg: 200, inclinaisonDeg: 3, roulisDeg: 0 }, soleil0 = { azDeg: 203, elDeg: 5 };
/** Où le disque apparaît si le cap était faux de `ecart`° : le soleil réel est à `soleil0`, la pose affichée est décalée. */
const posDisque = (pose = pose0, soleil = soleil0, decalageCap = 0) => { const p = versEcran(soleil.azDeg + decalageCap, soleil.elDeg, pose, 70); return { cx: p.x * CW / W, cy: p.y * CW / W }; };

test('soleil : disque net — mêmes corrections que la v1, cap décalé retrouvé', () => {
  const { cx, cy } = posDisque(pose0, soleil0, -4);
  const r = compareSoleil('net', { pixels: image(disque(cx, cy, 5)), soleil: soleil0, pose: pose0 });
  assert.equal(r.ok, true); assert.ok(Math.abs(r.dh - 4) < 0.6, `dh ${r.dh}`);
});

test('soleil : halo orange autour du disque, reflet en dessous, deux taches', () => {
  const { cx, cy } = posDisque(pose0, soleil0, -2);
  compareSoleil('halo', { pixels: image(empiler(disque(cx, cy, 5), disque(cx, cy, 16, [255, 190, 110]))), soleil: soleil0, pose: pose0 });
  compareSoleil('reflet', { pixels: image(empiler(disque(cx, cy, 5), disque(cx + 1, cy + 60, 5))), soleil: soleil0, pose: pose0 });
  compareSoleil('reflet seul au-dessus', { pixels: image(empiler(disque(cx, cy, 5), disque(cx + 2, cy - 50, 5))), soleil: soleil0, pose: pose0 });
  const p2 = posDisque(pose0, soleil0, 12);
  compareSoleil('deux taches', { pixels: image(empiler(disque(cx, cy, 5), disque(p2.cx, p2.cy, 6))), soleil: soleil0, pose: pose0 });
});

test('soleil : refus — nuage, ciel vide, tache non compacte, couché, hors champ, image illisible, position/heure inconnues', () => {
  const { cx, cy } = posDisque();
  const nuage = (x, y) => (y > 20 && y < 80 && x > 100 && x < 420 ? [255, 255, 255] : null);
  const barre = (x, y) => (Math.abs(y - cy) < 2 && Math.abs(x - cx) < 40 ? [255, 255, 255] : null);
  assert.match(compareSoleil('nuage', { pixels: image(nuage), soleil: soleil0, pose: pose0 }).message, /pas de disque solaire net \(halo/);
  assert.match(compareSoleil('vide', { pixels: image(() => null), soleil: soleil0, pose: pose0 }).message, /voilé, nuages/);
  compareSoleil('barre', { pixels: image(barre), soleil: soleil0, pose: pose0 });
  assert.equal(compareSoleil('couché', { pixels: image(disque(cx, cy, 5)), soleil: { azDeg: 203, elDeg: -3 }, pose: pose0 }).message, 'soleil couché');
  assert.equal(compareSoleil('hors champ', { pixels: image(disque(cx, cy, 5)), soleil: { azDeg: 330, elDeg: 5 }, pose: pose0 }).message, 'soleil hors du champ');
  assert.equal(compareSoleil('illisible', { pixels: null, soleil: soleil0, pose: pose0 }).message, 'image illisible');
  assert.equal(compareSoleil('sans heure', { pixels: image(disque(cx, cy, 5)), soleil: null, pose: pose0 }).message, 'heure de la photo inconnue');
  assert.equal(calerSurSoleil({ pos: null, soleil: soleil0, pose: pose0, champDeg: 70, ecran: { largeurPx: W, hauteurPx: H }, lirePixels: () => null }).message, 'position inconnue');
});

test('soleil : roulis compensé, mode « large » (direction peu fiable : portrait)', () => {
  const pose = { capDeg: 200, inclinaisonDeg: 3, roulisDeg: 12 }, { cx, cy } = posDisque(pose0, soleil0, -3);
  compareSoleil('roulis', { pixels: image(disque(cx + 15, cy - 8, 5)), soleil: soleil0, pose });
  const loin = posDisque(pose0, { azDeg: 203, elDeg: 5 }, -40);
  compareSoleil('large, soleil loin du cap', { pixels: image(disque(loin.cx, loin.cy, 5)), soleil: soleil0, pose: pose0, large: true });
  compareSoleil('non large, même image', { pixels: image(disque(loin.cx, loin.cy, 5)), soleil: soleil0, pose: pose0, large: false });
});

test('soleil : lirePixels n’est appelé qu’une fois les gardes passées', () => {
  let appels = 0;
  calerSurSoleil({ pos: POS, soleil: { azDeg: 203, elDeg: -3 }, pose: pose0, champDeg: 70, ecran: { largeurPx: W, hauteurPx: H }, lirePixels: () => { appels++; return null; } });
  assert.equal(appels, 0);
});

// ---------- pointage ----------
const codePointage = tranche('function pointCalibrate(px,py){', '  return best;\n}');
function v1Pointage({ toucher, pose, champ, liste, soleil, relief, oeil }) {
  const S = { headOff: 10, pitchOff: 1, obsHeight: oeil, relief }, notes = [];
  const fabrique = new Function('S', 'terrain', 'pose', 'vFov', 'W', 'H', 'D', 'wrap', 'sunNow', 'visibleCities', 'monName', 'note', 'saveSettings', 'noteCalib', 'calRecord', `let citiesVer=0; ${codePointage}; return pointCalibrate;`);
  const f = fabrique(S, relief ? {} : null, () => ({ heading: pose.capDeg, pitch: pose.inclinaisonDeg, roll: pose.roulisDeg }), () => champ, W, H, D, wrap, () => (soleil ? { az: soleil.azDeg, el: soleil.elDeg } : null), () => liste, (c) => c.name,
      (t) => notes.push(t), () => {}, () => {}, () => {});
  const r = f(toucher.x, toucher.y);
  return { r, dCap: S.headOff - 10, dHor: S.pitchOff - 1, notes };
}
function comparePointage(nom, e) {
  const a = v1Pointage({ ...e, oeil: e.oeil ?? 0 }), b = pointer({ ...e, ecran: { largeurPx: W, hauteurPx: H }, champDeg: e.champ, avecRelief: e.relief, correctionOeilM: e.oeil ?? 0, nomMonument: (c) => c.name });
  if (a.r === null) { assert.equal(b.aucun, true, `${nom} : rien`); assert.equal(b.note, a.notes[0], `${nom} : note`); return b; }
  assert.equal(b.aucun, false, `${nom} : trouvé`);
  assert.ok(Math.abs(b.correctionCapDeg - a.dCap) < 1e-9, `${nom} : cap ${b.correctionCapDeg} / ${a.dCap}`);
  assert.ok(Math.abs((b.correctionHorizonDeg ?? 0) - a.dHor) < 1e-9, `${nom} : horizon`);
  assert.equal(b.note, a.notes[0], `${nom} : note`);
  return b;
}
const poseP = { capDeg: 100, inclinaisonDeg: 2, roulisDeg: 0 };
const el = (name, kind, brg, dist, plus = {}) => ({ name, kind, brg, dist, far: false, hidden: false, ...plus });
const LISTE = [el('Cathédrale', 'monument', 103, 3, { cat: 'monument', ht: 60, htWd: 60, aP: 1.1 }), el('Ancienne tour', 'monument', 98, 1.2, { cat: 'monument', ht: 20 }), el('Petit Bé', 'town', 101, 5),
  el('Gare', 'monument', 100, 2, { cat: 'equip', ht: 10 }), el('Loin', 'city', 100.5, 40, { far: true }), el('Caché', 'monument', 100.2, 4, { cat: 'monument', ht: 30, htOsm: 30, hidden: true }), el('Trop proche', 'monument', 100.1, 0.1, { cat: 'monument', htWd: 15, ht: 15 })];
const centre = { x: W / 2, y: H / 2 };

test('pointage : monument à hauteur connue, sans hauteur, lieu, équipement, rien — mêmes corrections et mêmes textes que la v1', () => {
  const dec = (d) => { const fh = (W / 2) / Math.tan(35 * D); return { x: W / 2 + fh * Math.tan(d * D), y: H / 2 }; };
  for (const relief of [false, true]) {
    for (const [nom, t] of [['sur la cathédrale', dec(2.8)], ['près de l’ancienne tour', dec(-2.2)], ['près du lieu', dec(1.3)], ['près de la gare', dec(0.1)], ['au centre', centre], ['dans le vide', dec(30)]]) {
      comparePointage(`${nom} (relief ${relief})`, { toucher: t, pose: poseP, champ: 70, liste: LISTE, soleil: null, relief });
    }
  }
  const b = comparePointage('hauteur connue', { toucher: { x: W / 2 + 60, y: H / 2 - 5 }, pose: poseP, champ: 70, liste: LISTE, soleil: null, relief: false });
  assert.ok(b.aucun === false);
});

test('pointage : le soleil l’emporte à écart égal ; hauteur implicite d’un monument sans hauteur ; œil corrigé ; roulis', () => {
  const fh = (W / 2) / Math.tan(35 * D), x = W / 2 + fh * Math.tan(3 * D);
  const r = comparePointage('soleil', { toucher: { x, y: H / 2 - 10 }, pose: poseP, champ: 70, liste: LISTE, soleil: { azDeg: 103, elDeg: 4 }, relief: false });
  assert.equal(r.source, 'soleil');
  comparePointage('soleil couché ignoré', { toucher: { x, y: H / 2 }, pose: poseP, champ: 70, liste: LISTE, soleil: { azDeg: 103, elDeg: -4 }, relief: false });
  comparePointage('œil +22 m', { toucher: { x: W / 2 - 40, y: H / 2 + 10 }, pose: poseP, champ: 70, liste: LISTE, soleil: null, relief: true, oeil: 22 });
  comparePointage('roulis', { toucher: { x: W / 2 + 80, y: H / 2 + 30 }, pose: { ...poseP, roulisDeg: 15 }, champ: 70, liste: LISTE, soleil: null, relief: false });
});
