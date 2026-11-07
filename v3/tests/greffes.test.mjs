// Tests rapides (node:test, CI à chaque PR) des fonctions pures des greffes de la v3 (v3/greffes/*.js). Les greffes dans la page : v3/tests/greffes.spec.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import permutation from '../greffes/permutation.js';
import { resoudre } from '../greffes/echelle2.js';
import { evaluer as evaluerRotation, etatInitial } from '../greffes/rotation.js';
import { lire as lireWikidata, requete as requeteWikidata } from '../greffes/lieuxWikidata.js';
import { proposer, ondulationGeoide } from '../greffes/oeil.js';
import { evaluer as evaluerBoussole, mesureRelative } from '../greffes/boussoleA.js';
import { positionLune, detecterTaches, candidats, meilleur } from '../greffes/_astre.js';
import { LIBELLES } from '../greffes/icones.js';

const D = Math.PI / 180;
const V1 = readFileSync(new URL('../../v1/villes-horizon.html', import.meta.url), 'utf8');
/** Extrait une fonction de la v1 par son nom (texte exact de la v1). */
const fonctionV1 = (nom) => { const i = V1.indexOf(`function ${nom}(`); let k = V1.indexOf('{', V1.indexOf(')', i)), n = 0; for (let j = k; ; j++) { if (V1[j] === '{') n++; else if (V1[j] === '}' && --n === 0) return V1.slice(i, j + 1); } };

