// @ts-nocheck — extraction du code de la v1 par `new Function` : le typage n'apporte rien ici.
// Fusion boussole / gyroscope et pose de la caméra : identiques à la v1 (code extrait de v1/villes-horizon.html) sur des séquences synthétiques.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { creerFusion, surOrientation, poseCapteurs, noterCalage, axesCamera, etatFusion, mesuresFusion, signalerReouverture, ACCORD_RETABLI_MS } from '../../src/entrees/capteurs.js';

const src = readFileSync(new URL('../../v1/villes-horizon.html', import.meta.url), 'utf8');
const debut = src.indexOf('let gotAbs=false;'), fin = src.indexOf('// ---------- données ----------', debut);
assert.ok(debut > 0 && fin > debut, 'bloc des capteurs introuvable dans la v1');
const bloc = src.slice(debut, fin);

/** Instance de la v1 : horloge, écran et réglages pilotés par le test. */
function v1() {
  const horloge = { t: 0 }, ecran = { orientation: { angle: 0 } }, S = { gyro: true, headOff: 0, pitchOff: 0 }, journal = [];
  const f = new Function('D', 'S', 'wrap', 'Date', 'screen', 'window', 'logNet', 'photoMode', `${bloc}
    return { onOrient, pose, noteCalib, snapshot: () => ({ gyroK, gyroResets, bins: magBins.map((b) => b && b.v), gyroOn: gyroOn() }) };`);
  const api = f(Math.PI / 180, S, (a) => ((a + 540) % 360) - 180, { now: () => horloge.t }, ecran, { addEventListener() {}, orientation: 0 }, (...a) => journal.push(a), null);
  return { ...api, horloge, ecran, S, journal };
}

/** Séquence : on tourne sur place (téléphone debout), la boussole a un biais qui dépend de la direction, le gyroscope un décalage constant. */
function sequence({ pas = 400, biaisMag = 25, decalageRel = 70, saut = null }) {
  const out = [];
  let t = 1000;
  for (let i = 0; i < pas; i++) {
    t += 50;
    const cap = (i * 2.2) % 360, tangage = 80 + 8 * Math.sin(i / 17), gamma = 6 * Math.sin(i / 11);
    const dec = decalageRel + (saut && i >= saut.depuis ? saut.valeur : 0);
    out.push({ t, absolu: true, e: { alpha: (360 - cap - biaisMag * Math.sin((cap * Math.PI) / 90) + 720) % 360, beta: tangage, gamma } });
    out.push({ t: t + 5, absolu: false, e: { alpha: (360 - cap + dec + 720) % 360, beta: tangage, gamma } });
  }
  return out;
}

function compare(etapes, { reglages = {}, angleEcran = 0, calageA = null } = {}) {
  const a = v1(), f = creerFusion(), S = { gyro: true, headOff: 0, pitchOff: 0, ...reglages };
  Object.assign(a.S, S); a.ecran.orientation.angle = angleEcran;
  let reinit = 0;
  etapes.forEach((s, i) => {
    a.horloge.t = s.t;
    a.onOrient({ ...s.e }, s.absolu);
    const r = surOrientation(f, { ...s.e, angleEcran }, s.absolu, s.t); if (r.reinitialise) reinit++;
    if (calageA === i) { a.noteCalib(); noterCalage(f, s.t); }
    if (i % 7 === 0 || i === etapes.length - 1) {
      const p1 = a.pose(), p2 = poseCapteurs(f, S, s.t);
      assert.ok(Math.abs(((p1.heading - p2.capDeg + 540) % 360) - 180) < 1e-9, `étape ${i} : cap ${p1.heading} / ${p2.capDeg}`);
      assert.ok(Math.abs(p1.pitch - p2.inclinaisonDeg) < 1e-9, `étape ${i} : inclinaison`);
      assert.ok(Math.abs(p1.roll - p2.roulisDeg) < 1e-9, `étape ${i} : roulis`);
    }
  });
  const sn = a.snapshot();
  assert.equal(f.gyroResets, sn.gyroResets, 'retours à la boussole');
  assert.ok(Math.abs(((f.gyroK ?? 0) - (sn.gyroK ?? 0))) < 1e-9, 'repère du gyroscope');
  f.magBins.forEach((b, i) => assert.ok((b === null) === (sn.bins[i] === null) && (b === null || Math.abs(b.v - sn.bins[i]) < 1e-9), `secteur ${i}`));
  return { f, reinit, sn };
}

