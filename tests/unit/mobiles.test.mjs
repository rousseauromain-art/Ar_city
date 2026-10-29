// Avions et bateaux à l'écran : visibilité (champ, courbure de la Terre), regroupement des icônes, noms d'avions, noms de bateaux en escalier (choix des plus proches, pastilles,
// jamais « +1 », aucun fil ne traverse un nom, choix gardé). La parité du dessin avec la v1 est dans tests/e2e/mobiles-v2.spec.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { positionnerMobile, HAUTEUR_NAVIRE_M } from '../../src/scene/mobiles.js';
import { classerMobiles } from '../../src/calques/avions.js';
import { classerNavires } from '../../src/calques/bateaux.js';
import { grouperMobiles, reserverIcones, commandesIcones, composerAvions } from '../../src/rendu/mobiles.js';
import { poserBateaux } from '../../src/rendu/escalier.js';
import { creerPlaceur } from '../../src/rendu/placement.js';
import { rectangleTouche } from '../../src/rendu/reservations.js';
import { alea } from './aide-relief.mjs';

const W = 915, H = 412, vue = { largeurPx: W, hauteurPx: H, capDeg: 0, inclinaisonDeg: 0, roulisDeg: 0, champDeg: 65 };
const fh = (W / 2) / Math.tan((vue.champDeg / 2) * Math.PI / 180);
const brgDe = (/** @type {number} */ x) => Math.atan((x - W / 2) / fh) * 180 / Math.PI;
const mesurerTexte = (/** @type {string} */ _p, /** @type {string} */ t) => t.length * 7;
const familles = { affichage: 'Serif', mono: 'Mono' };
const placeur = (/** @type {any[]} */ reservations = []) => creerPlaceur({ largeurPx: W, hauteurPx: H, limiteHautePx: 62, reservations, memoire: new Map() });
/** Mobile à l'abscisse x (cap 0) et à `dist` km. */
const mob = (/** @type {'plane'|'ship'} */ kind, /** @type {string} */ name, /** @type {number} */ x, /** @type {number} */ dist, /** @type {any} */ plus = {}) => ({ name, kind, id: name, mmsi: name, type: 60, lat: 0, lon: 0, t: 0, dist, brg: brgDe(x), alt: kind === 'plane' ? 3000 : 0, trk: 90, vel: kind === 'plane' ? 200 : 4, ...plus });
/** @param {any[]} cmds @returns {string[]} */
const textes = (cmds) => cmds.flatMap((c) => c.type === 'texte' ? [c.texte] : c.type === 'groupe' ? textes(c.enfants) : []);

test('visibilité d’un mobile : champ, courbure de la Terre, filtre par nom', () => {
  const o = 2; // œil à 2 m
  const ok = positionnerMobile(mob('ship', 'A', 400, 2), vue, o);
  assert.equal(ok.etat, 'net'); assert.ok(Math.abs(ok.x - 400) < 1e-6);
  assert.deepEqual([positionnerMobile(mob('ship', 'A', 400, 2), { ...vue, capDeg: 100 }, o).raison], ['hors du champ']);
  assert.equal(positionnerMobile(mob('ship', 'A', 2000, 2), vue, o).raison, 'hors du champ', 'à plus de 40 px de l’écran');
  assert.equal(positionnerMobile(mob('ship', 'Loin', 400, 40), vue, o).raison, 'masqué par la courbure de la Terre', 'navire de 12 m à 40 km, œil à 2 m');
  assert.equal(positionnerMobile(mob('plane', 'Haut', 400, 40, { alt: 9000 }), vue, o).etat, 'net', 'un avion à 9 000 m se voit à 40 km');
  assert.equal(positionnerMobile(mob('ship', 'Loin', 400, 40), vue, 60).etat, 'net', 'œil à 60 m : le même navire se voit');
  assert.equal(positionnerMobile(mob('ship', 'Éolienne', 400, 2), vue, o, 'zz').raison, 'écarté par la recherche');
  assert.equal(positionnerMobile(mob('ship', 'Éolienne', 400, 2), vue, o, 'eolienne').etat, 'net', 'recherche sans accents');
  assert.ok(HAUTEUR_NAVIRE_M === 12);
  const liste = [mob('plane', 'P', 300, 5), mob('ship', 'S', 500, 1), mob('plane', 'Q', 600, 6)];
  assert.deepEqual(classerMobiles(liste, vue, { oeilM: 2 }, { couche: true }).map((c) => [c.el.name, c.el.ordre]), [['P', 0], ['Q', 2]]);
  assert.deepEqual(classerNavires(liste, vue, { oeilM: 2 }, { couche: true }).map((c) => [c.el.name, c.el.ordre]), [['S', 1]]);
  assert.deepEqual(classerNavires(liste, vue, { oeilM: 2 }, { couche: false }), []);
});

