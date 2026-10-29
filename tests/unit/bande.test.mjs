// Bande des équipements (rendu/bande.js) et calques équipements, repères hauts et couches personnelles : formules de la v1 extraites de son fichier, puis règles
// (groupement, pastille du nombre, nom à côté puis dessous, étage haut, sites trouvés, pastilles hors champ). La parité du dessin sur scènes réelles est dans
// tests/e2e/equipements-v2.spec.js et kml-bande-v2.spec.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { aspectIcone, kmCourt, composerBande, pointeursHorsChamp, PLURIELS_INFRA } from '../../src/rendu/bande.js';
import { creerPlaceur } from '../../src/rendu/placement.js';
import { rectangleTouche } from '../../src/rendu/reservations.js';
import { classerEquipements, preparerEquipements, nomEquipement, classerPylones, preparerPylones, EQUIP_AFFICHES_MAX, PLURIELS_EQUIPEMENTS } from '../../src/calques/equipements.js';
import { classerReperes, preparerReperes, angleSommet } from '../../src/calques/reperes.js';
import { classerCouche, preparerCouche, sitesTrouves, couleurAvecOpacite } from '../../src/calques/kml.js';
import { creerCouche, positionnerCouche } from '../../src/donnees/kml.js';
import { pointAuCap } from '../../src/noyau/geo.js';
import { alea } from './aide-relief.mjs';

const src = readFileSync(new URL('../../v1/villes-horizon.html', import.meta.url), 'utf8');
const entre = (/** @type {string} */ debut, /** @type {string} */ fin) => { const i = src.indexOf(debut), j = src.indexOf(fin, i); assert.ok(i >= 0 && j > i, `introuvable : ${debut}`); return src.slice(i, j); };
const v1 = new Function('cities', `
const norm=t=>String(t).toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'');
const SETTLE=new Set(['city','town','village','hamlet','isolated_dwelling']);
${entre('function infraIconLook', 'function drawGlyph')}
${entre('const EQ_SHORT=', 'let shipSel=')}
const fkm=d=>d<10?d.toFixed(1):String(Math.round(d));
const hexA=(h,a)=>{ const n=parseInt(h.slice(1),16); return \`rgba(\${n>>16&255},\${n>>8&255},\${n&255},\${a})\`; };
return {infraIconLook,monName,EQ_PLURAL,fkm,hexA};`)([]);

const POS = { lat: 48.6459, lon: -2.0281 };
const W = 400, H = 800, vue = { largeurPx: W, hauteurPx: H, capDeg: 0, inclinaisonDeg: 0, roulisDeg: 0, champDeg: 60 };
const fh = (W / 2) / Math.tan((vue.champDeg / 2) * Math.PI / 180);
/** Relèvement d'un élément affiché à l'abscisse x (cap 0). */
const brgDe = (/** @type {number} */ x) => Math.atan((x - W / 2) / fh) * 180 / Math.PI;
const mesurerTexte = (/** @type {string} */ _p, /** @type {string} */ t) => t.length * 7;
const familles = { affichage: 'Serif', mono: 'Mono' };
const nouveauPlaceur = (/** @type {any[]} */ reservations = []) => creerPlaceur({ largeurPx: W, hauteurPx: H, limiteHautePx: 60, reservations, memoire: new Map() });
const opt = (/** @type {'bas'|'haut'} */ etage, /** @type {any} */ plus = {}) => ({ etage, hy: 400, basTexteLimite: 780, hautLimite: 60, debutBas: 430, calquesHautActifs: true, lignesMax: 60, memoireLignes: new Map(), mesurerTexte, familles, ...plus });
/** Élément à l'abscisse x. */
const el = (/** @type {string} */ nom, /** @type {number} */ x, /** @type {number} */ dist, /** @type {any} */ plus = {}) => ({ nom, icone: 'pylone', dist, brg: brgDe(x), idMemoire: nom + x, ...plus });
const couche = (/** @type {any[]} */ elements, /** @type {any} */ plus = {}) => ({ cle: 'tel', elements, couleur: { ligne: 'rgba(232,90,90,.85)', texte: '#E85A5A', icone: '#E85A5A' }, pluriels: PLURIELS_INFRA, ...plus });
const textes = (/** @type {any[]} */ cmds) => cmds.filter((c) => c.type === 'texte').map((c) => c.texte);