test('rotation sur place avec biais magnétique par direction : même pose que la v1, secteurs appris', () => {
  const { f } = compare(sequence({}));
  assert.ok(f.magBins.filter(Boolean).length >= 10, 'les secteurs sont appris');
  assert.match(etatFusion(f, { gyro: true }, 30000), /gyroscope \+ boussole · \d+\/12 direction/);
});

test('écran en paysage (90°, 270°) et à l’envers (180°)', () => {
  for (const angle of [90, 270, -90, 180]) compare(sequence({ pas: 120 }), { angleEcran: angle });
});

/** Rejoue une séquence dans la fusion de la v2 seule (sans la v1) : renvoie la fusion, les poses échantillonnées et les compteurs d'événements. */
function jouerV2(etapes, { angleEcran = 0, S = { gyro: true, headOff: 0, pitchOff: 0 }, avant = null } = {}) {
  const f = avant || creerFusion(), poses = [], ev = { reinit: 0, debut: 0, fin: 0, causes: [] };
  for (const s of etapes) {
    const r = surOrientation(f, { ...s.e, angleEcran }, s.absolu, s.t);
    if (r.reinitialise) { ev.reinit++; ev.causes.push(r.cause); } if (r.perturbation === 'debut') ev.debut++; if (r.perturbation === 'fin') ev.fin++;
    poses.push({ t: s.t, cap: poseCapteurs(f, S, s.t).capDeg });
  }
  return { f, poses, ev };
}
/** Téléphone immobile (cap 100°, debout) : la boussole mesure `biais(t)` d'écart, le gyroscope un décalage constant. */
function immobile({ n = 400, t0 = 1000, biais = () => 0, decalageRel = 70, sautRelatifA = null, saut = 0 }) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = t0 + i * 50, cap = 100;
    out.push({ t, absolu: true, e: { alpha: (360 - cap - biais(t - t0) + 720) % 360, beta: 85, gamma: 2 } });
    out.push({ t: t + 5, absolu: false, e: { alpha: (360 - cap + decalageRel + (sautRelatifA !== null && i >= sautRelatifA ? saut : 0) + 720) % 360, beta: 85, gamma: 2 } });
  }
  return out;
}
const ecart = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

test('VEILLE-ANCRAGE A : dérive magnétique progressive jusqu\'à 70° : aucun retour à la boussole, « boussole perturbée », le cap et le calage tiennent', () => {
  const S = { gyro: true, headOff: 0, pitchOff: 0 };
  const stable = jouerV2(immobile({ n: 200 }), { S }), capAvant = stable.poses[stable.poses.length - 1].cap;
  noterCalage(stable.f, 11000); S.headOff = 12; // un calage vient d'être fait : +12°
  const derive = jouerV2(immobile({ n: 400, t0: 12000, biais: (dt) => Math.min(70, dt / 300) }), { S, avant: stable.f }); // 0 → 70° en 21 s
  assert.equal(derive.ev.reinit, 0, 'aucun retour à la boussole');
  assert.equal(derive.ev.debut, 1, 'une seule perturbation signalée'); assert.equal(derive.f.boussolePerturbee, true);
  assert.equal(derive.f.gyroResets, 0);
  for (const p of derive.poses.slice(-50)) assert.ok(ecart(p.cap, capAvant + 12) < 0.5, `le cap suit le gyroscope : ${p.cap.toFixed(1)}° au lieu de ${(capAvant + 12).toFixed(1)}°`);
  assert.match(etatFusion(derive.f, S, 40000), /BOUSSOLE PERTURBÉE/); assert.equal(mesuresFusion(derive.f, 40000).boussolePerturbee, true);
  // la boussole redevient normale : accord retrouvé après 2 s, apprentissage repris
  const fin = jouerV2(immobile({ n: 200, t0: 33000, biais: () => 0 }), { S, avant: derive.f });
  assert.equal(fin.ev.fin, 1); assert.equal(fin.f.boussolePerturbee, false); assert.ok(ACCORD_RETABLI_MS === 2000);
  assert.equal(fin.f.gyroResets, 0);
});

