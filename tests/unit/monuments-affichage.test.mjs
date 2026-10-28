// Monuments (affichage) : liste commune, classement, icônes et pose des noms — parité avec le code de la v1 extrait de son fichier, puis règles.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { villeDense, hauteurApparenteDeg, scoreMonument, comparateurAffichage, assemblerListe, dedoublonner, ordonnerEtiquettes, PRIORITE } from '../../src/scene/liste-affichage.js';
import { classerMonuments, preparerMonuments, nomMonument, nomsDeLieux, hauteurIcone, NOMS_NETS_MAX, PROCHES_TOUJOURS_NETS } from '../../src/calques/monuments.js';
import { cleSilhouette, cheminsGlyphe, commandeGlyphe, commandesSilhouetteMonument, SILHOUETTES, SILHOUETTES_DISTINCTES, HAUTEUR_GLYPHE } from '../../src/rendu/icones.js';
import { composerEtiquettes } from '../../src/rendu/etiquettes.js';
import { creerPlaceur } from '../../src/rendu/placement.js';
import { dessiner } from '../../src/rendu/canvas.js';
import { pointAuCap } from '../../src/noyau/geo.js';
import { alea, terrainSynthetique } from './aide-relief.mjs';

const src = readFileSync(new URL('../../v1/villes-horizon.html', import.meta.url), 'utf8');
/** @param {string} debut @param {string} fin Extrait de `debut` jusqu'à `fin` EXCLU. */
const avant = (debut, fin) => { const i = src.indexOf(debut), j = src.indexOf(fin, i); assert.ok(i >= 0 && j > i, `introuvable : ${debut}`); return src.slice(i, j); };
const POS = { lat: 48.6459, lon: -2.0281 };
const v1 = new Function('D', 'cities', 'monumentSites', 'buildingSites', 'citiesVer', 'pos', `
const norm=t=>String(t).toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'');
const SETTLE=new Set(['city','town','village','hamlet','isolated_dwelling']);
const EQ_SHORT=[], EQ_HAS=/^$/;
${avant('const MON_MINOR_H=12', '\n', )}
${avant('const CANOPY_H=20', 'function visibleCities(){')}
${avant('const _nmMemo=new WeakMap();', 'let shipSel=')}
${avant('const SPR={', 'function drawSprite(')}
return {urbanDense,monVisAng,monScore,monName,monSpriteKey,SPR};`);

/** Monument synthétique. */
const mon = (/** @type {string} */ name, /** @type {number} */ distKm, /** @type {number} */ cap, /** @type {any} */ o = {}) => /** @type {any} */ ({ name, kind: /** @type {'monument'} */ ('monument'), cat: /** @type {'monument'} */ ('monument'), qid: null, type: 'clocher', links: 5, prot: false, htWd: null, htOsm: null, ht: 40, types: '', why: '', ...pointAuCap(POS, distKm, cap), ...o });

test('liste commune : formules identiques à la v1 (distances calculées comme recompute)', async () => {
  const { distanceEtCap } = await import('../../src/noyau/geo.js');
  const r = alea(3);
  let denses = 0;
  for (let i = 0; i < 300; i++) {
    const pos = { lat: 48 + r() * 2, lon: -2 + r() * 2 };
    const avecDist = (/** @type {any} */ o) => { const d = distanceEtCap(pos, o); return { ...o, dist: d.distKm, brg: d.capDeg }; };
    const cities = Array.from({ length: 6 }, (_, k) => avecDist({ name: 'V' + k, kind: ['city', 'town', 'village'][k % 3], pop: r() < 0.5 ? 200000 : 5000, ...pointAuCap(pos, r() * 12, r() * 360) }));
    const monuments = Array.from({ length: Math.floor(r() * 60) }, (_, k) => avecDist(mon('M' + k, 1, 0, { src: r() < 0.2 ? 'osms' : undefined, cat: r() < 0.1 ? 'equip' : 'monument', ht: r() < 0.2 ? 0 : 10 + r() * 90, links: Math.floor(r() * 120), ...pointAuCap(pos, r() * 3, r() * 360) })));
    const batiments = Array.from({ length: Math.floor(r() * 25) }, () => avecDist({ kind: r() < 0.7 ? 'immeuble' : 'tour', ...pointAuCap(pos, r() * 5, r() * 360) }));
    const M = v1(Math.PI / 180, cities, monuments, batiments, 0, pos);
    const dense = villeDense({ pos, cities, monuments, batiments });
    assert.equal(dense, M.urbanDense()); if (dense) denses++;
    for (const m of monuments) {
      assert.ok(Object.is(hauteurApparenteDeg(m, dense), M.monVisAng(m)), 'hauteur apparente');
      assert.ok(Object.is(scoreMonument(m, dense), M.monScore(m)), 'score');
    }
  }
  assert.ok(denses > 30 && denses < 270, `le tirage doit mêler villes denses et non (${denses})`);
});