test('icône et distance de la bande : mêmes formules que la v1', () => {
  const r = alea(3);
  for (let i = 0; i < 500; i++) {
    const d = r() * 40, a = aspectIcone(d), b = v1.infraIconLook(d);
    assert.ok(Object.is(a.h, b.h) && Object.is(a.a, b.a), `${d}`); assert.equal(kmCourt(d), v1.fkm(d));
  }
  assert.equal(PLURIELS_INFRA.Pylône, 'pylônes'); assert.deepEqual(PLURIELS_EQUIPEMENTS, v1.EQ_PLURAL);
});

test('nom d’un équipement : type devant si le nom ne le dit pas, 28 caractères, comme la v1', () => {
  const noms = ['Rennes', 'Gare de Rennes', 'Ille', 'Parc des Gayeulles', 'Stade de la Route de Lorient', 'Place de la Mairie', 'Un nom extrêmement long de pont sur la Vilaine', 'Métro Villejean'];
  const types = ['gare', 'railway station', 'canal', 'fleuve', 'parc', 'stade', 'place', 'pont', 'musée', '', 'jardin public', 'lycée'];
  for (const name of noms) for (const t of types) for (const type of ['gare', 'parc', 'place', 'stade', 'pont', 'eau', 'edifice']) {
    assert.equal(nomEquipement({ name, types: t, type }), v1.monName({ name, types: t, type, cat: 'equip' }), `${name}|${t}|${type}`);
  }
  assert.equal(nomEquipement({ name: 'Ille', types: 'canal' }), 'canal · Ille');
});

/** Équipements synthétiques à `d` km, cap `c`. */
const equip = (/** @type {string} */ name, /** @type {number} */ d, /** @type {number} */ c, /** @type {any} */ plus = {}) => ({ name, kind: 'monument', cat: 'equip', qid: null, type: 'parc', links: 10, prot: false, htWd: null, htOsm: null, ht: 0, types: '', why: '', ...pointAuCap(POS, d, c), ...plus });
const sceneVide = { pos: POS, terrain: null, cities: [], batiments: [] };

test('équipements urbains : portée par type, plafond de 25, jamais en transparence, calque éteint', () => {
  const liste = [equip('Parc proche', 3, 10), equip('Parc loin', 5.5, 20), equip('Stade', 7, 30, { type: 'stade' }), equip('Stade loin', 8.5, 40, { type: 'stade' }), equip('Place', 4.5, 50, { type: 'place' }), equip('Hors rayon', 40, 60),
    { ...equip('Un monument', 1, 70), cat: 'monument' }];
  for (const toutVoir of [false, true]) {
    const { classes } = classerEquipements(liste, sceneVide, { rayonKm: 30, relief: false, couche: true });
    const par = (/** @type {string} */ n) => classes.find((c) => c.el.name === n);
    assert.deepEqual(['Parc proche', 'Stade'].map((n) => par(n)?.etat), ['net', 'net'], String(toutVoir));
    assert.deepEqual(['Parc loin', 'Stade loin', 'Place'].map((n) => [par(n)?.etat, par(n)?.raison]), [['absent', 'hors de portée de ce type d’équipement'], ['absent', 'hors de portée de ce type d’équipement'], ['absent', 'hors de portée de ce type d’équipement']], 'jamais « transparent »');
    assert.equal(par('Hors rayon'), undefined); assert.equal(par('Un monument'), undefined);
  }
  assert.deepEqual(classerEquipements(liste, sceneVide, { rayonKm: 30, relief: false, couche: false }).classes, []);
  const beaucoup = Array.from({ length: 40 }, (_, i) => equip('Parc ' + i, 1 + i * 0.1, i * 9, { links: 40 - i }));
  const { classes } = classerEquipements(beaucoup, sceneVide, { rayonKm: 30, relief: false, couche: true });
  assert.equal(classes.filter((c) => c.etat === 'net').length, EQUIP_AFFICHES_MAX);
  assert.ok(classes.filter((c) => c.etat === 'absent').every((c) => c.raison === 'au-delà du plafond de noms nets'));
  assert.ok(classes.filter((c) => c.etat === 'net').every((c) => c.el.links >= 16), 'les plus connus d’abord');
});

