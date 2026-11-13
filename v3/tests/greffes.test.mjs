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
import { creerSuivi, axes as axesChamp, GRAND_COTE, textePuce, instantImage } from '../greffes/champAuto.js';
import { choisir as choisirNettete } from '../greffes/nettete.js';
import { exact as projExacte, inverse as projInverse } from '../greffes/projection.js';
import { associer as associerHauteur, statue as statueHauteur } from '../greffes/hauteurs.js';
import { viser, lireNoms, requete as requeteNoms, nature, rayonKm, ficheHtml } from '../greffes/nommer.js';

const D = Math.PI / 180;
const V1 = readFileSync(new URL('../../v1/villes-horizon.html', import.meta.url), 'utf8');
/** Extrait une fonction de la v1 par son nom (texte exact de la v1). */
const fonctionV1 = (nom) => { const i = V1.indexOf(`function ${nom}(`); let k = V1.indexOf('{', V1.indexOf(')', i)), n = 0; for (let j = k; ; j++) { if (V1[j] === '{') n++; else if (V1[j] === '}' && --n === 0) return V1.slice(i, j + 1); } };

test('registre : 20 greffes, toutes éteintes par défaut, chacune avec son fichier', () => {
  const reg = readFileSync(new URL('../greffes.js', import.meta.url), 'utf8');
  const ids = [...reg.matchAll(/\{id:'(\w+)'/g)].map((m) => m[1]);
  assert.deepEqual(ids, ['soleil2', 'lune', 'permutation', 'echelle2', 'oeil', 'icones', 'rotation', 'lieuxWikidata', 'boussoleA', 'tailleReelle', 'plaque', 'capteurRelatif', 'recalageContinu', 'montagne', 'champAuto', 'nettete', 'projection', 'degage', 'hauteurs', 'nommer']);
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

// ---------- plaque, capteurRelatif, recalageContinu ----------
import { lireTexteAdresse, choisirAdresse, positionDepuisAdresse, lireReponseBAN, motsCles, detecterPas, etatPasInitial, surGps, avancer, distanceM, TROTTOIR_M } from '../greffes/plaque.js';
import { axesDepuisQuaternion, quaternionDepuisAngles } from '../greffes/capteurRelatif.js';
import { decisionCalageContinu } from '../greffes/recalageContinu.js';
const PP = { lat: 48.8566, lon: 2.3522 }, kLon = 111320 * Math.cos(PP.lat * Math.PI / 180), pt = (N, E) => ({ lat: PP.lat + N / 111320, lon: PP.lon + E / kLon });

test('plaque : lecture du texte (bruit d’OCR toléré), mots clés, choix du résultat', () => {
  assert.deepEqual(lireTexteAdresse('12 RUE DE SEINE'), { numero: '12', rue: 'rue de seine', requete: '12 rue de seine' });
  assert.equal(lireTexteAdresse('RUE DE SEINE\n75006 PARIS').numero, '');
  assert.equal(lireTexteAdresse('L2 rue de Seine').numero, '12');
  assert.equal(lireTexteAdresse('14 bis, Avenue des Champs-Élysées').requete, '14 bis avenue des champs-elysees');
  assert.equal(lireTexteAdresse('Bd. Saint-Germain').rue, 'boulevard saint-germain');
  assert.equal(lireTexteAdresse('|||  ~~ 3 ~~'), null); assert.equal(lireTexteAdresse('RUE'), null);
  assert.deepEqual(motsCles('Avenue des Champs-Élysées'), ['champs', 'elysees']);
  const adr = (type, numero, point) => ({ type, libelle: `${numero} Rue de Rivoli`, point, numero, rue: 'Rue de Rivoli', distM: 0 });
  const l = [adr('rue', '', pt(0, 0)), adr('numero', '12', pt(10, 5)), adr('numero', '14', pt(10, 25))];
  assert.equal(choisirAdresse(l, { numero: '14', rue: 'rue de rivoli' }).numero, '14');
  assert.equal(choisirAdresse(l, { numero: '99', rue: 'rue de rivoli' }).type, 'rue');
});

test('plaque : numéro → trottoir (4 m de l’axe, du bon côté) ; rue seule → projection sur la rue ; Base Adresse filtrée à 300 m', () => {
  const rivoli = { nom: 'Rue de Rivoli', points: [pt(0, -200), pt(0, 200)] }, adr = (type, numero, point) => ({ type, libelle: 'x', point, numero, rue: 'Rue de Rivoli', distM: 0 });
  const a = positionDepuisAdresse({ adresse: adr('numero', '12', pt(12, 60)), rues: [rivoli], pos: PP });
  assert.ok(Math.abs((a.pos.lat - PP.lat) * 111320 - TROTTOIR_M) < 0.05); assert.ok(Math.abs((a.pos.lon - PP.lon) * kLon - 60) < 0.05);
  assert.ok(distanceM(positionDepuisAdresse({ adresse: adr('numero', '9', pt(30, 40)), rues: [], pos: PP }).pos, pt(30, 40)) < 0.01, 'sans géométrie : le point d’adresse');
  const r = positionDepuisAdresse({ adresse: adr('rue', '', pt(0, 0)), rues: [rivoli], pos: pt(15, 37) });
  assert.ok(distanceM(r.pos, pt(0, 37)) < 0.05); assert.ok(Math.abs(r.ecartM - 15) < 0.05);
  assert.match(positionDepuisAdresse({ adresse: adr('rue', '', pt(0, 0)), rues: [], pos: PP }).raison, /lisez un numéro/);
  const f = (p, props) => ({ geometry: { coordinates: [p.lon, p.lat] }, properties: props });
  const b = lireReponseBAN({ features: [f(pt(0, 400), { type: 'housenumber', label: 'loin', housenumber: '1', street: 'Rue Loin' }), f(pt(40, 40), { type: 'housenumber', label: '12', housenumber: '12', street: 'Rue de Rivoli' }), f(pt(5, 5), { type: 'street', label: 'Rivoli', name: 'Rue de Rivoli' })] }, PP);
  assert.deepEqual(b.map((x) => x.type), ['rue', 'numero']);
});

test('plaque : les pas font avancer la position corrigée ; le GPS ne reprend la main qu’après 20 s à plus de 2 × sa précision', () => {
  let e = etatPasInitial(), n = 0;
  for (let t = 0; t < 10000; t += 20) { const r = detecterPas(e, { x: 0, y: 0, z: 9.81 + 3 * Math.max(0, Math.sin(2 * Math.PI * 2 * t / 1000)), t }); e = r.etat; if (r.pas) n++; }
  assert.ok(n >= 18 && n <= 21, `${n} pas en 10 s à 2 pas/s`);
  assert.ok(Math.abs(distanceM(PP, avancer(PP, 90, 0.7, 10)) - 7) < 0.01);
  let c = { pos: PP, ecartDepuisMs: null, pas: 0 };
  assert.equal(surGps(c, { pos: pt(15, 0), precisionM: 10, t: 0 }).reprise, false, 'à 15 m pour ± 10 m : tient');
  c = surGps(c, { pos: pt(50, 0), precisionM: 10, t: 0 }).corr; assert.equal(surGps(c, { pos: pt(50, 0), precisionM: 10, t: 19000 }).reprise, false);
  assert.equal(surGps(c, { pos: pt(50, 0), precisionM: 10, t: 20000 }).reprise, true);
});

test('capteurRelatif : le quaternion donne les mêmes axes que camAxes de la v1 (200 orientations, 4 rotations d’écran, 1e-9)', () => {
  const D = Math.PI / 180;
  const camAxes = (alpha, beta, gamma, ang) => { const a = alpha * D, b = beta * D, g = gamma * D, cA = Math.cos(a), sA = Math.sin(a), cB = Math.cos(b), sB = Math.sin(b), cG = Math.cos(g), sG = Math.sin(g);
    const x = [cA * cG - sA * sB * sG, cG * sA + cA * sB * sG, -cB * sG], y = [-cB * sA, cA * cB, sB], z = [cG * sA * sB + cA * sG, sA * sG - cA * cG * sB, cB * cG];
    return { v: [-z[0], -z[1], -z[2]], r: ang === 90 ? y : ang === 270 ? y.map((k) => -k) : ang === 180 ? x.map((k) => -k) : x }; };
  assert.ok(V1.includes('const z=[cG*sA*sB+cA*sG, sA*sG-cA*cG*sB, cB*cG];'), 'formule recopiée de la v1');
  let s = 1; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 200; i++) { const a = rnd() * 360, b = rnd() * 360 - 180, g = rnd() * 180 - 90;
    for (const ang of [0, 90, 180, 270]) { const A = camAxes(a, b, g, ang), Q = axesDepuisQuaternion(quaternionDepuisAngles(a, b, g), ang);
      for (const k of ['v', 'r']) for (let j = 0; j < 3; j++) assert.ok(Math.abs(A[k][j] - Q[k][j]) < 1e-9, `${k}[${j}] ${a},${b},${g},${ang}`); } }
});

test('recalageContinu : deux détections concordantes sur 3 s → demi-pas ; mouvement, désaccord, reflet, pause et cumul de 20° bloquent', () => {
  const d = (t, dh, dp = 0) => ({ t, dh, dp }), base = { derniereMs: -Infinity, maintenantMs: 3000, cumulDeg: 0, rotationDegS: 0 };
  assert.deepEqual(decisionCalageContinu({ ...base, historique: [d(0, -4), d(3000, -4.2)] }).pas, { dh: -2.05, dp: 0 });
  assert.equal(decisionCalageContinu({ ...base, historique: [d(0, -4), d(3000, -4)], rotationDegS: 30 }).pas, null);
  assert.equal(decisionCalageContinu({ ...base, historique: [d(0, -4), d(3000, -6)] }).pas, null, 'désaccord de 2°');
  assert.equal(decisionCalageContinu({ ...base, historique: [d(1000, -4), d(3000, -4)] }).pas, null, 'accord de 2 s seulement');
  assert.match(decisionCalageContinu({ ...base, historique: [d(0, 30), d(3000, 30)] }).raison, /reflet/);
  assert.equal(decisionCalageContinu({ ...base, historique: [d(0, -4), d(3000, -4)], derniereMs: -5000 }).pas, null, 'pause de 10 s');
  assert.equal(decisionCalageContinu({ ...base, historique: [d(0, 0.1), d(3000, 0.1)] }).raison, 'convergé');
  assert.equal(decisionCalageContinu({ ...base, historique: [d(0, 4), d(3000, 4)], cumulDeg: 19 }).pas.dh, 1);
  assert.match(decisionCalageContinu({ ...base, historique: [d(0, 4), d(3000, 4)], cumulDeg: 20 }).raison, /cumul/);
});

// ---------- montagne ----------
import { lireAltitude, lireSommets, selectionner, fusionner, isolementMin } from '../greffes/montagne.js';
test('montagne : altitudes OSM lues (« 1 234,5 m »), sommets sans nom ou sans altitude écartés', () => {
  assert.equal(lireAltitude('1234'), 1234); assert.equal(lireAltitude('1 234,5 m'), 1234.5); assert.equal(lireAltitude('~4810'), 4810); assert.equal(lireAltitude('haut'), null); assert.equal(lireAltitude(null), null);
  assert.deepEqual(lireSommets({ elements: [{ lat: 45, lon: 6, tags: { name: 'A', ele: '3000' } }, { lat: 45, lon: 6, tags: { ele: '2000' } }, { lat: 45, lon: 6, tags: { name: 'C' } }, { lat: 45, lon: 6, tags: { name: 'D', 'name:fr': 'Dé', ele: '1 500 m' } }] }).map((p) => p.name), ['A', 'Dé']);
});
test('montagne : dominance — loin, un sommet doit être le plus haut sur d/30 km ; près, 0,3 km suffit ; au plus N sommets, les plus dominants d’abord', () => {
  const O = { lat: 45, lon: 6 }, at = (dKm, brg) => ({ lat: O.lat + dKm * Math.cos(brg * Math.PI / 180) / 111.2, lon: O.lon + dKm * Math.sin(brg * Math.PI / 180) / (111.2 * Math.cos(O.lat * Math.PI / 180)) });
  assert.equal(isolementMin(3), 0.3); assert.equal(isolementMin(60), 2);
  const s = [{ name: 'Haut', ele: 2500, ...at(60, 90) }, { name: 'Voisin', ele: 2400, ...at(61, 90) }, { name: 'Près', ele: 600, ...at(3, 0) }, { name: 'Près2', ele: 590, ...at(3.5, 0) }, { name: 'Hors', ele: 4000, ...at(130, 0) }];
  assert.deepEqual(selectionner(s, O).map((p) => p.name).sort(), ['Haut', 'Près', 'Près2']);
  assert.equal(selectionner(s, O, { nMax: 1 }).length, 1);
  const f = fusionner(selectionner(s, O), [{ name: 'près', ...at(3.1, 0) }]);
  assert.deepEqual(f.map((p) => p.name).sort(), ['Haut', 'Près2']); assert.ok(f.every((p) => p.farPeak && p.kind === 'peak'));
});

// ---- champAuto : une caméra simulée de champ connu filme un paysage simulé ; le gyroscope (arrondi à 0,1°) et l'image (en retard) donnent le champ ----
const paysage = (graine) => { // luminosité d'une direction (cap, hauteur, radians) : montagnes sombres sous une crête, ciel clair, détails de toutes tailles
  const r = alea(graine), T = Array.from({ length: 16 }, () => ({ a: 8 + 30 * r(), w: (0.15 + 2.2 * r()) * 12, p: 6.28 * r(), n: (0.2 + 2.5 * r()) * 14, q: 6.28 * r() })), C = Array.from({ length: 8 }, () => ({ a: (1.5 + 3 * r()) * 0.4 * D, w: 2 + 25 * r(), p: 6.28 * r() }));
  return (az, el) => { let cr = 4 * D; for (const c of C) cr += c.a * Math.sin(c.w * az + c.p); const bas = el < cr; let L = bas ? 60 : 170; for (const t of T) L += t.a * Math.sin(t.w * az + t.p) * Math.cos(t.n * el + t.q) * (bas ? 1 : 0.35); return Math.max(0, Math.min(255, L)); };
};
const brume = (graine, contraste) => { // temps brumeux : deux crêtes douces sur un ciel uni, aucun détail fin ; contraste 0,03 : brouillard
  const r = alea(graine), C1 = Array.from({ length: 7 }, () => ({ a: (2 + 4 * r()) * D, w: 1.5 + 6 * r(), p: 6.28 * r() })), C2 = Array.from({ length: 5 }, () => ({ a: (1 + 2 * r()) * D, w: 2 + 7 * r(), p: 6.28 * r() })), s = (x) => 1 / (1 + Math.exp(-x / (0.4 * D)));
  return (az, el) => { let c1 = 5 * D, c2 = 1 * D; for (const c of C1) c1 += c.a * 0.5 * Math.sin(c.w * az + c.p); for (const c of C2) c2 += c.a * 0.5 * Math.sin(c.w * az + c.p); return 150 - contraste * (20 * s(c1 - el) + 25 * s(c2 - el)) + 3 * contraste * Math.sin(3 * az) * Math.cos(5 * el); };
};
const axesDe = (cap, incl, roulis) => { const c = cap * D, i = incl * D, r = roulis * D, h = [Math.cos(c), -Math.sin(c), 0], u = [-Math.sin(c) * Math.sin(i), -Math.cos(c) * Math.sin(i), Math.cos(i)]; return { v: [Math.sin(c) * Math.cos(i), Math.cos(c) * Math.cos(i), Math.sin(i)], r: h.map((k, j) => k * Math.cos(r) + u[j] * Math.sin(r)) }; };
function filmer(L, A, f, w, h, bruit) { // sténopé exact, indépendant du code de la greffe
  const { v, r } = A, u = [r[1] * v[2] - r[2] * v[1], r[2] * v[0] - r[0] * v[2], r[0] * v[1] - r[1] * v[0]], out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const a = x - w / 2 + 0.5, b = -(y - h / 2 + 0.5), d = [v[0] * f + r[0] * a + u[0] * b, v[1] * f + r[1] * a + u[1] * b, v[2] * f + r[2] * a + u[2] * b]; out[y * w + x] = Math.max(0, Math.min(255, L(Math.atan2(d[0], d[1]), Math.asin(d[2] / Math.hypot(...d))) + (bruit ? bruit() : 0))); }
  return out;
}
/** Mesure jusqu'au premier « prêt » (comme la page : une image n'est lue que s'il le faut). `proche` : la moitié basse de l'image est à `proche` mètres, le téléphone tourne au bout du bras. */
function mesurerChamp({ champ, pose, L = paysage(1), portrait = false, retard = 90, duree = 20000, proche = 0 }) {
  const w = portrait ? 108 : GRAND_COTE, h = portrait ? GRAND_COTE : 108, f = GRAND_COTE / 2 / Math.tan(champ / 2 * D), S = creerSuivi(), ar = (x) => Math.round(x * 10) / 10, ev = [], rb = alea(99), bruit = () => (rb() - 0.5) * 4;
  for (let t = 0; t <= duree; t += 1000 / 60) ev.push({ t, o: true });
  for (let t = 200; t <= duree - 200; t += 1000 / 15) ev.push({ t: t + retard, tc: t });
  ev.sort((a, b) => a.t - b.t);
  const Lp = proche ? (cap) => (az, el) => el < 0 ? L(az + 0.35 * cap * D / proche * Math.cos(az - cap * D), el) : L(az, el) : () => L;
  for (const e of ev) {
    if (e.o) { const p = pose(e.t); S.orientation(e.t, axesDe(ar(p[0]), ar(p[1]), ar(p[2]))); }
    else if (S.besoin(e.t)) { const p = pose(e.tc); if (S.image(e.t, filmer(Lp(p[0]), axesDe(...p), f, w, h, bruit), w, h) && S.etat().ok) return { ...S.etat(), t: e.t }; }
  }
  return { ...S.etat(), t: null };
}
const balayage = (incl = 2) => (t) => [45 * Math.sin(2 * Math.PI * t / 5000), incl + 2 * Math.sin(t / 700), 1.5 * Math.sin(t / 1100)];
const ligne = (nom, o, e) => console.log(`champAuto : ${nom} — champ ${o.champ}° → ${e.champ ? e.champ.toFixed(2) + '°' : '—'}${e.t ? ` à ${(e.t / 1000).toFixed(1)} s` : ' (pas de mesure : ' + e.raison + ')'} (${e.n} mesures, ${Math.round(e.rotation)}° de rotation, écart ${e.rms ? e.rms.toFixed(2) : '—'} px, retard trouvé ${e.retard} ms)`);
test('champAuto : le champ d’une caméra simulée est retrouvé à 1 % près — paysage, portrait, téléphone incliné de 15°, avec le retard de l’image', () => {
  for (const [nom, o] of [['paysage', { champ: 68, pose: balayage() }], ['champ étroit, retard 160 ms', { champ: 44, pose: balayage(), L: paysage(3), retard: 160 }],
    ['portrait, retard nul', { champ: 74, pose: balayage(), portrait: true, L: paysage(6), retard: 0 }], ['portrait incliné de 15°', { champ: 62, pose: balayage(15), portrait: true, L: paysage(2) }]]) {
    const e = mesurerChamp(o); ligne(nom, o, e);
    assert.ok(e.t !== null, `pas de mesure : ${e.raison}`); assert.ok(Math.abs(e.champ / o.champ - 1) < 0.01, `${e.champ.toFixed(2)}° pour ${o.champ}°`);
    assert.ok(Math.abs(e.retard - (o.retard ?? 90)) <= 40, `retard ${e.retard} ms`); assert.ok(e.n >= 10 && e.rotation >= 60);
  }
});
test('champAuto : temps brumeux (des crêtes douces, aucun détail fin) → mesuré quand même, à 1,5 % près ; brouillard → « image sans détail », aucune mesure', () => {
  const o = { champ: 62, pose: (t) => [40 * Math.sin(2 * Math.PI * t / 7000), 5 + 1.5 * Math.sin(t / 700), 1.5 * Math.sin(t / 1100)], L: brume(1, 1), duree: 30000 }, e = mesurerChamp(o); ligne('brumeux', o, e);
  assert.ok(e.t !== null, `pas de mesure : ${e.raison}`); assert.ok(Math.abs(e.champ / o.champ - 1) < 0.015, `${e.champ.toFixed(2)}° pour ${o.champ}°`);
  const b = mesurerChamp({ ...o, L: brume(4, 0.03), duree: 8000 }); assert.equal(b.t, null); assert.equal(b.paires, 0); assert.equal(b.dernier, 'image sans détail');
});
test('champAuto : téléphone immobile → aucune mesure ; premier plan à 1,5 m dans le bas de l’image → ses blocs sont écartés, le champ reste juste', () => {
  const fixe = mesurerChamp({ champ: 68, pose: (t) => [10 + 0.3 * Math.sin(t / 400), 2, 0], duree: 6000 });
  assert.equal(fixe.t, null); assert.equal(fixe.paires, 0); assert.equal(fixe.dernier, 'en attente d’une rotation');
  const o = { champ: 68, pose: balayage(), proche: 1.5 }, pres = mesurerChamp(o); ligne('premier plan à 1,5 m', o, pres);
  assert.ok(pres.t !== null, pres.raison); assert.ok(Math.abs(pres.champ / 68 - 1) < 0.015, `${pres.champ}`); assert.ok(pres.part < 0.95, `blocs écartés : part ${pres.part}`);
});
test('champAuto : mêmes axes que camAxes de la v1 (200 orientations, 4 rotations d’écran)', () => {
  const r = alea(11);
  for (const angle of [0, 90, 180, 270]) { const camAxes = new Function('D', 'screen', 'window', `return ${fonctionV1('camAxes')}`)(D, { orientation: { angle } }, {});
    for (let k = 0; k < 50; k++) { const a = 360 * r(), b = -180 + 360 * r(), g = -90 + 180 * r(), V = camAxes(a, b, g), A = axesChamp(a, b, g, angle); for (let i = 0; i < 3; i++) { assert.ok(Math.abs(V.v[i] - A.v[i]) < 1e-12); assert.ok(Math.abs(V.r[i] - A.r[i]) < 1e-12); } } }
});
test('champAuto : la puce dit l’avancement, ce qui manque, puis le résultat pendant 10 s ; l’instant d’une image n’est celui de sa prise de vue que s’il est plausible', () => {
  const e = (o) => ({ n: 0, rotation: 0, precision: 1, paires: 0, dernier: 'en attente d’une rotation', ...o });
  assert.equal(textePuce({ actif: true, mesure: null, etat: e({}) }), 'champ : mesure 0 % · tournez-vous lentement');
  assert.equal(textePuce({ actif: true, mesure: null, etat: e({ dernier: 'image sans détail' }) }), 'champ : mesure 0 % · image sans détail (brouillard, nuit ?)');
  assert.equal(textePuce({ actif: true, mesure: null, etat: e({ n: 5, rotation: 45, precision: 0.004, paires: 5, champ: 62.4, dernier: 'mesure en cours' }) }), 'champ : mesure 50 % (≈ 62°)');
  assert.equal(textePuce({ actif: true, mesure: null, etat: e({ n: 12, rotation: 90, precision: 0.012, paires: 12, champ: 62.4, dernier: 'mesure en cours', raison: 'image peu détaillée : il faut tourner davantage' }) }), 'champ : mesure 50 % (≈ 62°) · image peu détaillée : il faut tourner davantage');
  assert.equal(textePuce({ actif: true, mesure: { champ: 62.5 }, etat: e({}), finT: 1000, maintenant: 9000 }), 'champ 62.5° mesuré'); assert.equal(textePuce({ actif: false, mesure: { champ: 62.5 }, etat: e({}), finT: 1000, maintenant: 12000 }), '');
  assert.equal(instantImage(5000, { captureTime: 4900, presentationTime: 4990 }), 4900); assert.equal(instantImage(5000, { captureTime: 1.7e12, presentationTime: 4990 }), 4990, 'autre horloge : écartée');
  assert.equal(instantImage(5000, { captureTime: 2000 }), 5000, 'trop ancienne'); assert.equal(instantImage(5000, undefined), 5000);
});

test('nettete : à l’infini si la caméra le permet, sinon mise au point continue, sinon rien', () => {
  const inf = choisirNettete({ focusMode: ['continuous', 'manual'], focusDistance: { min: 0.1, max: 12.5, step: 0.01 } });
  assert.equal(inf.mode, 'infini'); assert.deepEqual(inf.contraintes, { advanced: [{ focusMode: 'manual', focusDistance: 12.5 }] });
  assert.equal(choisirNettete({ focusMode: ['continuous', 'single-shot'] }).mode, 'continu');
  assert.equal(choisirNettete({ focusMode: ['manual', 'continuous'], focusDistance: { min: 0, max: 0 } }).mode, 'continu', 'plage de mise au point vide');
  assert.equal(choisirNettete({ width: { max: 1920 } }), null); assert.equal(choisirNettete(undefined), null);
});

// ---- nommer : relief synthétique au format de la v1 (pm : hauteur maximale cumulée par cap et par distance ; pm.raw : hauteur de chaque point) ----
const K = { TDIST: new Function('RELIEF_MAX_KM', `return ${/const TDIST=(\(\(\)=>\{.*?\}\)\(\));/.exec(V1)[1]}`)(200), BSTEP: 0.5, NB: 720, REFF: 6371000 * 1.13 };
function reliefSynthetique(profil, h0 = 1000) { // profil(dKm) → altitude, le même dans toutes les directions
  const raw = Float32Array.from(K.TDIST, (d) => Math.atan2(profil(d) - h0 - (d * 1000) ** 2 / (2 * K.REFF), d * 1000) / D), row = new Float32Array(raw.length); let mx = -90;
  raw.forEach((a, k) => { if (a > mx) mx = a; row[k] = mx; });
  const pm = Array.from({ length: K.NB }, () => row); pm.raw = Array.from({ length: K.NB }, () => raw);
  return { c: { lat: 45, lon: 5.5 }, h0, pm };
}
// plateau à 1 000 m, versant de 4 à 6 km (crête à 1 600 m), creux, puis montagne de 2 600 m à 12 km (elle dépasse la première crête : c'est la silhouette)
const profilTest = (d) => d < 4 ? 1000 : d < 6 ? 1000 + (d - 4) * 300 : d < 7 ? 1600 - (d - 6) * 400 : d < 12 ? 1200 + (d - 7) * 280 : Math.max(0, 2600 - (d - 12) * 500);
test('nommer : le rayon touche le premier versant, donne sa crête ; au-dessus de la silhouette (≤ 3°) il vise la silhouette ; plus haut, c’est le ciel', () => {
  const T = reliefSynthetique(profilTest), el = Math.atan2(300, 5000) / D, V = viser(T, K, 90, el);
  assert.ok(Math.abs(V.d - 5) < 0.15, `d ${V.d}`); assert.ok(Math.abs(V.alt - 1300) < 40, `alt ${V.alt}`); assert.equal(V.surSilhouette, false);
  assert.ok(Math.abs(V.crete.d - 6) < 0.15 && Math.abs(V.crete.alt - 1600) < 40, JSON.stringify(V.crete));
  assert.ok(Math.abs(V.lon - (5.5 + V.d / (111.32 * Math.cos(45 * D)))) < 1e-6 && Math.abs(V.lat - 45) < 1e-6, 'plein est');
  const ciel = T.pm[0][K.TDIST.length - 1], S1 = viser(T, K, 90, ciel + 1.5);
  assert.equal(S1.surSilhouette, true); assert.ok(Math.abs(S1.d - 12) < 0.3 && Math.abs(S1.alt - 2600) < 60, JSON.stringify(S1));
  assert.deepEqual(viser(T, K, 90, ciel + 5), { ciel: true, ecart: 5 }); assert.deepEqual(viser(T, K, 90, -25), { proche: true }); assert.equal(viser(null, K, 90, 0), null);
});
test('nommer : le sommet de la crête visée passe devant un lieu-dit plus proche ; hors rayon écarté ; même nom fusionné ; massif et commune à part', () => {
  const T = reliefSynthetique(profilTest), V = viser(T, K, 90, Math.atan2(300, 5000) / D), R = rayonKm(V.d), auLarge = (p, kmE, kmN = 0) => ({ lat: p.lat + kmN / 111.32, lon: p.lon + kmE / (111.32 * Math.cos(45 * D)) });
  assert.equal(R, 0.5); assert.equal(rayonKm(40), 2); assert.equal(rayonKm(300), 4);
  const j = { elements: [
    { type: 'node', id: 1, ...auLarge(V, 0.1), tags: { place: 'locality', name: 'Les Prés' } },
    { type: 'node', id: 2, ...auLarge(V.crete, 0, 0.05), tags: { natural: 'peak', name: 'Grand Sommet', ele: '1 602 m', wikipedia: 'fr:Grand Sommet' } },
    { type: 'way', id: 3, center: auLarge(V, 0, 0.3), tags: { natural: 'saddle', name: 'Col Voisin' } },
    { type: 'node', id: 4, ...auLarge(V, 0, 3), tags: { place: 'hamlet', name: 'Trop Loin' } },
    { type: 'node', id: 5, ...auLarge(V, 0.2), tags: { natural: 'peak' } },
    { type: 'area', id: 6, tags: { boundary: 'administrative', admin_level: '8', name: 'Saint-Test' } }, { type: 'area', id: 7, tags: { natural: 'mountain_range', name: 'Massif du Test' } }] };
  const N = lireNoms(j, V, [{ name: 'Grand sommet', lat: V.crete.lat, lon: V.crete.lon, ele: 1600 }]);
  assert.deepEqual(N.noms.map((o) => [o.name, o.type, o.ou]), [['Grand Sommet', 'sommet', 'crête'], ['Les Prés', 'lieu-dit', 'point'], ['Col Voisin', 'col', 'point']]);
  assert.equal(N.noms[0].ele, 1602); assert.equal(N.noms[0].osm, 'node/2'); assert.equal(N.noms[0].wikipedia, 'fr:Grand Sommet');
  assert.deepEqual(N.autour, [{ name: 'Massif du Test', type: 'massif' }, { name: 'Saint-Test', type: 'commune' }]);
  assert.deepEqual(lireNoms(null, V, []).noms, []); assert.deepEqual(nature({ mountain_pass: 'yes' }), ['col', 0.35]); assert.ok(nature({ place: 'locality', name: 'Plateau d’Herbouilly' })[1] > nature({ place: 'locality', name: 'Les Prés' })[1]); assert.equal(nature({ natural: 'plateau' })[0], 'plateau');
  const q = requeteNoms([V, V.crete], R);
  assert.match(q, /nwr\["name"\]\["natural"~"\^\(peak\|[^"]*plateau[^"]*\)\$"\]\(around:500,45\.0\d+,5\.5\d+\);/); assert.equal(q.split('(around:500,').length - 1, 10, '5 sélecteurs × 2 centres'); assert.match(q, /is_in\(45\.0\d+,5\.5\d+\)->\.a;/);
  const html = ficheHtml(V, N); assert.match(html, /Grand Sommet<\/div><div class="dbgline">sommet · 1[\s ]602 m · à 5,0 km d’ici · direction 90°/); assert.match(html, /fr\.wikipedia\.org\/wiki\/Grand_Sommet/);
  assert.match(ficheHtml(V, lireNoms({ elements: [] }, V, [])), /Relief à 5,0 km.*Rien de nommé dans OpenStreetMap à moins de 0,5 km/s); assert.match(ficheHtml(V, lireNoms(null, V, []), { enCours: true }), /Recherche du nom/);
});

// ---- projection : comparée à une caméra (sténopé) calculée à part, avec des axes ----
test('projection : un point placé par les formules de la v1 est envoyé là où une vraie caméra le voit (500 directions) ; l’inverse le ramène', () => {
  const r = alea(21), W = 915, H = 412; let ecartMax = 0;
  for (let k = 0; k < 500; k++) {
    const f = (W / 2) / Math.tan((40 + 50 * r()) / 2 * D), p = -25 + 50 * r(), dz = -38 + 76 * r(), el = -20 + 45 * r(), P = { f, W, H, p: p * D };
    const xv = W / 2 + f * Math.tan(dz * D), yv = H / 2 + f * Math.tan((p - el) * D); // la v1
    const A = axesDe(0, p, 0), u = [A.r[1] * A.v[2] - A.r[2] * A.v[1], A.r[2] * A.v[0] - A.r[0] * A.v[2], A.r[0] * A.v[1] - A.r[1] * A.v[0]], d = [Math.cos(el * D) * Math.sin(dz * D), Math.cos(el * D) * Math.cos(dz * D), Math.sin(el * D)];
    const sc = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], z = sc(d, A.v); if (z < 0.25) continue;
    const xs = W / 2 + f * sc(d, A.r) / z, ys = H / 2 - f * sc(d, u) / z, e = projExacte(xv, yv, P); // la caméra
    assert.ok(Math.abs(e[0] - xs) < 1e-6 && Math.abs(e[1] - ys) < 1e-6, `(${dz.toFixed(1)}°, ${el.toFixed(1)}°, inclinaison ${p.toFixed(1)}°) : ${e} au lieu de ${[xs, ys]}`);
    const q = projInverse(xs, ys, P); assert.ok(Math.abs(q[0] - xv) < 1e-6 && Math.abs(q[1] - yv) < 1e-6, `inverse : ${q} au lieu de ${[xv, yv]}`);
    ecartMax = Math.max(ecartMax, Math.hypot(xs - xv, ys - yv));
  }
  assert.ok(ecartMax > 40, 'la v1 et la caméra diffèrent nettement loin du centre');
  const P = { f: 720, W, H, p: 3 * D }, hy = H / 2 + 720 * Math.tan(3 * D);
  assert.deepEqual(projExacte(W / 2, H / 2, P), [W / 2, H / 2]); assert.ok(Math.abs(projExacte(W, hy, P)[1] - hy) < 1e-9, 'l’horizon reste une droite, à la même hauteur');
  // la mesure du document : crête à 6° au-dessus de l'horizon, téléphone incliné de 3°, à 30° du centre → 0,9° d'écart
  const xv = W / 2 + 720 * Math.tan(30 * D), yv = H / 2 + 720 * Math.tan(-3 * D), e = projExacte(xv, yv, P); assert.ok(Math.abs(Math.atan(Math.abs(e[1] - yv) / 720) / D - 0.92) < 0.03);
});