test('noms de monuments et clés de silhouette identiques à la v1', () => {
  const cities = [{ name: 'Rennes', kind: 'city' }, { name: 'Saint-Malo', kind: 'town' }, { name: 'Dinan', kind: 'village' }, { name: 'Phare', kind: 'lighthouse' }];
  const M = v1(Math.PI / 180, cities, [], [], 0, POS), lieux = nomsDeLieux(cities);
  for (const name of ['Cathédrale Saint-Pierre de Rennes', 'Église Saint-Vincent de Saint-Malo', 'Château de Dinan', 'Porte de Phare', 'Tour', 'Un très long nom de monument qui dépasse largement les vingt-huit caractères', 'Basilique d’Argenteuil', 'Rempart du Sillon à Saint-Malo', 'Tour Eiffel', 'Arc de Triomphe de l’Étoile', 'Notre-Dame de Paris', 'Tour Montparnasse']) {
    assert.equal(nomMonument({ name }, lieux), M.monName({ name, cat: 'monument' }), name);
    assert.equal(cleSilhouette({ name, type: 'tour' }), M.monSpriteKey({ name, type: 'tour' }), name);
  }
  assert.equal(cleSilhouette({ name: 'x', qid: 'Q243', type: 'musee' }), 'eiffel'); assert.equal(cleSilhouette({ name: 'x', type: 'inconnu' }), 'musee');
  assert.deepEqual(Object.keys(SILHOUETTES).sort(), Object.keys(M.SPR).sort()); assert.deepEqual(SILHOUETTES.eiffel, M.SPR.eiffel);
  assert.ok(SILHOUETTES_DISTINCTES.has('eiffel') && !SILHOUETTES_DISTINCTES.has('musee'));
  assert.equal(hauteurIcone({ dist: 0.3, links: 5 }), 18); assert.equal(hauteurIcone({ dist: 0.3, links: 90 }), 22); assert.ok(hauteurIcone({ dist: 15, links: 5 }) < 18);
});

test('icônes : 23 pictogrammes, chemins fermés, silhouettes à l’échelle', () => {
  assert.equal(Object.keys(HAUTEUR_GLYPHE).length, 23);
  for (const type of Object.keys(HAUTEUR_GLYPHE)) {
    const g = cheminsGlyphe(type, 20);
    assert.ok(g.fill || g.stroke, type);
    for (const ops of [g.fill, g.fill2, g.stroke]) if (ops) assert.ok(ops.length > 0 && ops[0][0] !== 'Z', type);
  }
  assert.ok(cheminsGlyphe('inconnu', 16).stroke, 'type inconnu : antenne'); // repli de la v1
  assert.deepEqual(cheminsGlyphe('tour', 16).fill?.at(-1), ['Z']);
  assert.deepEqual(cheminsGlyphe('arc', 16).evenodd, true);
  const g = commandeGlyphe('clocher', 100, 200, 18, 'rgb(1,2,3)', 0.5);
  assert.deepEqual([g.type, g.x, g.y, g.alpha, g.couleur], ['glyphe', 100, 200, 0.5, 'rgb(1,2,3)']);
  const sil = commandesSilhouetteMonument('eiffel', 300, 100, 300, 0.26, 0.95);
  assert.equal(sil.length, 4); // remplissage, deux traits, détails
  const xs = /** @type {any} */ (sil[0]).chemin.filter((/** @type {any[]} */ o) => o[0] === 'L' || o[0] === 'M').map((/** @type {any[]} */ o) => o[1]);
  assert.ok(Math.abs((Math.max(...xs) - Math.min(...xs)) - 0.38 * 200) < 1, 'largeur = rapport réel × hauteur à l’écran');
  assert.equal(/** @type {any} */ (sil[0]).regle, 'evenodd');
  assert.equal(commandesSilhouetteMonument('colonne', 0, 0, 100, 1, 1).length, 3, 'sans détails : trois commandes');
});