test('couche des équipements : filtre par nom, une seule bande, regroupement par type', () => {
  const { classes } = classerEquipements([equip('Parc des Gayeulles', 2, 10), equip('Stade Rennais', 3, 20, { type: 'stade' })], sceneVide, { rayonKm: 30, relief: false, couche: true });
  const c = preparerEquipements(classes, {});
  assert.deepEqual([c?.cle, c?.groupePar, c?.rangees, c?.iconeDy, c?.aCote, c?.elements.map((e) => e.icone).sort()], ['eq', 'icone', 2, 17, true, ['parc', 'stade']]);
  assert.equal(preparerEquipements(classes, { filtre: 'gayeulles' })?.elements.length, 1); assert.equal(preparerEquipements(classes, { filtre: 'zzz' }), null);
});

test('pylônes : portée réglée, pastilles d’opérateurs et 5G du groupe', () => {
  const site = (/** @type {number} */ d, /** @type {any} */ p = {}) => ({ name: 'Pylône', icon: 'pylone', kind: /** @type {'telecom'} */ ('telecom'), place: '', ...pointAuCap(POS, d, 30), sup_id: d, anfr: undefined, address: undefined, cp: undefined, height_m: 30, owner: undefined, nature: undefined, nature_code: 21,
    operators: [{ name: 'Orange', systems: [{ generation: '5G' }] }, { name: 'Free' }], ops: [], g5: true, ...p });
  const cl = classerPylones([site(3), site(9)], { pos: POS }, { telecom: true, portee: 8 });
  assert.deepEqual(cl.map((c) => [c.etat, c.raison]), [['net', null], ['absent', 'au-delà de la portée réglée (8 km)']]);
  assert.deepEqual(classerPylones([site(3)], { pos: POS }, { telecom: false, portee: 8 }), []);
  const L = preparerPylones(cl);
  assert.equal(L?.elements.length, 1);
  assert.deepEqual(L?.decorations?.(L.elements), { pastilles: [{ k: 'O', col: '#FF7900' }, { k: 'F', col: '#8C8C8C' }], g5: true });
  assert.equal(preparerPylones([]), null);
});

test('repères hauts : portée, déjà dessiné comme monument, immeuble anonyme réservé à Tout voir, sommet à l’écran', () => {
  const rep = (/** @type {string} */ name, /** @type {number} */ d, /** @type {any} */ p = {}) => ({ name, kind: /** @type {'tour'} */ ('tour'), height_m: 50, named: true, id: null, ess: true, ...pointAuCap(POS, d, 80), ...p });
  const liste = [rep('Tour A', 2), rep('Tour B', 20), rep('Tour C', 3), rep('Immeuble', 4, { kind: 'immeuble', named: false, ess: false })];
  const cl = (/** @type {boolean} */ toutVoir) => classerReperes(liste, { pos: POS }, { reperes: true, portee: 12, toutVoir, doublons: [false, false, true, false] });
  assert.deepEqual(cl(false).map((c) => c.raison), [null, 'au-delà de la portée réglée (12 km)', 'déjà dessiné comme monument', 'Tout voir seulement (ne dépasse pas)']);
  assert.deepEqual(cl(true).map((c) => c.etat), ['net', 'absent', 'absent', 'net']);
  assert.deepEqual(classerReperes(liste, { pos: POS }, { reperes: false, portee: 12, toutVoir: false, doublons: [] }), []);
  assert.equal(angleSommet({ ...liste[0], dist: 2, brg: 80 }, null), null, 'sans relief : posé sur l’horizon');
  const L = preparerReperes(cl(true), null);
  assert.deepEqual([L?.cle, L?.elements.length, L?.elements[0].icone, L?.ancre?.(L.elements[0])], ['bld', 2, 'mat', null]);
});

test('couche personnelle : sites affichés, couleur, sites trouvés', () => {
  const pts = Array.from({ length: 30 }, (_, i) => [...Object.values(pointAuCap(POS, 1 + i, i * 12)).map((v) => +v.toFixed(6)), i % 5 ? 'Site ' + i : 'Relais ' + i, '', [], []]);
  const L = creerCouche({ id: 'z', name: 'Z', color: '#FF8A3D', on: true, max: 10, pts, cols: [], field: '', ignored: 0, added: 1 }, 'relais');
  positionnerCouche(L, POS);
  assert.deepEqual(classerCouche(L).map((c) => c.etat), L.shown.map(() => 'net'));
  assert.ok(L.shown.some((i) => /** @type {number} */ (i.dist) > 10 && i.hl), 'un site trouvé est montré au-delà de la distance réglée');
  const c = preparerCouche(L);
  assert.deepEqual([c?.cle, c?.couleur], ['usr:z', { ligne: 'rgba(255,138,61,0.85)', texte: '#FF8A3D', icone: '#FF8A3D' }]);
  assert.equal(couleurAvecOpacite('#FF8A3D', 0.85), v1.hexA('#FF8A3D', 0.85));
  assert.equal(sitesTrouves([L]).length, L.items.filter((i) => i.hl).length); assert.ok(sitesTrouves([L]).every((s) => s.hl));
  L.on = false; assert.deepEqual(classerCouche(L), []); assert.equal(preparerCouche(L), null); assert.deepEqual(sitesTrouves([L]), []);
});