test('désaccord durable de 60° (voiture, métal) : jamais de retour à la boussole, même après des minutes', () => {
  const r = jouerV2(immobile({ n: 4000, biais: (dt) => (dt > 3000 ? 60 : 0) })); // 200 s
  assert.equal(r.ev.reinit, 0); assert.equal(r.f.boussolePerturbee, true);
  const cap0 = r.poses[100].cap; assert.ok(ecart(r.poses[r.poses.length - 1].cap, cap0) < 0.5, 'le cap n\'a pas bougé');
});

test('saut instantané du repère du gyroscope (90° d\'une mesure à l\'autre) : un retour à la boussole, une seule fois', () => {
  const r = jouerV2(immobile({ n: 300, sautRelatifA: 150, saut: 90 }));
  assert.equal(r.ev.reinit, 1); assert.deepEqual(r.ev.causes, ['saut']); assert.equal(r.f.gyroResets, 1); assert.equal(r.f.boussolePerturbee, false);
  const apres = r.poses[r.poses.length - 1].cap; assert.ok(ecart(apres, 100) < 3, `retour à la boussole : cap ${apres.toFixed(1)}°`);
});

test('caméra vers le haut (cap non défini) : pas de faux saut', () => {
  const etapes = []; let t = 1000;
  for (let i = 0; i < 100; i++) { t += 50; etapes.push({ t, absolu: true, e: { alpha: 260, beta: 2, gamma: 0 } }, { t: t + 5, absolu: false, e: { alpha: (330 + (i % 2) * 120) % 360, beta: 2, gamma: 0 } }); } // téléphone à plat, alpha qui saute (cap indéfini)
  assert.equal(jouerV2(etapes).ev.reinit, 0);
});

test('réouverture (retour au premier plan, caméra relancée) : retour à la boussole, une seule fois', () => {
  const f = jouerV2(immobile({ n: 200 })).f, capAvant = poseCapteurs(f, { gyro: true, headOff: 0, pitchOff: 0 }, 11000).capDeg;
  signalerReouverture(f);
  const r = jouerV2(immobile({ n: 100, t0: 12000, decalageRel: 130 }), { avant: f }); // le gyroscope a changé de repère pendant l'absence
  assert.equal(r.ev.reinit, 1); assert.deepEqual(r.ev.causes, ['reouverture']); assert.equal(f.reouverture, false);
  assert.ok(ecart(r.poses[r.poses.length - 1].cap, 100) < 3, 'cap ramené à la boussole'); assert.ok(capAvant !== undefined);
  const encore = jouerV2(immobile({ n: 100, t0: 20000, decalageRel: 130 }), { avant: f }); assert.equal(encore.ev.reinit, 0, 'une seule fois');
});

test('boussole en pause après un calage, réglage gyroscope désactivé, décalages de calage', () => {
  compare(sequence({ pas: 250 }), { calageA: 200 });
  compare(sequence({ pas: 150 }), { reglages: { gyro: false } });
  compare(sequence({ pas: 150 }), { reglages: { headOff: 12.5, pitchOff: -3 } });
});

test('iOS : cap de la boussole fourni à part (webkitCompassHeading), alpha brut = gyroscope', () => {
  const etapes = [];
  let t = 5000;
  for (let i = 0; i < 200; i++) { t += 50; const cap = (i * 3) % 360; etapes.push({ t, absolu: false, e: { alpha: (360 - cap + 40) % 360, beta: 85, gamma: 2, webkitCompassHeading: (cap + 5 * Math.sin(i / 9) + 360) % 360 } }); }
  compare(etapes);
});

test('sans capteur : les réglages de calage seuls ; mesures incomplètes ignorées', () => {
  const f = creerFusion();
  assert.deepEqual(poseCapteurs(f, { headOff: -10, pitchOff: 4 }, 0), { capDeg: 350, inclinaisonDeg: 4, roulisDeg: 0 });
  surOrientation(f, { alpha: null, beta: 10, gamma: 0, angleEcran: 0 }, true, 100);
  assert.equal(f.capteur, false);
  const { v } = axesCamera(0, 90, 0, 0); // téléphone debout, haut vers le nord : la caméra arrière vise le nord
  assert.ok(Math.abs(v[1] - 1) < 1e-9 || Math.abs(v[1] + 1) < 1e-9);
});