/** Scène synthétique sans relief. */
const scene = (/** @type {object} */ o = {}) => ({ pos: POS, terrain: null, analysePhoto: null, maintenantMs: 0, cities: [], batiments: [], ...o });
const rg = (/** @type {object} */ o = {}) => ({ rayonKm: 60, relief: false, toutVoir: false, analyseActive: false, couche: true, ...o });

test('classement : visible d’ici (angle apparent), maisons, statues de près, hors rayon et équipements', () => {
  const lignes = [mon('Grande tour', 3, 10, { ht: 80 }), mon('Petit lointain', 40, 20, { ht: 12 }), mon('Célèbre lointain', 40, 30, { ht: 40, links: 90 }), mon('Maison', 0.5, 40, { type: 'maison', ht: 30, links: 3 }),
    mon('Maison protégée', 0.5, 45, { type: 'maison', ht: 30, links: 3, prot: true }), mon('Statue', 1.0, 50, { src: 'osms', ht: 8 }), mon('Statue proche', 0.2, 55, { src: 'osms', ht: 8 }), mon('Hors rayon', 80, 60), { ...mon('Stade', 1, 70), cat: 'equip', type: 'stade' }];
  const { classes } = classerMonuments(lignes, scene(), rg({ toutVoir: true }));
  const par = (/** @type {string} */ n) => classes.find((c) => c.el.name === n);
  assert.equal(par('Grande tour')?.etat, 'net'); assert.equal(par('Petit lointain')?.etat, 'transparent'); assert.equal(par('Petit lointain')?.raison, 'trop petit vu d’ici ou peu connu');
  assert.equal(par('Célèbre lointain')?.etat, 'net', 'très célèbre : seuil abaissé'); assert.equal(par('Maison')?.etat, 'transparent'); assert.equal(par('Maison protégée')?.etat, 'net');
  assert.equal(par('Statue'), undefined, 'statue à plus de 800 m écartée'); assert.equal(par('Statue proche')?.etat, 'net');
  assert.equal(par('Hors rayon'), undefined); assert.equal(par('Stade'), undefined, 'équipements : étape 7');
  assert.equal(classerMonuments(lignes, scene(), rg()).classes.find((c) => c.el.name === 'Petit lointain')?.etat, 'absent');
});

test('classement : plafond de 40 noms nets, les 15 plus proches toujours nets', () => {
  const r = alea(6), lignes = Array.from({ length: 120 }, (_, i) => mon('M' + i, 1.2 + r() * 20, i * 3, { ht: 60, links: 5 + (i % 40) }));
  const proches = Array.from({ length: 20 }, (_, i) => mon('P' + i, 0.2 + i * 0.05, 200 + i * 7, { ht: 30, links: 1 }));
  const { classes } = classerMonuments([...lignes, ...proches], scene(), rg({ toutVoir: true }));
  const nets = classes.filter((c) => c.etat === 'net');
  const proc = classes.filter((c) => c.el.near);
  assert.ok(nets.length <= NOMS_NETS_MAX + PROCHES_TOUJOURS_NETS && nets.length >= NOMS_NETS_MAX - 5, `nets ${nets.length}`);
  assert.equal(nets.length - proc.length, NOMS_NETS_MAX - classes.filter((c) => c.el.occBy && !c.el.cap).length * 0 - (NOMS_NETS_MAX - (nets.length - proc.length)), 'hors proches : au plus 40');
  assert.ok(nets.length - proc.length <= NOMS_NETS_MAX);
  assert.ok(proc.length >= PROCHES_TOUJOURS_NETS - 3 && proc.length <= PROCHES_TOUJOURS_NETS); assert.ok(proc.every((c) => c.el.name.startsWith('P') && c.etat === 'net'));
  const ecartes = classes.filter((c) => c.el.cap); assert.ok(ecartes.length > 50 && ecartes.every((c) => c.raison === 'au-delà du plafond de noms nets' || c.el.occBy));
  assert.ok(classes.filter((c) => c.etat === 'net').every((c) => c.el.rang === null || c.el.rang <= NOMS_NETS_MAX));
});