test('bande : groupes de 28 px au plus d’écart et 64 px de large, pastille du nombre, « 99+ »', () => {
  const serre = [el('Pylône', 150, 2), el('Pylône', 170, 3), el('Pylône', 190, 4)];
  const r1 = composerBande([couche(serre)], vue, nouveauPlaceur(), opt('bas'));
  assert.ok(textes(r1.commandes).includes('3') && textes(r1.commandes).includes('3 pylônes'), 'un groupe : pastille 3 et libellé au pluriel');
  assert.deepEqual(r1.commandes.filter((c) => c.type === 'glyphe').length, 1, 'une seule icône par groupe');
  assert.ok(textes(r1.commandes).includes('2.0–4.0 km'), 'distances min–max');
  const trop = [el('Pylône', 100, 2), el('Pylône', 125, 3), el('Pylône', 150, 4), el('Pylône', 175, 5)]; // 75 px d'étendue > 64
  assert.equal(composerBande([couche(trop)], vue, nouveauPlaceur(), opt('bas')).commandes.filter((c) => c.type === 'glyphe').length, 2);
  const ecart = [el('Pylône', 100, 2), el('Pylône', 140, 3)]; // 40 px > 28
  assert.equal(composerBande([couche(ecart)], vue, nouveauPlaceur(), opt('bas')).commandes.filter((c) => c.type === 'glyphe').length, 2);
  const nom = [el('Pylône', 100, 2), el('Autre', 105, 3)]; // noms différents : pas de regroupement
  assert.equal(composerBande([couche(nom)], vue, nouveauPlaceur(), opt('bas')).commandes.filter((c) => c.type === 'glyphe').length, 2);
  const cent = Array.from({ length: 120 }, (_, i) => el('Pylône', 150 + i * 0.3, 2 + i * 0.01));
  const r2 = composerBande([couche(cent)], vue, nouveauPlaceur(), opt('bas'));
  assert.ok(textes(r2.commandes).includes('99+'), 'au-delà de 99 : « 99+ »');
  assert.ok(r2.commandes.some((c) => c.type === 'texte' && c.texte === '99+' && c.police.startsWith('700 7px')), 'police réduite pour 3 caractères');
});

test('bande : nom à côté de l’icône sous l’horizon, puis dessous avec un fil ; icône seule sans place', () => {
  const eq = (/** @type {any[]} */ elements) => couche(elements, { cle: 'eq', groupePar: 'icone', rangees: 2, iconeDy: 17, tailleK: 0.72, aCote: true, pluriels: PLURIELS_EQUIPEMENTS });
  const un = composerBande([eq([el('Parc des Gayeulles', 200, 2, { icone: 'parc' })])], vue, nouveauPlaceur(), opt('bas'));
  const lead = un.commandes.filter((c) => c.type === 'trait' && c.tirets.length === 0 && c.largeur === 1);
  assert.equal(lead.length, 0, 'nom à côté : aucun fil');
  assert.equal(un.stats.nommes, 1); assert.equal(un.stats.iconeSeule, 0);
  const deux = composerBande([eq([el('Parc des Gayeulles', 200, 2, { icone: 'parc' })])], vue, nouveauPlaceur([[190, 330, 395, 440]]), opt('bas')); // le côté de l'icône est pris
  assert.equal(deux.stats.nommes, 1, 'le nom passe de l’autre côté ou dessous');
  const plein = composerBande([eq([el('Parc des Gayeulles', 200, 2, { icone: 'parc' })])], vue, nouveauPlaceur([[0, W, 400, 780]]), opt('bas'));
  assert.deepEqual([plein.stats.nommes, plein.stats.iconeSeule], [0, 1], 'plus aucune place : l’icône reste, sans nom');
  assert.ok(plein.commandes.some((c) => c.type === 'glyphe'));
});