test('regroupement des icônes : même nature, moins de 16 px × 12 px du premier', () => {
  const l = [{ ...mob('ship', 'A', 100, 1), x: 100, y: 200 }, { ...mob('ship', 'B', 110, 1), x: 110, y: 205 }, { ...mob('ship', 'C', 120, 1), x: 120, y: 205 }, { ...mob('plane', 'D', 101, 1), x: 101, y: 201 }, { ...mob('ship', 'E', 100, 1), x: 100, y: 215 }];
  const g = grouperMobiles(l);
  assert.deepEqual(g.map((x) => x.items.map((i) => i.m.name)), [['A', 'B'], ['C'], ['D'], ['E']], 'C est à 20 px du premier (A), D est un avion, E à 15 px en ordonnée');
  const res = /** @type {any[]} */ ([]);
  reserverIcones(g, res);
  assert.equal(res.length, 5); assert.deepEqual(res[0].slice(0, 4), [91, 109, 191, 209]); assert.equal(res[0][5], g[0]);
});

test('icônes : flèche d’avion, pentagone pivoté au cap et coloré par catégorie, rond à l’arrêt', () => {
  const g = grouperMobiles([{ ...mob('plane', 'P', 100, 1, { trk: 90 }), x: 100, y: 100 }, { ...mob('ship', 'N', 300, 1, { type: 70, vel: 5, trk: 180 }), x: 300, y: 200 }, { ...mob('ship', 'Q', 500, 1, { type: 36, vel: 0 }), x: 500, y: 200 }]);
  const c = commandesIcones(g, { ...vue, capDeg: 30 });
  assert.equal(c.length, 4, 'avion, navire en route, et le rond d’un navire à l’arrêt (contour puis remplissage)');
  const a = /** @type {any} */ (c[0]), n = /** @type {any} */ (c[1]), q = /** @type {any} */ (c[2]);
  assert.deepEqual([a.type, a.x, a.y, a.angleRad], ['groupe', 100, 100, 60 * Math.PI / 180]); assert.equal(a.enfants[1].couleur, '#8FD3FF'); assert.equal(a.enfants[0].chemin.length, 5);
  assert.equal(n.enfants[1].couleur, '#79C76B'); assert.equal(n.enfants[0].chemin.length, 6); assert.ok(Math.abs(n.angleRad - 150 * Math.PI / 180) < 1e-12);
  assert.deepEqual([q.type, q.largeur, q.chemin[0], c[3].type, /** @type {any} */ (c[3]).couleur], ['trait', 2, ['A', 500, 200, 4.5], 'remplissage', '#D45AD6'], 'à l’arrêt : un rond, contour d’abord puis couleur de la catégorie');
});

test('noms d’avions : incliné, groupe serré un nom chacun puis « NOM +N », places rendues si le groupe ne tient pas', () => {
  const un = grouperMobiles([{ ...mob('plane', 'AF1234', 400, 20, { alt: 3048 }), x: 400, y: 200 }]);
  const p1 = placeur();
  const r1 = composerAvions(un, p1, { mesurerTexte, familles, distances: true });
  assert.deepEqual(textes(r1.commandes), ['AF1234', '10000 ft · 20 km']); assert.ok(r1.commandes.some((c) => c.type === 'groupe'), 'nom incliné');
  assert.equal(r1.zones.length, 1);
  const serre = grouperMobiles([0, 1, 2].map((i) => ({ ...mob('plane', 'AF10' + i, 400 + i * 3, 20 + i * 0.1, { alt: 3000 }), x: 400 + i * 3, y: 200 + i })));
  assert.equal(serre.length, 1);
  const place = composerAvions(serre, placeur(), { mesurerTexte, familles, distances: false });
  assert.deepEqual(textes(place.commandes).filter((t) => /^AF/.test(t)).length, 3, 'tout tient : un nom par avion');
  // plus de place nulle part : un seul nom « NOM +2 » ... ou rien, mais les places réservées par les essais sont rendues
  const res = /** @type {any[]} */ ([[0, W, 62, H]]);
  const plein = placeur(res), avant = res.length;
  const r3 = composerAvions(serre, plein, { mesurerTexte, familles, distances: false });
  assert.deepEqual(r3.commandes, []); assert.equal(res.length, avant, 'aucune réservation laissée par les essais');
});

const eclat = (/** @type {number} */ n, /** @type {number} */ graine = 5) => { const r = alea(graine); return Array.from({ length: n }, (_, i) => { const x = 40 + r() * (W - 80), y = 215 + r() * 20; return { m: /** @type {any} */ (mob('ship', 'BATEAU ' + i, x, 0.3 + i * 0.1, { mmsi: 'm' + i, vel: i % 3 ? 0 : 4 })), x, y, g: { i } }; }); };