test('classement : un monument derrière un monument plus proche et plus haut est caché (raison)', () => {
  const lignes = [mon('Campanile', 0.3, 100, { ht: 85, type: 'clocher', links: 30 }), mon('Église derrière', 0.9, 100.2, { ht: 30, type: 'clocher', links: 50 }), mon('Église à côté', 0.9, 160, { ht: 30, type: 'clocher', links: 50 })];
  const { classes } = classerMonuments(lignes, scene(), rg({ toutVoir: true }));
  const e = classes.find((c) => c.el.name === 'Église derrière');
  assert.deepEqual([e?.etat, e?.raison, e?.el.occBy], ['transparent', 'caché par un monument devant : Campanile', 'Campanile']);
  assert.equal(classes.find((c) => c.el.name === 'Église à côté')?.etat, 'net');
  assert.equal(classes.find((c) => c.el.name === 'Campanile')?.etat, 'net');
});

test('classement : ville dense → monuments sous les toits en transparence, sauf très célèbres', () => {
  const cities = [{ name: 'Metropole', kind: 'city', pop: 500000, ...pointAuCap(POS, 2, 0) }];
  const lignes = [mon('Bas', 0.8, 10, { ht: 12 }), mon('Bas célèbre', 0.8, 20, { ht: 12, links: 100 }), mon('Haut', 0.8, 30, { ht: 60 }), mon('Bas tout près', 0.2, 40, { ht: 12 })];
  const { classes, dense } = classerMonuments(lignes, scene({ cities }), rg({ toutVoir: true }));
  assert.equal(dense, true);
  const par = (/** @type {string} */ n) => classes.find((c) => c.el.name === n);
  assert.deepEqual([par('Bas')?.etat, par('Bas')?.raison], ['transparent', 'plus bas que les toits (ville dense)']);
  assert.equal(par('Bas célèbre')?.etat, 'net'); assert.equal(par('Haut')?.etat, 'net'); assert.equal(par('Bas tout près')?.el.roof, false);
  assert.equal(classerMonuments(lignes, scene(), rg()).dense, false);
});

test('classement : règle de la photo — vu sur la photo ressuscite un monument sous les toits ; objet proche → fantôme ; calage lissé', () => {
  const cities = [{ name: 'Metropole', kind: 'city', pop: 500000, ...pointAuCap(POS, 2, 0) }];
  const lignes = [mon('Bas', 0.8, 100, { ht: 12 }), mon('Haut caché', 3, 120, { ht: 50, links: 20 })];
  const mur = (/** @type {number} */ a) => ({ ok: true, t: 1000, cols: Array.from({ length: 120 }, (_, i) => ({ brg: 80 + i * 0.4, a })) });
  const base = { ...scene({ cities }), maintenantMs: 2000 };
  const vu = classerMonuments(lignes, { ...base, analysePhoto: mur(-3) }, rg({ toutVoir: true, analyseActive: true }));
  assert.equal(vu.classes.find((c) => c.el.name === 'Bas')?.etat, 'net', 'sommet au-dessus de la silhouette lue : affiché malgré les toits');
  const cache = classerMonuments(lignes, { ...base, analysePhoto: mur(15) }, rg({ toutVoir: true, analyseActive: true }));
  const h = cache.classes.find((c) => c.el.name === 'Haut caché');
  assert.deepEqual([h?.etat, h?.raison], ['transparent', 'caché sur la photo']);
  const sans = classerMonuments(lignes, { ...base, analysePhoto: mur(15), maintenantMs: 1000 + 6000 }, rg({ toutVoir: true, analyseActive: true }));
  assert.equal(sans.classes.find((c) => c.el.name === 'Haut caché')?.el.photoHid, false, 'analyse périmée : règle ignorée');
  // calage de pointe : la valeur de l'image précédente est lissée (60 % ancien + 40 % nouveau)
  const pointe = { ok: true, t: 1000, cols: Array.from({ length: 41 }, (_, i) => ({ brg: 99 + i * 0.05, a: i >= 18 && i <= 22 ? 6 : 1 })) };
  const a = classerMonuments([mon('Pointe', 3, 100.05, { ht: 200, links: 30 })], { ...base, analysePhoto: pointe }, rg({ analyseActive: true }));
  const b = classerMonuments([mon('Pointe', 3, 100.05, { ht: 200, links: 30 })], { ...base, analysePhoto: pointe, snapPrecedent: a.snapSuivant }, rg({ analyseActive: true }));
  const s1 = a.classes[0].el.snapDB, s2 = b.classes[0].el.snapDB;
  assert.ok(Math.abs(s2 - (s1 * 0.6 + (s1 / 0.4) * 0.4)) < 1e-9 || s1 === 0, `calage ${s1} -> ${s2}`);
});

