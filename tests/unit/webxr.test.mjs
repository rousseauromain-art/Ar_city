// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { quaternionXrVersEnu } from '../../src/entrees/webxr.js';
import { axesDepuisQuaternion } from '../../src/entrees/capteurs.js';

const autourDeY = (deg) => [0, Math.sin(deg * Math.PI / 360), 0, Math.cos(deg * Math.PI / 360)];
const autourDeX = (deg) => [Math.sin(deg * Math.PI / 360), 0, 0, Math.cos(deg * Math.PI / 360)];
const cap = (v) => ((Math.atan2(v[0], v[1]) * 180) / Math.PI + 360) % 360;
const incl = (v) => (Math.asin(v[2]) * 180) / Math.PI;

test('WebXR → Est/Nord/Haut : identité = caméra vers le nord, à l\'horizontale', () => {
  const { v } = axesDepuisQuaternion(quaternionXrVersEnu([0, 0, 0, 1]), 0);
  assert.ok(Math.abs(cap(v)) < 1e-9 || Math.abs(cap(v) - 360) < 1e-9); assert.ok(Math.abs(incl(v)) < 1e-9);
});

test('tourner à droite de 90° (rotation de −90° autour de y) : caméra vers l\'est ; à gauche : vers l\'ouest', () => {
  assert.ok(Math.abs(cap(axesDepuisQuaternion(quaternionXrVersEnu(autourDeY(-90)), 0).v) - 90) < 1e-9);
  assert.ok(Math.abs(cap(axesDepuisQuaternion(quaternionXrVersEnu(autourDeY(90)), 0).v) - 270) < 1e-9);
  assert.ok(Math.abs(cap(axesDepuisQuaternion(quaternionXrVersEnu(autourDeY(180)), 0).v) - 180) < 1e-9);
});

test('lever la caméra de 30° (rotation de +30° autour de x) : inclinaison +30°, cap inchangé ; l\'axe de droite de l\'écran reste horizontal', () => {
  const a = axesDepuisQuaternion(quaternionXrVersEnu(autourDeX(30)), 0);
  assert.ok(Math.abs(incl(a.v) - 30) < 1e-9); assert.ok(Math.abs(cap(a.v)) < 1e-9 || Math.abs(cap(a.v) - 360) < 1e-9);
  assert.ok(Math.abs(a.r[2]) < 1e-9, 'pas de roulis');
});

test('composition : cap 90° puis lever de 20° : cap 90°, inclinaison 20°', () => {
  const q = (() => { const a = autourDeY(-90), b = autourDeX(20); return [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]]; })();
  const v = axesDepuisQuaternion(quaternionXrVersEnu(q), 0).v;
  assert.ok(Math.abs(cap(v) - 90) < 1e-9); assert.ok(Math.abs(incl(v) - 20) < 1e-9);
});
