// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { decisionCalageContinu, PAUSE_PAS_MS, CUMUL_MAX_DEG } from '../../src/calage/continu.js';

const det = (t, dh, dp = 0) => ({ t, dh, dp });
const base = { derniereMs: -Infinity, maintenantMs: 10000, cumulDeg: 0, rotationDegS: 1 };

test('deux détections concordantes sur 3 s : un pas de 50 % de l\'écart', () => {
  const r = decisionCalageContinu({ ...base, historique: [det(0, 4, 1), det(3200, 4.2, 1.1)] });
  assert.ok(r.pas); assert.ok(Math.abs(r.pas.dh - 2.05) < 1e-9); assert.ok(Math.abs(r.pas.dp - 0.525) < 1e-9);
});

test('refus : une seule détection, accord trop court, détections discordantes', () => {
  assert.match(decisionCalageContinu({ ...base, historique: [det(0, 4)] }).raison, /deuxième/);
  assert.match(decisionCalageContinu({ ...base, historique: [det(0, 4), det(2000, 4)] }).raison, /trop récentes/);
  assert.match(decisionCalageContinu({ ...base, historique: [det(0, 4), det(3500, 7)] }).raison, /non concordantes/);
});

test('téléphone en mouvement (plus de 10°/s) : rien', () => {
  assert.match(decisionCalageContinu({ ...base, rotationDegS: 25, historique: [det(0, 4), det(4000, 4)] }).raison, /mouvement/);
});

test('reflet probable : écart de cap > 15° ou d\'horizon > 8°', () => {
  assert.match(decisionCalageContinu({ ...base, historique: [det(0, 22), det(4000, 22)] }).raison, /reflet/);
  assert.match(decisionCalageContinu({ ...base, historique: [det(0, 2, 11), det(4000, 2, 11)] }).raison, /reflet/);
});

test('convergé : écart sous 0,3° : plus rien', () => {
  assert.equal(decisionCalageContinu({ ...base, historique: [det(0, 0.1, 0.1), det(4000, 0.2, 0.0)] }).raison, 'convergé');
});

test('cadence : au plus un pas toutes les 10 s', () => {
  const h = [det(0, 4), det(4000, 4)];
  assert.match(decisionCalageContinu({ ...base, historique: h, derniereMs: 5000, maintenantMs: 10000 }).raison, /pause/);
  assert.ok(decisionCalageContinu({ ...base, historique: h, derniereMs: 5000, maintenantMs: 5000 + PAUSE_PAS_MS }).pas);
});

test('cumul de la session plafonné à ±20°', () => {
  const h = [det(0, 12), det(4000, 12)];
  const r = decisionCalageContinu({ ...base, historique: h, cumulDeg: 17 }); // pas voulu 6 : seulement 3
  assert.ok(Math.abs(r.pas.dh - 3) < 1e-9);
  assert.match(decisionCalageContinu({ ...base, historique: h, cumulDeg: CUMUL_MAX_DEG }).raison, /cumul/);
});

test('une détection isolée discordante au milieu : seule la série finale concordante compte', () => {
  const r = decisionCalageContinu({ ...base, historique: [det(0, 9), det(1000, 4), det(2200, 4.3), det(4400, 4.1)] });
  assert.ok(r.pas && Math.abs(r.pas.dh - 2.1) < 0.1, 'moyenne de 4, 4,3 et 4,1 : environ 4,13 × 0,5');
});
