// @ts-nocheck — extraction du code de la v1 par `new Function` : le typage n'apporte rien ici.
// Carnet de calage, écart appris et banc d'essai : identiques à la v1 (code extrait de v1/villes-horizon.html).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { creerMesure, ajouterMesure, ecartAppris, resumeCarnet, sourceAuto, CARNET_MAX } from '../../src/calage/carnet.js';
import { executerBanc, pourquoiIgnore, DEPARTS } from '../../src/calage/banc.js';
import { distanceEtCap } from '../../src/noyau/geo.js';

const src = readFileSync(new URL('../../v1/villes-horizon.html', import.meta.url), 'utf8');
const i0 = src.indexOf("const CAL_KEY='vh-calib'"), i1 = src.indexOf('// CALAGE SUR LE SOLEIL', i0);
assert.ok(i0 > 0 && i1 > i0, 'bloc du carnet introuvable dans la v1');
let bloc = src.slice(i0, i1);
const i2 = bloc.indexOf('function calHtml'); // on ne teste pas la mise en forme HTML ici
bloc = bloc.slice(0, i2);

/** Instance de la v1 : stockage, horloge, état de la page pilotés par le test. */
function v1() {
  const mem = new Map(), horloge = { t: 1.8e12 }, etat = { pos: { lat: 48.65, lon: -2.03 }, acc: 12, S: { headOff: 0, pitchOff: 0, camFov: 67 }, photoMode: null, magBins: [], gyroResets: 0, gyro: false, soleil: null, heading: 0, pitch: 0 };
  const localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
  const Dt = { now: () => horloge.t };
  const f = new Function('localStorage', 'Date', 'etat', 'wrap', 'distBrg', 'navigator', 'clearTimeout', 'setTimeout', 'relayBase', 'fetchT', 'logNet', 'friendlyErr', `
    let pos=etat.pos, acc=etat.acc; const S=etat.S; const pose=()=>({heading:etat.heading,pitch:etat.pitch,roll:0}); const sunNow=()=>etat.soleil; const gyroOn=()=>etat.gyro;
    const D=Math.PI/180; let photoMode=etat.photoMode; let magBins=etat.magBins; let gyroResets=etat.gyroResets;
    ${bloc}
    return { calRecord:(a,b,c)=>{ pos=etat.pos; acc=etat.acc; photoMode=etat.photoMode; magBins=etat.magBins; gyroResets=etat.gyroResets; return calRecord(a,b,c); }, calLearned:()=>{ pos=etat.pos; return calLearned(); }, calDev:()=>calDev, setModel:(m)=>{ calModel=m; }, setBench:(b)=>{ calBench=b; } };`);
  const api = f(localStorage, Dt, etat, (a) => ((a + 540) % 360) - 180, (a, b) => { const r = distanceEtCap(a, b); return { dist: r.distKm, brg: r.capDeg }; }, { userAgent: 'UA' }, () => {}, () => 0, () => '', async () => ({}), () => {}, String);
  return { ...api, mem, horloge, etat, lire: () => JSON.parse(mem.get('vh-calib') || '[]'), file: () => JSON.parse(mem.get('vh-calib-q') || '[]') };
}

/** La même mesure côté v2, à partir du même état. */
function contexteV2(v, src, avant, extra) {
  const e = v.etat, ph = e.photoMode;
  return { src, avant, extra, capDeg: e.heading, inclinaisonDeg: e.pitch, headOff: e.S.headOff, pitchOff: e.S.pitchOff, camFov: e.S.camFov, pos: e.pos, precisionM: e.acc, soleil: e.soleil ? { azDeg: e.soleil.az, elDeg: e.soleil.el } : null,
    utcPhotoMs: ph ? ph.utc : null, maintenantMs: v.horloge.t, appareil: v.calDev(), modele: 'M', ua: 'UA', gyro: e.gyro,
    photo: ph ? { make: ph.make, model: ph.model, orient: ph.orient, dir: ph.dir, dirRef: ph.dirRef, dirCorr: ph.dirCorr, w: ph.w, h: ph.h } : null,
    secteursMag: e.magBins.filter(Boolean).map((q) => q.v), retoursBoussole: e.gyroResets };
}
/** Un calage côté v1 et côté v2 : mêmes mesures, même carnet, même file. */
function calage(v, carnet2, src, avant, extra) {
  v.setModel('M'); v.calRecord(src, avant, extra);
  const m = creerMesure(contexteV2(v, src, avant, extra));
  return m ? ajouterMesure(carnet2, m) : carnet2;
}
const vide = () => ({ mesures: [], file: [] });
const egal = (v, c, msg) => { assert.deepEqual(c.mesures, v.lire(), `${msg} : carnet`); assert.deepEqual(c.file, v.file(), `${msg} : file d'envoi`); };

