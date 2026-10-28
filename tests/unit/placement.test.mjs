// Placement des noms : parité avec placeSlanted / placeFlat de la v1 (extraits du fichier), sur des scènes tirées au hasard ; règles communes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { creerPlaceur, PAS_LIGNE_PX, LIGNES_MAX, MEMOIRE_MAX } from '../../src/rendu/placement.js';
import { composerEtiquettes } from '../../src/rendu/etiquettes.js';
import { reservationsInterface } from '../../src/rendu/reservations.js';
import { dessiner } from '../../src/rendu/canvas.js';
import { alea } from './aide-relief.mjs';

const src = readFileSync(new URL('../../v1/villes-horizon.html', import.meta.url), 'utf8');
/** @param {string} debut @param {string} fin Extrait de `debut` jusqu'à `fin` EXCLU. */
const avant = (debut, fin) => { const i = src.indexOf(debut), j = src.indexOf(fin, i); assert.ok(i >= 0 && j > i, `introuvable : ${debut}`); return src.slice(i, j); };
const corps = `${avant('function polysOverlap(P,Q,m){', '// badge "+N" du bouton oeil')}
const LBL_STEP=10;
${avant('const rectHit=(x0,x1,y0,y1,m,own)=>{', 'const inView=c=>')}
const ANG_LBL=45*D, cAL=Math.cos(ANG_LBL), sAL=Math.sin(ANG_LBL);
${avant('function placeSlanted(o){', '// PENDANT HORIZONTAL, GENERIQUE')}
${avant('function placeFlat(o){', "// angles d'un monument")}
return {placeSlanted,placeFlat,placed};`;
/** Fabrique le placeur de la v1 pour un écran et des réservations donnés. */
const placeurV1 = new Function('D', 'W', 'H', 'topLimit', 'placed', 'lblMem', 'maxLanes', corps);

/** @param {number} W @param {number} H @param {number[][]} initial */
function paires(W, H, initial, memoire = new Map()) {
  const topLimit = 38 + 24, lblMem = new Map();
  const placedV1 = initial.map((r) => r.slice());
  const v1 = placeurV1(Math.PI / 180, W, H, topLimit, placedV1, lblMem, LIGNES_MAX);
  const v2 = creerPlaceur({ largeurPx: W, hauteurPx: H, limiteHautePx: topLimit, reservations: /** @type {any} */ (initial.map((r) => r.slice())), memoire });
  return { v1, v2, lblMem, memoire, placedV1 };
}

test('placement : noms inclinés identiques à la v1, mémoire d’une image à l’autre comprise', () => {
  const r = alea(17);
  for (let scene = 0; scene < 25; scene++) {
    const W = 400 + Math.round(r() * 600), H = 380 + Math.round(r() * 500);
    const initial = [[0, 120, H - 70, H], [W - 80, W, 60, 400], [W / 2 - 60, W / 2 + 60, H - 90, H - 40]];
    const { v1, v2, lblMem, memoire } = paires(W, H, initial);
    for (let image = 0; image < 2; image++) { // la 2e image retente d'abord la place de la 1re
      const demandes = Array.from({ length: 30 }, (_, i) => ({ x: r() * W, base: H * 0.25 + r() * H * 0.5, off: 10, lift: 18, len: 40 + r() * 160, padTop: 14 + Math.round(r() * 6), padBot: 3, side: r() < 0.5 ? -1 : 1, own: { i }, memKey: 'n' + (i % 22) }));
      if (image === 1) { v1.placed.length = 3; v2.reservations.length = 3; }
      for (const d of demandes) assert.deepEqual(v2.placerIncline(d), v1.placeSlanted(d), `scène ${scene} image ${image}`);
      assert.deepEqual(v2.reservations, v1.placed); assert.deepEqual([...memoire], [...lblMem]);
    }
  }
});

test('placement : noms à plat identiques à la v1 (côté, ligne, fil vertical)', () => {
  const r = alea(23);
  let places = 0, refus = 0;
  for (let scene = 0; scene < 25; scene++) {
    const W = 360 + Math.round(r() * 700), H = 400 + Math.round(r() * 400);
    const { v1, v2 } = paires(W, H, [[0, 100, H - 60, H], [W - 100, W, H - 60, H]]);
    for (let i = 0; i < 40; i++) {
      const d = { x: 20 + r() * (W - 40), y0: 80 + r() * (H - 160), halfW: 6 + r() * 6, w: 30 + r() * 150, size: 11 + Math.round(r() * 6), own: { i }, dir: r() < 0.7 ? -1 : 1, maxK: r() < 0.5 ? undefined : 4, anchorY: r() < 0.5 ? null : r() * H, sides: r() < 0.3 ? [-1, 1] : undefined };
      const a = v2.placerAPlat(d), b = v1.placeFlat(d);
      assert.deepEqual(a, b); if (a) places++; else refus++;
    }
    assert.deepEqual(v2.reservations, v1.placed);
  }
  assert.ok(places > 100 && refus > 10, `le tirage doit mêler places et refus (${places}/${refus})`);
});

