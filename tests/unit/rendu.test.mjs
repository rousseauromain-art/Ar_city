// Rendu commun : projection, réservations, commandes de dessin, calques relief et photo-silhouette.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { champAffiche, focalePx, xDepuisRelevement, yDepuisSite, ordonneeHorizon, ecartDepuisX, demiChampDeg } from '../../src/rendu/projection.js';
import { polygonesSeChevauchent, rectangleTouche, reservationsInterface } from '../../src/rendu/reservations.js';
import { trait, remplissage, texte, courbeParLesMilieux } from '../../src/rendu/commandes.js';
import { dessiner, avecRoulis } from '../../src/rendu/canvas.js';
import { commandesHorizon } from '../../src/rendu/repere-horizon.js';
import { commandesSilhouette, calque as relief } from '../../src/calques/relief.js';
import { silhouetteVisible, commandesSilhouettePhoto, calque as photo, ANALYSE_VALIDE_MS } from '../../src/calques/photo-silhouette.js';
import { alea } from './aide-relief.mjs';

const src = readFileSync(new URL('../../v1/villes-horizon.html', import.meta.url), 'utf8');
/** @param {string} debut @param {string} fin */
const extraire = (debut, fin) => { const i = src.indexOf(debut), j = src.indexOf(fin, i); assert.ok(i >= 0 && j > i, `introuvable : ${debut}`); return src.slice(i, j + fin.length); };
const D = Math.PI / 180;
const v1 = new Function('D', 'camSrc', 'W', 'H', `${extraire('function vFovFor(camFov){', '\n}\n')}
${extraire('function polysOverlap(P,Q,m){', '\n}\n')}
return {vFovFor,polysOverlap};`);

/** @param {number} W @param {number} H @param {number} [champDeg] */
const vue = (W = 915, H = 412, champDeg = 65) => ({ largeurPx: W, hauteurPx: H, capDeg: 120, inclinaisonDeg: 4, roulisDeg: 0, champDeg });

test('projection : champ affiché identique à la v1 (flux connu ou non, portrait et paysage)', () => {
  const r = alea(4);
  for (let i = 0; i < 200; i++) {
    const W = 300 + Math.round(r() * 700), H = 300 + Math.round(r() * 700), fov = 40 + r() * 50, flux = i % 5 ? { w: 1000 + Math.round(r() * 3000), h: 1000 + Math.round(r() * 3000) } : { w: 0, h: 0 };
    const M = v1(D, () => flux, W, H);
    assert.ok(Object.is(champAffiche(fov, { largeurPx: W, hauteurPx: H }, flux.w ? { largeurPx: flux.w, hauteurPx: flux.h } : null), M.vFovFor(fov)));
  }
});

test('projection : relèvement et site → pixels, et retour', () => {
  const v = vue();
  assert.equal(xDepuisRelevement(v, 120), 915 / 2); // l'axe de la caméra est au centre
  assert.equal(yDepuisSite(v, 4), 412 / 2);
  assert.ok(xDepuisRelevement(v, 150) > 915 / 2 && xDepuisRelevement(v, 90) < 915 / 2);
  assert.ok(Math.abs(ecartDepuisX(v, xDepuisRelevement(v, 140)) - 20) < 1e-9);
  assert.ok(yDepuisSite(v, 10) < yDepuisSite(v, 0), 'plus haut dans le ciel = plus haut à l’écran');
  assert.equal(xDepuisRelevement(v, 120 + 360), xDepuisRelevement(v, 120)); // le tour complet ne change rien
  assert.equal(ordonneeHorizon({ ...v, inclinaisonDeg: 85 }), ordonneeHorizon({ ...v, inclinaisonDeg: 80 })); // inclinaison bornée à ±80°
  assert.ok(demiChampDeg(v) > 32.5 && demiChampDeg(v) < 40);
  assert.ok(focalePx(v) > 0);
});

