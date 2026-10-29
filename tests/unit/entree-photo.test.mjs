// Entrée « photo rejouée » : position, direction (correction du Pixel), champ de vision, heure ; refus sans position.
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyserPhoto, lirePositionTexte, texteInfoPhoto } from '../../src/entrees/photo.js';
import { jpegExif } from './aide-jpeg.mjs';

test('Pixel à l’horizontale : la direction enregistrée est décalée de +90° (orientation 1) ou −90° (orientation 3)', () => {
  const a = analyserPhoto(jpegExif({ dir: 120, orient: 1 }), { largeurPx: 4000, hauteurPx: 3000 });
  assert.ok(a.ok);
  if (a.ok) { assert.equal(a.photo.capDeg, 210); assert.equal(a.photo.correctionDeg, 90); assert.equal(a.photo.peuFiable, false); assert.match(a.photo.direction, /photo 120° \+90° \(photo horizontale\) = 210°/); }
  const b = analyserPhoto(jpegExif({ dir: 120, orient: 3 }), { largeurPx: 4000, hauteurPx: 3000 });
  assert.ok(b.ok && b.photo.capDeg === 30);
});

test('portrait : la direction est signalée peu fiable', () => {
  const p = analyserPhoto(jpegExif({ dir: 100, orient: 6 }), { largeurPx: 3000, hauteurPx: 4000 });
  assert.ok(p.ok && p.photo.peuFiable && /portrait/.test(p.photo.direction));
});

test('un autre fabricant : pas de correction', () => {
  const p = analyserPhoto(jpegExif({ make: 'Apple', dir: 120, orient: 1 }), { largeurPx: 4000, hauteurPx: 3000 });
  assert.ok(p.ok && p.photo.capDeg === 120 && p.photo.correctionDeg === 0);
});

test('position, champ (focale 24 mm éq.) et heure de prise de vue', () => {
  const r = analyserPhoto(jpegExif({ f35: 24, lat: 48.6459, lon: -2.0281 }), { largeurPx: 4000, hauteurPx: 3000 });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.photo.sourcePosition, 'photo');
  assert.ok(Math.abs(r.photo.pos.lat - 48.6459) < 1e-3 && Math.abs(r.photo.pos.lon + 2.0281) < 1e-3);
  assert.ok(r.photo.champDeg !== null && r.photo.champDeg > 70 && r.photo.champDeg < 85, `champ ${r.photo.champDeg}`);
  assert.equal(r.photo.utc, Date.UTC(2026, 9, 25, 10, 22, 30)); // 12:22:30 à +02:00
  assert.match(texteInfoPhoto(r.photo, r.photo.champDeg ?? 67), /position de la photo 48\.64590, -2\.02810 · direction 120° · focale 24 mm éq\. → champ/);
});

test('sans fichier EXIF : position simulée, sinon refus expliqué', () => {
  const vide = new Uint8Array([0xFF, 0xD8, 0xFF, 0xD9]).buffer;
  const sans = analyserPhoto(vide, { largeurPx: 640, hauteurPx: 480 });
  assert.ok(!sans.ok && /Pas de position GPS/.test(sans.raison));
  const simulee = analyserPhoto(vide, { largeurPx: 640, hauteurPx: 480, positionSimulee: '45.0805, 7.6705' });
  assert.ok(simulee.ok);
  if (simulee.ok) { assert.equal(simulee.photo.sourcePosition, 'simulee'); assert.equal(simulee.photo.capDeg, 0); assert.equal(simulee.photo.directionAbsente, true); assert.equal(simulee.photo.champDeg, null); }
});

test('lecture d’une position saisie ou d’un lien de carte', () => {
  assert.deepEqual(lirePositionTexte('45.0805, 7.6705'), { lat: 45.0805, lon: 7.6705 });
  assert.deepEqual(lirePositionTexte('48,8584 2,2945'), { lat: 48.8584, lon: 2.2945 });
  assert.deepEqual(lirePositionTexte('https://www.google.com/maps/@48.6459,-2.0281,17z'), { lat: 48.6459, lon: -2.0281 });
  assert.equal(lirePositionTexte('rien'), null);
  assert.equal(lirePositionTexte('95, 10'), null);
  assert.equal(lirePositionTexte(''), null);
});