test('placement : rien au-dessus de la limite haute ni sous les boutons du bas', () => {
  const W = 400, H = 600, ui = reservationsInterface([{ left: 0, right: 400, top: 540, bottom: 600 }]);
  const p = creerPlaceur({ largeurPx: W, hauteurPx: H, limiteHautePx: 62, reservations: ui, memoire: new Map() });
  for (let i = 0; i < 60; i++) {
    const res = p.placerIncline({ x: 100 + (i % 7) * 40, base: 530, off: 10, lift: 18, len: 120, padTop: 16, padBot: 3, side: 1, own: i, memKey: 'k' + i });
    if (!res) continue;
    const poly = /** @type {any} */ (p.reservations.at(-1))[4], ys = poly.map((/** @type {number[]} */ pt) => pt[1]);
    assert.ok(Math.min(...ys) >= 62, 'jamais au-dessus de la limite'); assert.ok(Math.max(...ys) <= 540 + 6, 'jamais sous le bandeau des boutons');
  }
  assert.ok(MEMOIRE_MAX > 0 && PAS_LIGNE_PX === 10);
});

test('placement : la mémoire est vidée au-delà de 3000 entrées', () => {
  const m = new Map(Array.from({ length: MEMOIRE_MAX + 1 }, (_, i) => ['k' + i, { side: 1, k: 0 }]));
  creerPlaceur({ largeurPx: 100, hauteurPx: 100, limiteHautePx: 0, reservations: [], memoire: m });
  assert.equal(m.size, 0);
});

/** Faux contexte qui note les appels. */
function fauxContexte() {
  /** @type {any[]} */
  const appels = [];
  const ctx = new Proxy({}, { get: (_t, nom) => (nom === 'measureText' ? (/** @type {string} */ t) => ({ width: t.length * 6 }) : (/** @type {any[]} */ ...a) => { appels.push([String(nom), ...a]); }), set: (_t, nom, v) => { appels.push(['=' + String(nom), v]); return true; } });
  return { ctx: /** @type {any} */ (ctx), appels };
}

test('étiquettes : un nom net, un fantôme pointillé, comptes, rejeu sur un contexte', () => {
  const placeur = creerPlaceur({ largeurPx: 500, hauteurPx: 400, limiteHautePx: 60, reservations: [], memoire: new Map() });
  const mesurerTexte = (/** @type {string} */ _p, /** @type {string} */ t) => t.length * 7;
  const base = { proprietaire: null, detail: '12 m · 3.4 km', taille: 16, y: 250, teinte: '243,233,210', decalage: 10, elevation: 18 };
  const r = composerEtiquettes([{ ...base, cle: 'a', texte: 'Rennes', x: 100, opacite: 1, fantome: false }, { ...base, cle: 'b', texte: 'Dinard', x: 400, opacite: 0.4, fantome: true, detail: '' }], placeur, { mesurerTexte, familles: { affichage: 'Serif', mono: 'Mono' } });
  assert.deepEqual(r.comptes, { eligibles: 2, affichees: 1, fantomes: 1, sansPlace: 0, fantomesVus: 1 });
  const [fil1, point1, nom1, fil2] = r.commandes;
  assert.deepEqual(/** @type {any} */ (fil1).tirets, []); assert.deepEqual(/** @type {any} */ (fil2).tirets, [2, 3]);
  assert.deepEqual(/** @type {any} */ (point1).chemin, [['A', 100, 250, 2.4]]);
  assert.equal(/** @type {any} */ (nom1).enfants.length, 2); // nom + détail
  assert.equal(/** @type {any} */ (r.commandes[5]).enfants.length, 1); // le fantôme n'a pas de détail ici
  const { ctx, appels } = fauxContexte();
  dessiner(ctx, r.commandes);
  const noms = appels.map((a) => a[0]);
  assert.ok(noms.includes('strokeText') && noms.includes('fillText') && noms.includes('save') && noms.includes('restore') && noms.includes('arc'));
  assert.deepEqual(appels.find((a) => a[0] === 'arc')?.slice(1), [100, 250, 2.4, 0, 7]);
});

test('étiquettes : faute de place le nom est compté, jamais dessiné', () => {
  const placeur = creerPlaceur({ largeurPx: 300, hauteurPx: 300, limiteHautePx: 250, reservations: [], memoire: new Map() });
  const r = composerEtiquettes([{ cle: 'a', proprietaire: null, texte: 'Trop haut', detail: '', taille: 16, x: 150, y: 260, opacite: 1, teinte: '1,2,3', fantome: false, decalage: 10, elevation: 18 }], placeur, { mesurerTexte: () => 50, familles: { affichage: 'a', mono: 'b' } });
  assert.deepEqual(r.comptes, { eligibles: 1, affichees: 0, fantomes: 0, sansPlace: 1, fantomesVus: 0 }); assert.deepEqual(r.commandes, []);
});
