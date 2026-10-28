// Calque lieux : règle de la photo (parité v1), classement Essentiel / Tout voir, étiquettes à poser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifierSurPhoto } from '../../src/scene/regle-photo.js';
import { classerLieux, preparerLieux, PRIORITE, PORTEE_KM } from '../../src/calques/lieux.js';
import { angleSilhouette } from '../../src/scene/cretes.js';
import { distanceEtCap, pointAuCap } from '../../src/noyau/geo.js';
import { alea, terrainSynthetique } from './aide-relief.mjs';

const src = readFileSync(new URL('../../v1/villes-horizon.html', import.meta.url), 'utf8');
/** @param {string} debut @param {string} fin Extrait de `debut` jusqu'à `fin` EXCLU. */
const avant = (debut, fin) => { const i = src.indexOf(debut), j = src.indexOf(fin, i); assert.ok(i >= 0 && j > i, `introuvable : ${debut}`); return src.slice(i, j); };
const v1 = new Function('D', 'photoSky', 'S', 'terrain', 'skylineElevAt', `
const wrap=a=>((a+540)%360)-180;
const PHOTO_EVERY=3000, PHOTO_FRESH=6000, PHOTO_TOL=0.5, PHOTO_WIN=0.7, PHOTO_SNAP=1.2;
const PHOTO_OBJ_GAP=0.5;
${avant('function photoCheck(c,aTop){', 'function grabFrame(cw){')}
return {photoCheck};`);

test('règle de la photo : verdict identique à la v1 (vu / caché / indéterminé, calage sur la pointe)', () => {
  const r = alea(31), etats = { vis: 0, hid: 0, unk: 0, nul: 0, snap: 0 };
  for (let i = 0; i < 1500; i++) {
    const cap = r() * 360, cols = Array.from({ length: 40 + Math.floor(r() * 120) }, (_, k) => ({ brg: (cap - 10 + k * 0.25 + 720) % 360, a: r() < 0.3 ? 8 + r() * 4 : r() * 4, top: false }));
    const relief = r() < 0.7, rel = (/** @type {number} */ brg) => (relief ? 2 + 2 * Math.sin(brg / 3) : null), c = { brg: (cap + (r() - 0.5) * 8 + 720) % 360 }, aTop = r() * 12 - 1;
    const a = verifierSurPhoto(cols, c.brg, aTop, relief ? rel : null);
    const b = v1(Math.PI / 180, { cols }, { relief }, relief, rel).photoCheck(c, aTop);
    assert.deepEqual(a, b, `tirage ${i}`);
    etats[a ? a.state : 'nul']++; if (a && a.snap !== null) etats.snap++;
  }
  assert.ok(etats.vis > 100 && etats.hid > 20 && etats.unk > 20 && etats.nul > 20 && etats.snap > 5, JSON.stringify(etats));
});

/** @param {string} name @param {string} kind @param {number} distKm @param {number} capDeg @param {{lat: number, lon: number}} pos */
const lieuA = (name, kind, distKm, capDeg, pos) => ({ name, kind, pop: 0, ele: null, ...pointAuCap(pos, distKm, capDeg) });
const reglages = (/** @type {object} */ o = {}) => ({ rayonKm: 60, relief: false, toutVoir: false, analyseActive: false, couche: true, distances: true, ...o });
const sans = (/** @type {any} */ pos) => ({ pos, terrain: null, analysePhoto: null, maintenantMs: 0 });

test('classement : rayon, portée par type, tri par priorité puis distance, doublons', () => {
  const pos = { lat: 48.6459, lon: -2.0281 };
  const lieux = [lieuA('Hameau', 'hamlet', 5, 10, pos), lieuA('Ville', 'city', 40, 20, pos), lieuA('Bourg', 'town', 20, 30, pos), lieuA('Village', 'village', 10, 40, pos), lieuA('Loin', 'village', 35, 50, pos),
    lieuA('HorsRayon', 'city', 100, 60, pos), lieuA('Phare', 'lighthouse', 3, 70, pos), lieuA('Rennes', 'city', 30, 80, pos), lieuA('rennes', 'city', 31, 80, pos), lieuA('Rennes', 'city', 90, 200, pos)];
  const c = classerLieux(lieux, sans(pos), reglages({ toutVoir: true }));
  assert.deepEqual(c.map((x) => x.el.name), ['Rennes', 'Ville', 'Bourg', 'Village', 'Loin', 'Hameau']); // villes d’abord (par distance), puis bourgs, villages, hameaux
  assert.deepEqual(c.map((x) => x.el.kind), ['city', 'city', 'town', 'village', 'village', 'hamlet']);
  assert.ok(!c.some((x) => x.el.name === 'HorsRayon' || x.el.name === 'Phare'), 'hors rayon et non-lieux écartés');
  assert.equal(c.filter((x) => x.el.name.toLowerCase() === 'rennes').length, 1, 'homonymes à moins de 2 km fusionnés');
  const loin = c.find((x) => x.el.name === 'Loin');
  assert.deepEqual([loin?.etat, loin?.raison], ['transparent', 'trop loin pour sa catégorie']); assert.ok(PORTEE_KM.village === 30 && PRIORITE.city < PRIORITE.hamlet);
  assert.equal(classerLieux(lieux, sans(pos), reglages()).find((x) => x.el.name === 'Loin')?.etat, 'absent'); // Essentiel : absent
  assert.equal(classerLieux(lieux, sans(pos), reglages()).find((x) => x.el.name === 'Village')?.etat, 'net');
});