test('mesure en direct : mêmes champs que calRecord (glisser, soleil, magnétomètre)', () => {
  const v = v1(); let c = vide();
  v.etat.magBins = [{ v: 12 }, null, { v: -8 }, { v: 25.5 }]; v.etat.gyroResets = 2; v.etat.gyro = true; v.etat.soleil = { az: 201.234, el: 33.456 };
  v.etat.S.headOff = 7.123; v.etat.S.pitchOff = -1.5; v.etat.heading = 190.4567; v.etat.pitch = 2.3456;
  c = calage(v, c, 'glisser', { h: 3, p: -1 }); egal(v, c, 'glisser');
  v.horloge.t += 60000; v.etat.soleil = { az: 1, el: -5 }; v.etat.S.headOff = 9; c = calage(v, c, 'soleil touché', { h: 7.123, p: -1.5 }, { ref: 'soleil', refDist: 150e6, refHeight: null }); egal(v, c, 'soleil touché');
  assert.ok(c.mesures[1].sun === null && c.mesures[1].mag.sectors === 3 && c.mesures[1].mag.resets === 2);
});

test('mesure en photo : direction ENREGISTRÉE, champ photo, heure de prise de vue', () => {
  const v = v1(); let c = vide();
  v.etat.photoMode = { utc: 1.79e12, make: 'Google', model: 'Google Pixel 8', orient: 1, dir: 199.4, dirRef: 'T', dirCorr: 90, w: 4080, h: 3072 };
  v.etat.S.headOff = 275; v.etat.heading = 275; v.etat.soleil = { az: 267.1, el: 1.0 };
  c = calage(v, c, 'repère touché', { h: 289, p: 0 }, { ref: 'Fort', refDist: 1.1, refHeight: 20 }); egal(v, c, 'photo');
  assert.equal(c.mesures[0].raw, 199.4); assert.equal(c.mesures[0].t, 1.79e12); assert.ok(c.mesures[0].photo && !c.mesures[0].mag);
  v.etat.photoMode = { ...v.etat.photoMode, dir: null, make: '', model: '', orient: 0 }; v.horloge.t += 1000; c = calage(v, c, 'auto relief', { h: 270, p: 0 }, { msg: 'calé' }); egal(v, c, 'photo sans direction');
});

test('rien n\'a bougé : aucune mesure ; pendant le banc : aucune mesure', () => {
  const v = v1(); const c = vide();
  v.etat.S.headOff = 10.1; v.etat.heading = 10.1;
  assert.equal(calage(v, c, 'glisser', { h: 10.0, p: 0 }), c); assert.deepEqual(v.lire(), []);
});

test('plusieurs glissers en moins de 20 s = une seule mesure ; le troisième, après 20 s, en fait une autre', () => {
  const v = v1(); let c = vide();
  v.etat.heading = 100; v.etat.S.headOff = 5; c = calage(v, c, 'glisser', { h: 0, p: 0 });
  v.horloge.t += 5000; v.etat.S.headOff = 9; v.etat.heading = 104; c = calage(v, c, 'glisser', { h: 5, p: 0 }); egal(v, c, 'fusion');
  assert.equal(c.mesures.length, 1); assert.equal(c.mesures[0].dOff, 9);
  v.horloge.t += 25000; v.etat.S.headOff = 12; v.etat.heading = 107; c = calage(v, c, 'glisser', { h: 9, p: 0 }); egal(v, c, 'après 20 s');
  assert.equal(c.mesures.length, 2);
  v.horloge.t += 1000; v.etat.S.headOff = 14; c = calage(v, c, 'soleil touché', { h: 12, p: 0 }); v.horloge.t += 1000; v.etat.S.headOff = 20; c = calage(v, c, 'glisser', { h: 14, p: 0 }); egal(v, c, 'glisser après une autre source');
});

test('500 dernières mesures gardées', () => {
  const v = v1(); let c = vide();
  for (let i = 0; i < CARNET_MAX + 30; i++) { v.horloge.t += 30000; v.etat.S.headOff = (i % 50) + 1; v.etat.heading = 50 + i % 7; c = calage(v, c, 'repère touché', { h: 0, p: 0 }, { ref: 'x' + i }); }
  egal(v, c, '530 mesures'); assert.equal(c.mesures.length, CARNET_MAX);
});

