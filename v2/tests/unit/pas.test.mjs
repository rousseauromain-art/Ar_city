// @ts-nocheck — signaux synthétiques.
import test from 'node:test';
import assert from 'node:assert/strict';
import { detecterPas, etatPasInitial, avancer, poserCorrection, surPas, surGps, LONGUEUR_PAS_M } from '../../src/scene/pas.js';

/** Marche : l'accélération verticale oscille autour de 9,81 à `hz` pas par seconde, d'amplitude `amp`. */
function marche({ pas, hz = 2, amp = 3, immobile = false, secousse = null }) {
  let etat = etatPasInitial(), n = 0;
  const T = (pas / hz) * 1000 + 600;
  for (let t = 0; t < T; t += 10) {
    const phase = (t / 1000) * hz * 2 * Math.PI, z = 9.81 + (immobile ? 0.05 * Math.sin(phase * 7) : amp * Math.max(0, Math.sin(phase)) ** 2 * (t < pas / hz * 1000 ? 1 : 0)) + (secousse && t > secousse.t && t < secousse.t + 40 ? secousse.a : 0);
    const r = detecterPas(etat, { x: 0.2, y: 0.1, z, t }); etat = r.etat; if (r.pas) n++;
  }
  return n;
}

test('détection : 20 pas de marche = 20 pas ; immobile = 0 ; un simple tremblement n\'est pas un pas', () => {
  assert.equal(marche({ pas: 20 }), 20);
  assert.equal(marche({ pas: 20, hz: 1.5 }), 20);
  assert.equal(marche({ pas: 10, immobile: true }), 0);
  assert.equal(marche({ pas: 20, amp: 0.5 }), 0, 'trop faible');
});

test('20 pas vers l\'est : +14 m ; vers le nord-est : composantes exactes', () => {
  let c = poserCorrection({ lat: 48.85, lon: 2.35 });
  for (let i = 0; i < 20; i++) c = surPas(c, 90, LONGUEUR_PAS_M);
  const dE = (c.pos.lon - 2.35) * 111320 * Math.cos(48.85 * Math.PI / 180), dN = (c.pos.lat - 48.85) * 111320;
  assert.ok(Math.abs(dE - 14) < 0.05 && Math.abs(dN) < 0.01, `${dE} / ${dN}`); assert.equal(c.pas, 20);
  const ne = avancer({ lat: 48.85, lon: 2.35 }, 45, 10); assert.ok(Math.abs((ne.lat - 48.85) * 111320 - 7.07) < 0.01);
  const long = avancer({ lat: 48.85, lon: 2.35 }, 0, 0.5, 10); assert.ok(Math.abs((long.lat - 48.85) * 111320 - 5) < 0.01, 'longueur de pas réglable');
});

test('le GPS ne reprend la main que s\'il s\'écarte de plus de 2 × sa précision pendant 20 s', () => {
  const p = { lat: 48.85, lon: 2.35 }, loin = { lat: 48.85 + 40 / 111320, lon: 2.35 }; // à 40 m, précision 8 m : écart > 16 m
  let c = poserCorrection(p), r;
  for (let t = 0; t <= 19000; t += 1000) { r = surGps(c, { pos: loin, precisionM: 8, t }); c = r.corr; assert.ok(c, `repris trop tôt à ${t} ms`); }
  r = surGps(c, { pos: loin, precisionM: 8, t: 20000 }); assert.equal(r.reprise, true); assert.equal(r.corr, null);
});

test('un écart bref ne compte pas : le compteur repart de zéro dès que le GPS revient à moins de 2 × précision', () => {
  const p = { lat: 48.85, lon: 2.35 }, loin = { lat: 48.85 + 40 / 111320, lon: 2.35 }, pres = { lat: 48.85 + 5 / 111320, lon: 2.35 };
  let c = poserCorrection(p);
  for (const [t, g] of [[0, loin], [10000, loin], [15000, pres], [16000, loin], [30000, loin]]) { const r = surGps(c, { pos: g, precisionM: 8, t }); c = r.corr; assert.ok(c, `repris à tort à ${t} ms`); }
  assert.equal(surGps(c, { pos: loin, precisionM: 8, t: 36000 }).reprise, true, '20 s depuis 16 000 ms');
});
