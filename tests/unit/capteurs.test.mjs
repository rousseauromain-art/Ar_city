// @ts-nocheck — extraction du code de la v1 par `new Function` : le typage n'apporte rien ici.
// Fusion boussole / gyroscope et pose de la caméra : identiques à la v1 (code extrait de v1/villes-horizon.html) sur des séquences synthétiques.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { creerFusion, surOrientation, poseCapteurs, noterCalage, axesCamera, etatFusion, GYRO_SAUT_MS } from '../../src/entrees/capteurs.js';

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

test('saut du repère du gyroscope (> 40° pendant plus de 2 s) : retour à la boussole, comme la v1', () => {
  const s = sequence({ pas: 300, saut: { depuis: 120, valeur: 130 } });
  const { f, reinit } = compare(s);
  assert.equal(reinit, 1); assert.equal(f.gyroResets, 1);
  assert.ok(GYRO_SAUT_MS === 2000);
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