test('réservations : chevauchement exact de rectangles inclinés, identique à la v1', () => {
  const r = alea(6), M = v1(D, null, 0, 0);
  const rect = (/** @type {number} */ cx, /** @type {number} */ cy, /** @type {number} */ l, /** @type {number} */ h, /** @type {number} */ ang) => {
    const c = Math.cos(ang), s = Math.sin(ang);
    return /** @type {[number, number][]} */ ([[-l, -h], [l, -h], [l, h], [-l, h]].map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]));
  };
  let touche = 0;
  for (let i = 0; i < 500; i++) {
    const P = rect(r() * 200, r() * 200, 10 + r() * 60, 5 + r() * 15, r() * 3), Q = rect(r() * 200, r() * 200, 10 + r() * 60, 5 + r() * 15, r() * 3), m = r() * 4;
    const a = polygonesSeChevauchent(P, Q, m); assert.equal(a, M.polysOverlap(P, Q, m)); if (a) touche++;
  }
  assert.ok(touche > 50 && touche < 450, `le tirage doit mêler chevauchements et non (${touche})`);
});

test('réservations : rectangleTouche — marge, propriétaire, polygone incliné, interface', () => {
  const posees = [[0, 100, 0, 20], [200, 300, 0, 20, [[200, 0], [300, 0], [300, 20], [200, 20]], 'a']];
  assert.equal(rectangleTouche(/** @type {any} */ (posees), 50, 150, 10, 30, 0), true);
  assert.equal(rectangleTouche(/** @type {any} */ (posees), 101, 150, 0, 20, 0), false);
  assert.equal(rectangleTouche(/** @type {any} */ (posees), 101, 150, 0, 20, 2), true); // la marge compte
  assert.equal(rectangleTouche(/** @type {any} */ (posees), 210, 290, 5, 15, 0), true);
  assert.equal(rectangleTouche(/** @type {any} */ (posees), 210, 290, 5, 15, 0, 'a'), false); // son propre emplacement est ignoré
  const ui = reservationsInterface([{ left: 0, right: 50, top: 300, bottom: 400 }, { left: 0, right: 0, top: 0, bottom: 10 }]);
  assert.deepEqual(ui, [[0, 50, 300, 400]]); // un élément sans surface (masqué) n'est pas réservé
});

/** Faux contexte : note les appels. */
function fauxContexte() {
  /** @type {any[]} */
  const appels = [];
  const ctx = new Proxy({}, { get: (_t, nom) => (nom === 'measureText' ? (/** @type {string} */ t) => ({ width: t.length * 6 }) : (/** @type {any[]} */ ...a) => { appels.push([String(nom), ...a]); }), set: (_t, nom, v) => { appels.push(['=' + String(nom), v]); return true; } });
  return { ctx: /** @type {any} */ (ctx), appels };
}

test('commandes : courbe par les milieux, et rejeu sur un contexte', () => {
  const pts = [{ x: 0, y: 0 }, { x: 10, y: 5 }, { x: 20, y: 0 }, { x: 30, y: 5 }];
  assert.deepEqual(courbeParLesMilieux(pts), [['M', 0, 0], ['Q', 10, 5, 15, 2.5], ['Q', 20, 0, 25, 2.5], ['L', 30, 5]]);
  assert.deepEqual(courbeParLesMilieux(pts, 1, 3), [['M', 10, 5], ['Q', 20, 0, 25, 2.5], ['L', 30, 5]]);
  const { ctx, appels } = fauxContexte();
  dessiner(ctx, [trait([['M', 1, 2], ['L', 3, 4]], 'red', 2, { tirets: [1, 2], jointure: 'round' }), remplissage([['R', 0, 0, 10, 5, 2]], 'blue'), texte('a', 5, 6, '10px x', 'black', { alignement: 'center' })]);
  const noms = appels.map((a) => a[0]);
  assert.deepEqual(noms.slice(0, 4), ['beginPath', 'moveTo', 'lineTo', 'setLineDash']);
  assert.ok(noms.includes('stroke') && noms.includes('roundRect') && noms.includes('fill') && noms.includes('fillText'));
  assert.deepEqual(appels.find((a) => a[0] === '=lineJoin'), ['=lineJoin', 'round']);
});