test('bande : étage haut (au-dessus de l’horizon, 3 lignes), retombée en haut quand Lieux et Monuments sont éteints, site trouvé toujours nommé', () => {
  const noms = Array.from({ length: 12 }, (_, i) => el('Pylône ' + i, 30 + i * 30, 1 + i));
  const haut = composerBande([couche(noms)], vue, nouveauPlaceur(), opt('haut'));
  const ys = haut.commandes.filter((c) => c.type === 'texte' && /Pylône/.test(c.texte)).map((c) => /** @type {any} */ (c).y);
  assert.ok(ys.length > 0 && ys.every((y) => y < 400), 'étage haut : noms au-dessus de l’horizon');
  // bande basse saturée : le nom retombe en haut de l'écran seulement si les calques Lieux et Monuments sont éteints
  const saturee = [[0, W, 400, 780]];
  const un = [el('Relais', 200, 2)];
  assert.equal(composerBande([couche(un)], vue, nouveauPlaceur(saturee.map((r) => r.slice())), opt('bas', { calquesHautActifs: true })).stats.nommes, 0);
  assert.equal(composerBande([couche(un)], vue, nouveauPlaceur(saturee.map((r) => r.slice())), opt('bas', { calquesHautActifs: false })).stats.nommes, 1);
  // site trouvé : nommé même sans aucune place, cartouche jaune
  const trouve = composerBande([couche([el('Relais', 200, 2, { hl: true })])], vue, nouveauPlaceur([[0, W, 60, 780]]), opt('bas'));
  assert.equal(trouve.stats.nommes, 1);
  assert.ok(trouve.commandes.some((c) => c.type === 'remplissage' && c.couleur === 'rgba(14,26,43,.94)') && trouve.commandes.some((c) => c.type === 'trait' && c.couleur === '#FFD23F' && c.largeur === 2.5), 'halo et cartouche jaunes');
});

test('bande : aucun nom n’en recouvre un autre, la mémoire de ligne est réutilisée', () => {
  const r = alea(17), elements = Array.from({ length: 60 }, (_, i) => el('Site ' + i, 10 + r() * 380, 0.5 + r() * 10));
  const placeur = nouveauPlaceur(), memoireLignes = new Map();
  const res = composerBande([couche(elements)], vue, placeur, opt('bas', { memoireLignes }));
  assert.ok(res.stats.nommes > 5 && res.stats.nommes + res.stats.iconeSeule === 60);
  const noms = placeur.reservations.filter((q) => q.length === 4);
  for (let i = 0; i < noms.length; i++) for (let j = i + 1; j < noms.length; j++) assert.ok(!rectangleTouche([noms[j]], noms[i][0], noms[i][1], noms[i][2], noms[i][3], 0), `chevauchement ${i}/${j}`);
  assert.ok(memoireLignes.size > 0);
  const p2 = nouveauPlaceur(), m2 = new Map(memoireLignes), res2 = composerBande([couche(elements)], vue, p2, opt('bas', { memoireLignes: m2 }));
  assert.deepEqual(res2.commandes, res.commandes, 'même image : mêmes commandes avec la mémoire de la précédente');
});

test('pastilles au bord : trois au plus, les plus proches d’abord, côté où tourner', () => {
  const hors = [el('Loin gauche', -3000, 12), el('Droite 1', 5000, 4), el('Droite 2', 6000, 8), el('Droite 3', 7000, 2), el('Visible', 200, 1)].map((e, i) => ({ ...e, brg: [-110, 100, 120, 140, brgDe(200)][i], hl: true }));
  const cmds = pointeursHorsChamp(hors, vue, nouveauPlaceur(), { hy: 400, mesurerTexte, familles });
  const lab = textes(cmds);
  assert.equal(lab.length, 3);
  assert.ok(lab.every((t) => t.endsWith(' ▶')), 'sites à droite : flèche vers la droite');
  assert.ok(lab[0].startsWith('Droite 3') && lab[1].startsWith('Droite 1') && lab[2].startsWith('Droite 2'), `ordre ${lab}`);
  assert.ok(!lab.some((t) => /Visible/.test(t)), 'un site visible est déjà dans la bande');
  const gauche = textes(pointeursHorsChamp([{ ...hors[0], dist: 3 }], vue, nouveauPlaceur(), { hy: 400, mesurerTexte, familles }));
  assert.deepEqual(gauche, ['◀ Loin gauche · 3.0 km']);
});