test('registre : 9 greffes, toutes éteintes par défaut, chacune avec son fichier', () => {
  const reg = readFileSync(new URL('../greffes.js', import.meta.url), 'utf8');
  const ids = [...reg.matchAll(/\{id:'(\w+)'/g)].map((m) => m[1]);
  assert.deepEqual(ids, ['soleil2', 'lune', 'permutation', 'echelle2', 'oeil', 'icones', 'rotation', 'lieuxWikidata', 'boussoleA']);
  for (const id of ids) assert.ok(readFileSync(new URL(`../greffes/${id}.js`, import.meta.url), 'utf8').includes('export default'), id);
  assert.match(reg, /allumees=IDS\.filter\(id=>m&&m\[id\]===true\)/, 'sans mémoire, aucune greffe allumée');
  for (const f of ids) for (const m of readFileSync(new URL(`../greffes/${f}.js`, import.meta.url), 'utf8').matchAll(/(?:from|import\()\s*['"]([^'"]+)['"]/g)) assert.match(m[1], /^\.\/[\w-]+\.js$/, `${f} n'importe que des fichiers de v3/greffes/ (rien de la v2) : ${m[1]}`);
});

// ---- permutation : comparée au vrai `landmarkFit` de la v1 (extrait du fichier) sur des scènes synthétiques ----
const W = 915, CAM = 71.5;
const vFovFor = (cam) => 2 * Math.atan(Math.tan(cam / 2 * D) * 0.93) / D;
const wrap = (a) => ((a + 540) % 360) - 180;
const alea = (graine) => { let a = (graine * 2654435761) >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
function scene(lm, pointes) {
  const fh = (W / 2) / Math.tan(vFovFor(CAM) / 2 * D), cols = [];
  for (let dd = -34; dd <= 34; dd += 0.25) { let a = 0; for (const [pd, pa] of pointes) a = Math.max(a, pa * Math.max(0, 1 - Math.abs(dd - pd) / 0.5)); cols.push({ brg: (dd + 360) % 360, a }); }
  const lms = lm.map(([brg, dist, ht], i) => ({ c: { name: 'repère ' + i, kind: 'monument', type: 'tour', htOsm: ht, ht, dist, brg: (brg + 360) % 360 }, aTop: Math.atan2(ht - 1.6, dist * 1000) / D }));
  return { ps: { cols, heading: 0, pitch: 0, fh }, lms };
}
function contexte(lms) {
  const S = { camFov: CAM }, AC_PROM = 0.8, AC_WIN = 8, AC_VTOL = 1.5, AC_AGREE = 0.4, pose = () => ({ pitch: 0 }), landmarksForCal = () => lms;
  const photoPeaks = new Function('wrap', 'AC_PROM', `return ${fonctionV1('photoPeaks')}`)(wrap, AC_PROM);
  const landmarkFitV1 = new Function('photoPeaks', 'landmarksForCal', 'wrap', 'AC_WIN', 'AC_VTOL', 'AC_AGREE', 'pose', 'S', 'W', 'vFovFor', 'D', `return ${fonctionV1('landmarkFit').replace(/^  if\(G\.actif.*\n/m, '')}`)(photoPeaks, landmarksForCal, wrap, AC_WIN, AC_VTOL, AC_AGREE, pose, S, W, vFovFor, D);
  return { v1: landmarkFitV1, ctx: { S, W, AC: { WIN: AC_WIN, VTOL: AC_VTOL, AGREE: AC_AGREE }, photoPeaks, landmarksForCal, pose, vFovFor } };
}
const essai = ({ ps, lms }) => { const { v1, ctx } = contexte(lms); permutation.init(ctx); return { v1: v1(ps), g: permutation.ajuster(ps) }; };

test('permutation : ville dense au hasard — la v1 accepte la plupart des scènes, la greffe presque aucune, le champ ne bouge jamais', () => {
  let v1 = 0, g = 0, champ = 0, n = 0;
  for (const [nl, np] of [[16, 14], [30, 20]]) for (let k = 1; k <= 60; k++) {
    const r = alea(k), sc = scene(Array.from({ length: nl }, () => [-32 + r() * 64, 0.6 + r() * 3, 40 + r() * 60]), Array.from({ length: np }, () => [-32 + r() * 64, 0.8 + r() * 2.6]));
    const e = essai(sc); n++; if (e.v1.ok) v1++; if (e.g.ok) { g++; if (e.g.cam !== CAM) champ++; }
  }
  console.log(`permutation : scènes au hasard acceptées v1 ${v1}/${n}, greffe ${g}/${n}`);
  assert.ok(v1 >= n * 0.5, `la v1 n'en acceptait que ${v1}/${n} : le test ne prouve rien`); assert.ok(g <= n * 0.1, `${g}/${n} acceptées à tort`); assert.equal(champ, 0);
});
test('permutation : de vrais repères concordants sont acceptés (+7°), comme par la v1', () => {
  const VRAIS = [[-20, 1.2, 60], [-6, 2.4, 80], [9, 1.8, 45], [24, 3.1, 70]], pointes = VRAIS.map(([b, d, h]) => [b - 7, Math.atan2(h - 1.6, d * 1000) / D]);
  for (const n of [4, 3, 2]) { const e = essai(scene(VRAIS.slice(0, n), pointes.slice(0, n))); assert.equal(e.g.ok, true, JSON.stringify(e.g)); assert.ok(Math.abs(e.g.corr - 7) < 0.5); assert.equal(e.v1.ok, true); }
});

// ---- échelle sur 2 points ----
test('echelle2 : la focale et le cap sont retrouvés, même si le téléphone a tourné entre les deux touchers', () => {
  for (const [fov, cap, b1, b2, rot] of [[60, 210, 190, 232, 0], [48, 40, 25, 52, 9], [70, 355, 335, 12, -14]]) {
    const f = (W / 2) / Math.tan(fov / 2 * D), off = 3.5, raw1 = cap - off, raw2 = raw1 + rot;
    const pt = (b, raw) => ({ x: f * Math.tan(wrap(b - (raw + off)) * D), b, raw });
    const r = resoudre(pt(b1, raw1), pt(b2, raw2), W);
    assert.equal(r.ok, true, JSON.stringify(r)); assert.ok(Math.abs(2 * Math.atan(W / 2 / r.f) / D - fov) < 0.05); assert.ok(Math.abs(wrap(r.off - off)) < 0.05, `cap ${r.off}`);
  }
  assert.equal(resoudre({ x: -100, b: 200, raw: 0 }, { x: 100, b: 205, raw: 0 }, W).ok, false);
});

// ---- rotation ----
test('rotation : message après 1,5 s de roulis > 50° écran en portrait, maintenu au-dessus de 35°, retiré après 2 s, pause de 5 min', () => {
  let e = etatInitial(); const pas = (roulis, t, typeEcran = 'portrait-primary', direct = true) => { const r = evaluerRotation(e, { direct, roulis, typeEcran, t }); e = r.etat; return r.avertir; };
  assert.equal(pas(-70, 0), false); assert.equal(pas(-70, 1000), false); assert.equal(pas(-70, 1600), true); assert.equal(pas(-40, 2000), true);
  assert.equal(pas(-10, 2500), true); assert.equal(pas(-10, 4600), false); assert.equal(pas(-70, 5000), false); assert.equal(pas(-70, 7000), false);
  e = etatInitial(); assert.equal(pas(-70, 0, 'landscape-primary'), false); assert.equal(pas(-70, 3000, 'landscape-primary'), false);
  e = etatInitial(); pas(-70, 0, 'portrait-primary', false); assert.equal(pas(-70, 3000, 'portrait-primary', false), false);
});

// ---- lieux Wikidata ----
test('lieuxWikidata : requête « around » et lecture (un lieu par entité, le plus peuplé ; hameaux selon le réglage ; sans « Q123 »)', () => {
  assert.match(requeteWikidata({ lat: 48.1, lon: -1.6 }, 300), /Point\(-1\.60000 48\.10000\).*radius "120"/);
  const b = (id, nom, lon, lat, cls, pop) => ({ item: { value: 'http://www.wikidata.org/entity/' + id }, itemLabel: { value: nom }, coord: { value: `Point(${lon} ${lat})` }, classe: { value: 'http://www.wikidata.org/entity/' + cls }, ...(pop ? { pop: { value: String(pop) } } : {}) });
  const j = { results: { bindings: [b('Q647', 'Rennes', -1.68, 48.11, 'Q515', 220000), b('Q647', 'Rennes', -1.68, 48.11, 'Q484170', 210000), b('Q1', 'Q1', 0, 0, 'Q515'), b('Q9', 'Le Hameau', -1.5, 48.2, 'Q5084')] } };
  assert.deepEqual(lireWikidata(j, false), [{ name: 'Rennes', lat: 48.11, lon: -1.68, kind: 'city', pop: 220000 }]);
  assert.equal(lireWikidata(j, true).length, 2);
});

// ---- puce œil ----
test('oeil : le GPS propose seulement avec 10 mesures sur 20 s, précision ≤ 10 m et écart au sol ≥ 10 m ; géoïde EGM96 (Bretagne ≈ 49 m)', () => {
  const m = (n, alt, prec, pasMs = 2500) => Array.from({ length: n }, (_, i) => ({ t: i * pasMs, alt, prec }));
  assert.equal(proposer(m(12, 40, 5), 10).proposee, true); assert.equal(proposer(m(12, 40, 5), 10).correction, 28);
  assert.match(proposer(m(5, 40, 5), 10).raison, /pas assez/); assert.match(proposer(m(12, 40, 5, 500), 10).raison, /trop court/);
  assert.match(proposer(m(12, 40, 25), 10).raison, /précision/); assert.match(proposer(m(12, 15, 5), 10).raison, /écart au sol/);
  assert.ok(Math.abs(ondulationGeoide(48.65, -2.0) - 49) < 2.5, String(ondulationGeoide(48.65, -2.0)));
});

// ---- boussole A ----
test('boussoleA : un désaccord sans saut = boussole perturbée (le calage tient) ; un vrai saut du gyroscope = retour à la boussole', () => {
  assert.equal(evaluerBoussole(10, 10, 0), null);
  assert.equal(evaluerBoussole(70, 10, 1000), 'perturbee'); assert.equal(evaluerBoussole(70, 10, 5000), 'perturbee'); // la v1 aurait défait le calage au bout de 2 s
  assert.equal(evaluerBoussole(11, 10, 6000), 'perturbee'); assert.equal(evaluerBoussole(11, 10, 8100), null); // de nouveau fiable après 2 s d'accord
  mesureRelative({ alpha: 10, beta: 90, gamma: 0 }, 10000); mesureRelative({ alpha: 80, beta: 90, gamma: 0 }, 10100); // +70° en 0,1 s : saut du repère
  assert.equal(evaluerBoussole(70, 10, 10200), 'saut');
});

// ---- lune et disque ----
test('lune : position à moins de 0,6° de l’éphéméride (PyEphem, mêmes références que la v2)', () => {
  const REF = [[1790530500000, 38.99113, 1.5748, 73.616, -4.239], [1792706400000, 45.0805, 7.6705, 206.913, 37.532], [1793325600000, 48.8566, 2.3522, 138.104, 63.743], [1787594040000, 48.2318, -4.5189, 129.836, 0.217]];
  for (const [t, lat, lon, az, el] of REF) { const p = positionLune(t, lat, lon); assert.ok(Math.abs(wrap(p.az - az)) * Math.cos(el * D) < 0.6 && Math.abs(p.el - el) < 0.6, `${p.az} ${p.el}`); }
});
test('disque : une tache blanche ronde est trouvée là où elle est, roulis compensé ; son reflet en dessous est écarté', () => {
  const cw = 120, ch = 60, d = new Uint8ClampedArray(cw * ch * 4);
  const tache = (cx, cy, r) => { for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) { const i = (y * cw + x) * 4; d[i] = d[i + 1] = d[i + 2] = 255; } };
  tache(90, 15, 3); tache(90, 45, 2);
  const Wp = 915, Hp = Wp * ch / cw, fh = (Wp / 2) / Math.tan(30 * D), pose = { heading: 100, pitch: 0, roll: 0 };
  const c = candidats(detecterTaches({ d, cw, ch }), { cw, W: Wp, H: Hp, fh, pose, astre: { az: 110, el: 10 }, large: false }), b = meilleur(c, false);
  const azAttendu = 100 + Math.atan((90.5 * Wp / cw - Wp / 2) / fh) / D;
  assert.equal(c.length, 1, 'le reflet est écarté'); assert.ok(Math.abs(b.az - azAttendu) < 0.3, `${b.az} / ${azAttendu}`);
});
test('icones : un libellé pour chacun des 6 boutons de la colonne de la v1', () => {
  for (const id of Object.keys(LIBELLES)) assert.ok(V1.includes(`<button id="${id}"`), id);
});