test('commandes : le roulis fait tourner la scène autour du centre puis restaure le contexte', () => {
  const { ctx, appels } = fauxContexte();
  avecRoulis(ctx, { largeurPx: 100, hauteurPx: 50, roulisDeg: 90 }, () => appels.push(['dessin']));
  assert.deepEqual(appels.map((a) => a[0]), ['save', 'translate', 'rotate', 'translate', 'dessin', 'restore']);
  assert.ok(Math.abs(appels[2][1] - Math.PI / 2) < 1e-12);
  assert.throws(() => avecRoulis(ctx, { largeurPx: 1, hauteurPx: 1, roulisDeg: 0 }, () => { throw new Error('x'); }));
  assert.equal(appels.at(-1)[0], 'restore'); // même en cas d'erreur
});

test('horizon : ligne pointillée puis réticule au centre', () => {
  const [ligne, reticule] = /** @type {any[]} */ (commandesHorizon(vue()));
  assert.deepEqual(ligne.tirets, [3, 7]); assert.deepEqual(reticule.tirets, []);
  assert.equal(reticule.chemin[0][1], 915 / 2);
});

/** Masque simple : horizon à 3° partout, avec une bosse à 5° vers 120°, sur 500 distances. */
function masqueSimple() {
  const pm = /** @type {any} */ (new Array(720));
  for (let i = 0; i < 720; i++) { const row = new Float32Array(500); for (let k = 0; k < 500; k++) row[k] = k < 100 ? -2 : (Math.abs(i * 0.5 - 120) < 10 ? 5 : 3); pm[i] = row; }
  pm.raw = pm.map((/** @type {Float32Array} */ r) => r.slice());
  return pm;
}

test('relief : silhouette = halo, puis tronçons gradués par la distance ; rien sans terrain ni réglage', () => {
  const pm = masqueSimple(), v = vue(), mesurer = (/** @type {string} */ _p, /** @type {string} */ t) => t.length * 6;
  const cmds = commandesSilhouette(pm, v);
  assert.equal(cmds[0].type, 'trait'); assert.equal(/** @type {any} */ (cmds[0]).largeur, 3.2);
  assert.ok(cmds.length >= 2 && cmds.slice(1).every((c) => /** @type {any} */ (c).couleur.startsWith('rgba(243,233,210')));
  const ctxRelief = { terrain: { pm }, reglages: { silhouette: true, cretes: true, distances: true, toutVoir: false }, mesurerTexte: mesurer };
  assert.ok(relief.preparer([], v, ctxRelief).length >= 2);
  assert.deepEqual(relief.preparer([], v, { ...ctxRelief, terrain: null }), []);
  assert.deepEqual(relief.preparer([], v, { ...ctxRelief, reglages: { ...ctxRelief.reglages, silhouette: false } }), []);
});

test('photo-silhouette : seulement en Tout voir, analyse active, réussie et récente', () => {
  const analyse = { ok: true, t: 1000, cols: [{ brg: 110, a: 2 }, { brg: 120, a: 3 }, { brg: 125, a: 2.5 }, { brg: 300, a: 4 }, { brg: 130, a: 3 }] };
  const ok = { toutVoir: true, analyseActive: true };
  assert.equal(silhouetteVisible(ok, analyse, 1000 + ANALYSE_VALIDE_MS - 1), true);
  assert.equal(silhouetteVisible(ok, analyse, 1000 + ANALYSE_VALIDE_MS), false);
  assert.equal(silhouetteVisible({ ...ok, toutVoir: false }, analyse, 1500), false);
  assert.equal(silhouetteVisible({ ...ok, analyseActive: false }, analyse, 1500), false);
  assert.equal(silhouetteVisible(ok, { ...analyse, ok: false }, 1500), false);
  assert.equal(silhouetteVisible(ok, null, 1500), false);
  const [c] = /** @type {any[]} */ (commandesSilhouettePhoto(analyse, vue()));
  const ops = c.chemin.map((/** @type {any[]} */ o) => o[0]);
  assert.deepEqual(ops, ['M', 'L', 'L', 'M']); // la colonne à 300° (hors champ) interrompt le tracé, la suivante repart par un déplacement
  assert.deepEqual(photo.preparer(analyse, vue(), { reglages: { ...ok, toutVoir: false }, maintenantMs: 1500 }), []);
  assert.equal(photo.preparer(analyse, vue(), { reglages: ok, maintenantMs: 1500 }).length, 1);
});