const vue = { largeurPx: 915, hauteurPx: 412, capDeg: 100, inclinaisonDeg: 0, roulisDeg: 0, champDeg: 65 };
const mesurerTexte = (/** @type {string} */ _p, /** @type {string} */ t) => t.length * 7;
const composer = (/** @type {any[]} */ etiquettes, /** @type {any[]} */ reservations = []) => composerEtiquettes(etiquettes, creerPlaceur({ largeurPx: 915, hauteurPx: 412, limiteHautePx: 62, reservations, memoire: new Map() }), { mesurerTexte, familles: { affichage: 'Serif', mono: 'Mono' } });

test('étiquettes de monuments : icône conservée même sans place pour le nom, regroupement derrière la plus connue, hauteur affichée', () => {
  const { classes } = classerMonuments([mon('Cathédrale', 3, 100, { ht: 72, htWd: 72, links: 90 }), mon('Chapelle voisine', 3.01, 100.02, { ht: 20, links: 4 }), mon('Autre', 3, 110, { ht: 45, links: 10 }), mon('Sans hauteur', 5, 90, { ht: 0, links: 10 })], scene(), rg());
  const p = preparerMonuments(classes, vue, { ...rg(), distances: true }, { terrain: null, cities: [] });
  const cath = p.etiquettes.find((e) => e.texte === 'Cathédrale');
  assert.match(String(cath?.detail), /^↑72 m · 3\.0 km$/); assert.match(String(p.etiquettes.find((e) => e.texte === 'Autre')?.detail), /^↑~45 m/); assert.match(String(p.etiquettes.find((e) => e.texte === 'Sans hauteur')?.detail), /^5\.0 km$/);
  const r = composer(p.etiquettes);
  assert.equal(r.comptes.eligibles, 3, 'la chapelle, cachée derrière l’icône de la cathédrale, est regroupée');
  assert.ok(r.commandes.some((c) => c.type === 'texte' && c.texte === '+1'), 'pastille +N sur l’icône la plus connue');
  const { ctx, appels } = (() => { const a = /** @type {any[]} */ ([]); return { appels: a, ctx: /** @type {any} */ (new Proxy({}, { get: (_t, n) => (/** @type {any[]} */ ...x) => { a.push([String(n), ...x]); }, set: (_t, n, v) => { a.push(['=' + String(n), v]); return true; } })) }; })();
  globalThis.Path2D = globalThis.Path2D || /** @type {any} */ (class { moveTo() {} lineTo() {} quadraticCurveTo() {} arc() {} rect() {} closePath() {} });
  dessiner(ctx, r.commandes);
  assert.ok(appels.some((a) => a[0] === 'fillText'));
  // sans aucune place pour le nom (limite haute au ras du sol) : l'icône est quand même dessinée
  const ras = composerEtiquettes(p.etiquettes.slice(0, 1).map((e) => ({ ...e, y: 70 })), creerPlaceur({ largeurPx: 915, hauteurPx: 412, limiteHautePx: 69, reservations: [], memoire: new Map() }), { mesurerTexte, familles: { affichage: 'a', mono: 'b' } });
  assert.equal(ras.comptes.sansPlace, 1); assert.ok(ras.commandes.some((c) => c.type === 'glyphe' || c.type === 'remplissage'), 'icône dessinée sans nom');
  assert.ok(!ras.commandes.some((c) => c.type === 'groupe' || (c.type === 'texte' && c.texte === 'Cathédrale')), 'aucun nom');
});