// ---- hauteurs : Turin, piazza San Carlo (positions réelles) — un clocher de 40 m sans nom à 115 m d'une statue de 4,4 m ----
test('hauteurs : le clocher donne sa hauteur à l’église la plus proche, jamais à la statue ; la statue reçoit les 4,4 m de sa fiche OpenStreetMap', () => {
  const base = () => [
    { name: 'statue équestre', qid: 'Q3663864', type: 'colonne', cat: 'monument', lat: 45.0677, lon: 7.68258, htWd: null, ht: 25 },
    { name: 'Piazza San Carlo', qid: 'Q1', type: 'place', cat: 'equip', lat: 45.0677, lon: 7.6826, htWd: null, ht: 0 },
    { name: 'Santa Cristina', qid: 'Q2', type: 'clocher', cat: 'monument', lat: 45.06688, lon: 7.68218, htWd: null, ht: 45 },
    { name: 'San Carlo Borromeo', qid: 'Q3', type: 'clocher', cat: 'monument', lat: 45.06678, lon: 7.68165, htWd: null, ht: 45 }];
  const clocher = { lat: 45.0668173, lon: 7.6818087, h: 40, kind: 'clocher' }, B = base();
  assert.equal(B.find((m) => m.cat !== 'equip').name, 'statue équestre', 'la v1 prend le premier de la liste : la statue');
  assert.equal(associerHauteur(B, clocher, 0.12).name, 'San Carlo Borromeo'); // le plus proche des compatibles (13 m), pas le premier
  assert.equal(associerHauteur(B.filter((m) => m.type !== 'clocher'), clocher, 0.12), undefined, 'aucun monument compatible : la tour reste à part');
  assert.equal(associerHauteur(B, { ...clocher, lat: 45.08 }, 0.12), undefined, 'trop loin');
  const proche = (a, b) => Math.abs(a.lat - b.lat) < 0.001 && Math.abs(a.lon - b.lon) < 0.0015, osm = { lat: 45.0677383, lon: 7.6825849, tags: { name: 'Monumento a Emanuele Filiberto', height: '4.4', wikidata: 'Q3663864', memorial: 'statue' } };
  const M = statueHauteur(B, osm, proche); assert.equal(M.name, 'statue équestre'); assert.equal(M.ht, 4.4); assert.equal(M.htOsm, 4.4);
  const B2 = base(); assert.equal(statueHauteur(B2, { ...osm, tags: { ...osm.tags, wikidata: undefined } }, proche).name, 'statue équestre', 'sans identifiant : la statue la plus proche');
  const B3 = base(); B3[0].htWd = 5; assert.equal(statueHauteur(B3, osm, proche), null, 'Wikidata donne déjà une hauteur'); assert.equal(B3[0].ht, 25);
  assert.equal(statueHauteur(base(), { ...osm, tags: { ...osm.tags, height: 'haute' } }, proche), null);
});