test('écart appris : mêmes règles que calLearned (proche, ancienne, secteur, autre appareil, photo)', () => {
  const v = v1(); let c = vide();
  const poser = (lat, lon, raw, off, jours, extra = {}) => { v.etat.pos = { lat, lon }; v.horloge.t = 1.8e12 - jours * 86400000; v.etat.S.headOff = off; v.etat.heading = (raw + off + 720) % 360; c = calage(v, c, 'repère touché', { h: off - 5, p: 0 }, extra); };
  poser(48.65, -2.03, 100, 6, 1); poser(48.6502, -2.0302, 130, 8, 2); poser(48.9, -2.5, 100, -3, 1); poser(48.65, -2.03, 100, 40, 40);
  v.etat.photoMode = { utc: 1, make: 'G', model: 'G', orient: 1, dir: 50, dirRef: 'T', dirCorr: 0, w: 4, h: 3 }; poser(48.65, -2.03, 100, 99, 0); v.etat.photoMode = null;
  v.horloge.t = 1.8e12; v.etat.pos = { lat: 48.65, lon: -2.03 };
  for (const [capDeg, headOff, pos] of [[106, 6, { lat: 48.65, lon: -2.03 }], [100, 0, { lat: 47, lon: 1 }], [250, 0, { lat: 47, lon: 1 }], [105, 0, { lat: 49.3, lon: -2.7 }]]) {
    v.etat.heading = capDeg; v.etat.S.headOff = headOff; v.etat.pos = pos;
    const a = v.calLearned(), b = ecartAppris(c.mesures, { pos, capDeg, headOff, appareil: v.calDev(), maintenantMs: v.horloge.t });
    assert.deepEqual(b && { off: b.off, n: b.n, comment: b.comment }, a && { off: a.off, n: a.n, comment: a.how }, `pos ${pos.lat} cap ${capDeg}`);
  }
  assert.equal(ecartAppris(c.mesures, { pos: null, capDeg: 0, headOff: 0, appareil: 'x', maintenantMs: 0 }), null);
  const r = resumeCarnet(c, { appareil: v.calDev(), modele: '', appris: null });
  assert.equal(r.nb, c.mesures.length); assert.ok(r.parSource.some((x) => x.source.startsWith('photo')) && r.parSource.some((x) => x.source === 'repère touché'));
  assert.equal(r.modele, 'modèle inconnu'); assert.equal(r.dernieres.length, Math.min(6, r.nb));
});

test('source d\'un calage automatique', () => {
  assert.deepEqual(['soleil', 'relief', 'reperes', 'aucune'].map(sourceAuto), ['auto soleil', 'auto relief', 'auto repères', 'auto relief']);
});

test('banc d\'essai : verdicts, restauration de la référence, tous les départs', async () => {
  const ref = { h: 275, p: 4, c: 67 }, etat = { ...ref }, vus = [];
  const res = await executerBanc({ reference: ref, appliquer: (h, p, c) => { etat.h = h; etat.p = p; etat.c = c; vus.push([h, p, c]); }, pause: async () => {},
    calerAuto: async () => { const dh = etat.h - ref.h; if (Math.abs(dh) === 8) return 'refus'; if (Math.abs(dh) === 12) { etat.h = ref.h + 5; return 'faux'; } etat.h = ref.h; etat.c = ref.c; return 'calé'; }, lireEtat: () => ({ ...etat }) });
  assert.equal(res.lignes.length, DEPARTS.length);
  assert.deepEqual(res.lignes.map((l) => l.verdict), ['faux', 'refusé', 'réussi', 'réussi', 'refusé', 'faux', 'réussi', 'réussi', 'réussi', 'réussi']);
  assert.deepEqual(res.synthese, { reussis: 6, refuses: 2, faux: 2 });
  assert.deepEqual(vus[vus.length - 1], [275, 4, 67], 'référence rétablie');
  assert.equal(vus[6][2], 61); assert.equal(vus[0][0], 263);
});

test('banc d\'essai : la référence est rétablie même si « Caler auto » plante', async () => {
  const etat = { h: 0, p: 0, c: 0 };
  await assert.rejects(executerBanc({ reference: { h: 10, p: 1, c: 60 }, appliquer: (h, p, c) => Object.assign(etat, { h, p, c }), pause: async () => {}, calerAuto: async () => { throw new Error('boum'); }, lireEtat: () => etat }));
  assert.deepEqual(etat, { h: 10, p: 1, c: 60 });
});

test('pourquoi un monument est ignoré : mêmes motifs que la v1', () => {
  const s = src.indexOf('const why=c=>'), why = new Function('S', 'terrain', 'MON_W', 'D', `const ${src.slice(s + 6, src.indexOf('\n', s))}\nreturn why;`);
  const MON_W = { tour: 12, dome: 35, chateau: 60 };
  for (const relief of [true, false]) {
    const w = why({ relief }, relief, MON_W, Math.PI / 180);
    for (const c of [{ dist: 0.1 }, { dist: 30 }, { dist: 3, hidden: true, type: 'tour' }, { dist: 3, type: 'maison' }, { dist: 0.2, type: 'chateau', htWd: 40 }, { dist: 3, type: 'tour', far: true }, { dist: 3, type: 'tour' }, { dist: 5, type: 'dome' }])
      assert.equal(pourquoiIgnore(c, relief), w(c), JSON.stringify(c));
  }
});