test('bateaux en escalier : les plus proches nommés d’abord, aucun nom ne recouvre un autre, pastilles jamais « +1 »', () => {
  const bateaux = eclat(60);
  const res = /** @type {any[]} */ ([]);
  for (const b of bateaux) res.push([b.x - 9, b.x + 9, b.y - 9, b.y + 9, null, b.g]);
  const estIcone = (/** @type {any} */ r) => bateaux.some((b) => b.g === r[5]);
  const e = poserBateaux({ bateaux, vue, reservations: res, estIcone, mesurerTexte, familles, maintenantMs: 1000, choix: { ids: null }, distances: true });
  assert.ok(e.nommes > 3 && e.nommes <= 30, `${e.nommes} nommés`);
  const nommes = [...(e.choix.ids || new Map()).keys()], proches = bateaux.slice().sort((a, b) => a.m.dist - b.m.dist).slice(0, 3).map((b) => b.m.mmsi);
  assert.ok(proches.every((m) => nommes.includes(/** @type {string} */ (m))), 'les trois plus proches sont nommés');
  const pastilles = e.commandes.filter((/** @type {any} */ c) => c.type === 'texte' && /^\+\d+$/.test(c.texte)).map((/** @type {any} */ c) => +c.texte.slice(1));
  assert.ok(pastilles.length > 0 && pastilles.every((n) => n >= 2), `pastilles ${pastilles}`);
  const noms = res.filter((r) => r.length === 4 && r[3] - r[2] === 19); // cadres des noms posés (13 px de corps + 6)
  assert.equal(noms.length, e.nommes);
  for (let i = 0; i < noms.length; i++) for (let j = i + 1; j < noms.length; j++) assert.ok(!rectangleTouche([noms[j]], noms[i][0], noms[i][1], noms[i][2], noms[i][3], 0), `chevauchement ${i}/${j}`);
  assert.ok(e.zones.length >= bateaux.length - pastilles.reduce((a, n) => a + n, 0) - 1);
});

test('bateaux : aucun fil ne traverse le nom d’un autre bateau', () => {
  for (const graine of [1, 2, 3, 4]) {
    const bateaux = eclat(25, graine), res = /** @type {any[]} */ ([]);
    for (const b of bateaux) res.push([b.x - 9, b.x + 9, b.y - 9, b.y + 9, null, b.g]);
    const e = poserBateaux({ bateaux, vue, reservations: res, estIcone: (r) => bateaux.some((b) => b.g === r[5]), mesurerTexte, familles, maintenantMs: 1, choix: { ids: null }, distances: false });
    const fils = /** @type {any[]} */ (e.commandes.filter((c) => c.type === 'trait' && c.alpha === 0.7)), noms = e.zones.filter((z) => z.poly);
    assert.equal(fils.length, noms.length, 'un fil par nom');
    fils.forEach((f, i) => {
      const [[x0, y0], [x1, y1]] = f.chemin.map((/** @type {any[]} */ o) => [o[1], o[2]]);
      if (x0 !== x1) return; // fil légèrement penché (bateaux à couple, décalage ≤ 18 px) : la v1 ne garantit que l’abscisse d’arrivée
      noms.forEach((z, k) => {
        if (k === i) return;
        const [[nx0, ny0], , [nx1, ny1]] = /** @type {number[][]} */ (z.poly);
        for (let t = 0; t <= 1; t += 0.02) {
          const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
          assert.ok(!(x > nx0 + 1 && x < nx1 - 1 && y > ny0 + 1 && y < ny1 - 1), `le fil ${i} traverse le nom ${k} (graine ${graine})`);
        }
      });
    });
  }
});

test('bateaux : choix gardé 0,4 s (même résultat), refait au-delà ou si la vue tourne de plus de 2°, mauvaise disposition impossible', () => {
  const bateaux = eclat(30, 9);
  const lancer = (/** @type {any} */ choix, /** @type {number} */ t, /** @type {any} */ v = vue) => { const res = /** @type {any[]} */ ([]); for (const b of bateaux) res.push([b.x - 9, b.x + 9, b.y - 9, b.y + 9, null, b.g]);
    return poserBateaux({ bateaux, vue: v, reservations: res, estIcone: (r) => bateaux.some((b) => b.g === r[5]), mesurerTexte, familles, maintenantMs: t, choix, distances: true }); };
  const a = lancer({ ids: null }, 1000);
  const b = lancer(a.choix, 1100), c = lancer(a.choix, 1300), d = lancer(a.choix, 1300, { ...vue, capDeg: 1 }), e = lancer(a.choix, 1300, { ...vue, capDeg: 5 }), f = lancer(a.choix, 1500);
  assert.deepEqual(b.commandes, a.commandes); assert.equal(b.choix, a.choix, 'moins de 150 ms : choix conservé tel quel');
  assert.equal(c.choix, a.choix, '300 ms, vue immobile : conservé'); assert.equal(d.choix, a.choix, 'rotation de 1° : conservé');
  assert.notEqual(e.choix, a.choix, 'rotation de 5° : refait'); assert.equal(e.choix.t, 1300);
  assert.notEqual(f.choix, a.choix, 'plus de 0,4 s : refait'); assert.deepEqual(f.commandes, a.commandes, 'même scène : même résultat');
  const vide = lancer({ ids: null }, 1);
  assert.ok(vide.nommes > 0);
  assert.equal(poserBateaux({ bateaux: [], vue, reservations: [], estIcone: () => false, mesurerTexte, familles, maintenantMs: 1, choix: { ids: null }, distances: true }).nommes, 0);
});