test('classement : un nom net en Essentiel reste net en Tout voir ; Tout voir ne fait que s’ajouter', async () => {
  const T = await terrainSynthetique(), r = alea(8), pos = T.pos;
  const lieux = Array.from({ length: 120 }, (_, i) => lieuA('L' + i, ['city', 'town', 'village', 'hamlet'][i % 4], 1 + r() * 55, r() * 360, pos));
  const scene = { pos, terrain: T, analysePhoto: null, maintenantMs: 0 };
  const ess = classerLieux(lieux, scene, reglages({ relief: true })), tout = classerLieux(lieux, scene, reglages({ relief: true, toutVoir: true }));
  assert.equal(ess.length, tout.length);
  let caches = 0;
  for (let i = 0; i < ess.length; i++) {
    assert.equal(ess[i].el.name, tout[i].el.name);
    if (ess[i].etat === 'net') assert.equal(tout[i].etat, 'net');
    else { assert.equal(ess[i].etat, 'absent'); assert.equal(tout[i].etat, 'transparent'); assert.ok(tout[i].raison); }
    if (tout[i].raison === 'caché par le relief') { caches++; assert.equal(tout[i].el.hidden, true); }
  }
  assert.ok(caches > 3 && ess.some((c) => c.etat === 'net'), `relief : ${caches} cachés`);
  // relief désactivé : plus rien n'est caché par lui
  assert.ok(classerLieux(lieux, scene, reglages({ toutVoir: true })).every((c) => c.raison !== 'caché par le relief'));
});

test('classement : un lieu derrière un mur proche lu sur la photo devient un fantôme « caché sur la photo »', async () => {
  const T = await terrainSynthetique(), pos = T.pos, cap = 100;
  const lieux = [lieuA('Derrière', 'town', 8, cap, pos), lieuA('Ailleurs', 'town', 8, cap + 120, pos)];
  const mur = { ok: true, t: 1000, cols: Array.from({ length: 80 }, (_, i) => ({ brg: cap - 10 + i * 0.25, a: 14 })) }; // mur à 14° devant le premier
  const base = { pos, terrain: T, analysePhoto: mur, maintenantMs: 2000 };
  const avec = classerLieux(lieux, base, reglages({ toutVoir: true, analyseActive: true }));
  const derriere = avec.find((c) => c.el.name === 'Derrière');
  assert.ok(derriere && derriere.el.photoHid && derriere.etat === 'transparent'); assert.equal(derriere.raison, 'caché sur la photo');
  assert.equal(avec.find((c) => c.el.name === 'Ailleurs')?.el.photoHid, false, 'un lieu hors de l’image lue n’est pas touché');
  // analyse périmée ou désactivée : la règle ne s'applique pas
  assert.equal(classerLieux(lieux, { ...base, maintenantMs: 1000 + 6000 }, reglages({ analyseActive: true })).find((c) => c.el.name === 'Derrière')?.el.photoHid, false);
  assert.equal(classerLieux(lieux, base, reglages()).find((c) => c.el.name === 'Derrière')?.el.photoHid, false);
});

test('étiquettes : nets d’abord puis fantômes ; hors champ ignoré ; badge ; filtre ; calque coupé', async () => {
  const T = await terrainSynthetique(), pos = T.pos, cap = 100;
  const lieux = [lieuA('Proche', 'town', 5, cap, pos), lieuA('Village', 'village', 8, cap + 5, pos), lieuA('Loin', 'village', 40, cap - 5, pos), lieuA('Derrière', 'town', 10, cap + 200, pos)];
  const vue = { largeurPx: 915, hauteurPx: 412, capDeg: cap, inclinaisonDeg: 0, roulisDeg: 0, champDeg: 65 };
  const scene = { pos, terrain: null, analysePhoto: null, maintenantMs: 0 };
  const rg = reglages({ toutVoir: true, distances: true });
  const classes = classerLieux(lieux, scene, rg);
  const t = preparerLieux(classes, vue, rg);
  assert.deepEqual(t.etiquettes.map((e) => e.texte), ['Proche', 'Village', 'Loin']); // « Derrière » est hors champ
  assert.deepEqual(t.etiquettes.map((e) => e.fantome), [false, false, true]);
  assert.equal(t.etiquettes[2].opacite, 0.4); assert.equal(t.etiquettes[0].opacite, 1); assert.equal(t.etiquettes[0].taille, 16); assert.equal(t.etiquettes[1].taille, 14);
  assert.match(t.etiquettes[0].detail, /^5\.0 km$/); assert.equal(preparerLieux(classes, vue, { ...rg, distances: false }).etiquettes[0].detail, '');
  const ess = preparerLieux(classerLieux(lieux, scene, reglages()), vue, reglages());
  assert.deepEqual(ess.etiquettes.map((e) => e.texte), ['Proche', 'Village']); assert.equal(ess.fantomesEnChamp, 1, 'badge du bouton œil : un fantôme dans le champ');
  assert.deepEqual(preparerLieux(classes, vue, { ...rg, filtre: 'vill' }).etiquettes.map((e) => e.texte), ['Village']);
  assert.deepEqual(preparerLieux(classes, vue, { ...rg, couche: false }).etiquettes, []);
  const avecEle = preparerLieux(classerLieux([{ ...lieux[0], ele: 12.4 }], scene, rg), vue, rg);
  assert.equal(avecEle.etiquettes[0].detail, '12 m · 5.0 km');
  assert.ok(Math.abs(distanceEtCap(pos, lieux[0]).distKm - 5) < 0.05 && angleSilhouette(T.pm, cap) > -90);
});