test('étiquettes : nets d’abord puis fantômes ; un nom net en Essentiel reste net en Tout voir', () => {
  const r = alea(12), lignes = Array.from({ length: 80 }, (_, i) => mon('M' + i, 0.5 + r() * 25, 60 + r() * 80, { ht: 20 + r() * 80, links: 3 + Math.floor(r() * 60) }));
  const ess = classerMonuments(lignes, scene(), rg()), tout = classerMonuments(lignes, scene(), rg({ toutVoir: true }));
  const pe = preparerMonuments(ess.classes, vue, { ...rg(), distances: true }, { terrain: null, cities: [] }), pt = preparerMonuments(tout.classes, vue, { ...rg({ toutVoir: true }), distances: true }, { terrain: null, cities: [] });
  const nets = new Set(pe.etiquettes.map((e) => e.texte));
  const ordreTout = ordonnerEtiquettes(tout.classes.map((c) => c.el), pt.etiquettes);
  assert.ok(nets.size > 3 && pt.etiquettes.length > pe.etiquettes.length, 'Tout voir ajoute des fantômes');
  assert.deepEqual(ordreTout.filter((e) => !e.fantome).map((e) => e.texte), pe.etiquettes.map((e) => e.texte), 'mêmes nets, même ordre');
  const premierFantome = ordreTout.findIndex((e) => e.fantome);
  assert.ok(ordreTout.slice(premierFantome).every((e) => e.fantome), 'les fantômes viennent après tous les nets');
  assert.equal(pe.fantomesEnChamp, pt.etiquettes.filter((e) => e.fantome).length, 'badge de l’œil = fantômes dans le champ');
  assert.deepEqual(preparerMonuments(ess.classes, vue, { ...rg({ couche: false }), distances: true }, { terrain: null, cities: [] }).etiquettes, []);
});

test('liste commune : priorité, assemblage stable et dédoublonnage monument avant ville', () => {
  const m = { ...mon('Saint-Malo', 0.3, 10), dist: 0.3 }, ville = { name: 'Saint-Malo', kind: 'town', lat: m.lat + 0.001, lon: m.lon, dist: 0.2 }, autre = { name: 'Dinard', kind: 'town', lat: 48.6, lon: -2.0, dist: 5 };
  const tri = assemblerListe([[m], [autre, ville]], false);
  assert.deepEqual(tri.map((e) => e.name), ['Saint-Malo', 'Saint-Malo', 'Dinard']); assert.equal(tri[0].kind, 'monument', 'les monuments d’abord');
  assert.deepEqual(dedoublonner(tri).map((e) => e.kind), ['monument', 'town'], 'la ville homonyme à moins de 2 km est écartée');
  assert.ok(PRIORITE.monument < PRIORITE.city && PRIORITE.city < PRIORITE.hamlet);
  assert.ok(comparateurAffichage(false)(m, ville) < 0);
});

test('relief : anglesMonument remonte un monument posé sous la ligne de relief et ne bouge pas un fantôme', async () => {
  const T = await terrainSynthetique();
  const lignes = [mon('Devant le relief', 4, 40, { ht: 40, links: 20 })];
  const { classes } = classerMonuments(lignes, scene({ terrain: T }), rg({ relief: true, toutVoir: true }));
  const { anglesMonument } = await import('../../src/calques/monuments.js');
  const c = classes[0].el, a = anglesMonument(c, { ...vue, capDeg: c.brg }, T, true);
  assert.ok(a.aA > a.aGnd && Number.isFinite(a.aA));
  const cache = { ...c, hidden: true };
  assert.equal(anglesMonument(cache, { ...vue, capDeg: c.brg }, T, true).aGnd, c.aG);
});
