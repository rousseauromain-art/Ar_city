// Couches personnelles (KML/KMZ) : parties sans DOM comparées au code de la v1 extrait de son fichier (l'analyse XML et le diagnostic, qui exigent un
// navigateur, sont comparés à la v1 dans tests/e2e/kml-donnees-v2.spec.js). Le KMZ est fabriqué ici : aucune donnée réelle.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { kmzVersKml, lireFichierKml, kmlRapide, normaliser, creerCouche, marquerRecherche, positionnerCouche, libellesCouche, COULEURS_PERSO, PERSO_AFFICHES, PERSO_TROUVES } from '../../src/donnees/kml.js';
import { afficherDiagnostic } from '../../src/donnees/kml-diagnostic.js';
import { creerMemoireCouches } from '../../src/donnees/couches-perso.js';
import { fauxCaches } from './aide-caches.mjs';
import { alea } from './aide-relief.mjs';

const src = readFileSync(new URL('../../v1/villes-horizon.html', import.meta.url), 'utf8');
const entre = (/** @type {string} */ debut, /** @type {string} */ fin) => { const i = src.indexOf(debut), j = src.indexOf(fin, i); assert.ok(i >= 0 && j > i, `introuvable : ${debut}`); return src.slice(i, j); };
const v1 = new Function('pos', 'D', `
${entre('function distBrg(a,b){', 'function recompute(){')}
${entre('const USR_CACHE=', 'async function userSave')}
${entre('async function inflateRaw', 'function kmlText')}
${entre('function kmlFast', 'function parseKml')}
${entre('function dgRender', 'let userDiagTxt')}
return {userMake,userFlag,userNorm,userRecompute,kmzToKml,kmlFast,dgRender,setQ:q=>{ userQ=q; },setLayers:l=>{ userLayers=l; },USR_COLORS,USR_SHOWN};`);
const V1 = (/** @type {any} */ pos) => v1(pos, Math.PI / 180);

/** ZIP minimal : chaque entrée [nom, octets, méthode (0 ou 8)]. @param {[string, Buffer, 0 | 8][]} entrees */
function zip(entrees) {
  const loc = [], cen = [];
  let off = 0;
  for (const [nom, brut, meth] of entrees) {
    const data = meth === 8 ? deflateRawSync(brut) : brut, n = Buffer.from(nom);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(meth, 8); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(brut.length, 22); h.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(meth, 10); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(brut.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(off, 42);
    loc.push(h, n, data); cen.push(c, n); off += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(cen), fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(entrees.length, 8); fin.writeUInt16LE(entrees.length, 10); fin.writeUInt32LE(cd.length, 12); fin.writeUInt32LE(off, 16);
  const b = Buffer.concat([...loc, cd, fin]);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.length);
}
const KML = '<?xml version="1.0"?><kml><Document><Placemark><name>Site A</name><Point><coordinates>2.30,48.85,0</coordinates></Point></Placemark></Document></kml>';

test('KMZ : entrée stockée ou compressée, doc.kml préféré, comme la v1', async () => {
  for (const meth of /** @type {const} */ ([0, 8])) {
    const buf = zip([['autre.kml', Buffer.from('<kml>autre</kml>'), meth], ['dossier/doc.kml', Buffer.from(KML), meth], ['image.png', Buffer.from('xx'), 0]]);
    let info = null;
    const t2 = await kmzVersKml(buf, (e, p) => { info = { n: e.length, p }; });
    assert.equal(t2, KML); assert.deepEqual(info, { n: 3, p: 'dossier/doc.kml' });
    assert.equal(await V1(undefined).kmzToKml(buf), KML, 'même texte que la v1');
  }
  assert.equal(await kmzVersKml(zip([['a.kml', Buffer.from('<kml>seul</kml>'), 8]])), '<kml>seul</kml>', 'à défaut de doc.kml, le premier .kml');
  await assert.rejects(kmzVersKml(zip([['a.txt', Buffer.from('x'), 0]])), /aucun fichier \.kml/);
  await assert.rejects(kmzVersKml(new ArrayBuffer(100)), /illisible/);
  const brut = Buffer.from(KML), lu = await lireFichierKml(brut.buffer.slice(brut.byteOffset, brut.byteOffset + brut.length), 1536);
  assert.deepEqual([lu.txt, lu.meta.zip, lu.meta.size, lu.meta.ents], [KML, false, 1536, null], 'KML brut');
  const z = await lireFichierKml(zip([['doc.kml', Buffer.from(KML), 8]]));
  assert.deepEqual([z.txt, z.meta.zip, z.meta.pick], [KML, true, 'doc.kml']);
});

test('tableau HTML simple lu sans analyseur : identique à la v1', () => {
  const cas = ['<table><tr><td>Nom</td><td>A &amp; B</td></tr><tr><th>Hauteur</th><td> 30&nbsp;m </td></tr></table>', '<table><tr><td>x</td><td>y</td></tr></table><table></table>', '<table><tr><td>a</td></tr></table>',
    '<p>pas de table</p>', '<table><tr><td>Lien</td><td><a href="https://ex.org/?a=1&amp;b=2">ici</a></td></tr></table>', ''];
  for (const c of cas) assert.deepEqual(kmlRapide(c), V1(undefined).kmlFast(c), c);
  assert.deepEqual(kmlRapide(cas[0])?.rows, [['Nom', 'A & B'], ['Hauteur', '30 m']]);
});

test('normalisation de la recherche : identique à la v1', () => {
  const V = V1(undefined);
  for (const t of ['Église Saint-Étienne', '  ÉCOLE   maternelle ', 'Ça', '', undefined, 12, 'ß']) assert.equal(normaliser(t), V.userNorm(t));
});

/** Couche de test aléatoire, même forme pour la v1 et la v2. */
function donnees(/** @type {number} */ graine) {
  const r = alea(graine), noms = ['Pylône Nord', 'Relais Église', 'École primaire', 'Château d’eau', 'Antenne 4G', '', 'Relais Ouest'];
  const cols = ['Code', 'Commune', 'Hauteur'];
  const pts = Array.from({ length: 400 }, (_, i) => [+(48.8 + r() * 0.6 - 0.3).toFixed(6), +(2.3 + r() * 0.8 - 0.4).toFixed(6), noms[Math.floor(r() * noms.length)] + (i % 7 ? '' : ' ' + i), r() < 0.3 ? 'Une description ' + i : '', r() < 0.1 ? ['https://exemple.org/' + i] : [], [String(i), ['Paris', 'Meudon', 'Sèvres'][i % 3], String(10 + (i % 50))]]);
  return { id: 'c' + graine, name: 'Couche ' + graine, color: COULEURS_PERSO[graine % 6], on: true, max: 5 + graine, pts, cols, field: ['', '@name', '@desc', 'Commune', 'Inconnu'][graine % 5], ignored: 2, added: graine };
}

test('couche : items, libellés, recherche et sites affichés identiques à la v1', () => {
  const pos = { lat: 48.85, lon: 2.3 };
  for (let g = 1; g <= 10; g++) {
    for (const requete of ['', 'a', 'relais', 'église paris', 'zzz', 'Château  EAU']) {
      const V = V1(pos);
      V.setQ(requete);
      const a = V.userMake(JSON.parse(JSON.stringify(donnees(g)))), b = creerCouche(JSON.parse(JSON.stringify(donnees(g))), requete);
      V.setLayers([a]); V.userRecompute(); positionnerCouche(b, pos);
      const net = (/** @type {any} */ L) => JSON.parse(JSON.stringify({ items: L.items.map((/** @type {any} */ it) => { const { _h, ...o } = it; void _h; return o; }), shown: L.shown.map((/** @type {any} */ it) => it.name + '|' + it.lat + '|' + it.lon), field: L.field, hasDesc: L.hasDesc }));
      assert.deepEqual(net(b), net(a), `couche ${g} recherche « ${requete} »`);
    }
  }
  const L = creerCouche(donnees(4), 'relais'), n = L.items.filter((i) => i.hl).length;
  positionnerCouche(L, { lat: 48.85, lon: 2.3 });
  assert.ok(n > 0 && L.shown.length <= PERSO_TROUVES + PERSO_AFFICHES);
  marquerRecherche(L, ''); assert.ok(L.items.every((i) => !i.hl), 'recherche vide : aucun site en gras');
  marquerRecherche(L, 'r'); assert.ok(L.items.every((i) => !i.hl), 'moins de 2 caractères : ignorée');
  L.field = '@name'; libellesCouche(L); assert.ok(L.items.every((i) => i.lab === Array.from(i.name.replace(/\s+/g, ' ').trim()).slice(0, 10).join('')));
});

test('ancien format de couche (valeurs en objet) converti en colonnes', () => {
  const L = creerCouche({ id: 'x', name: 'Ancienne', color: '#fff', on: true, max: 10, pts: [[48.8, 2.3, 'A', '', [], { Code: '1', Zone: 'Z' }], [48.9, 2.4, 'B', '', [], { Code: '2' }]] });
  assert.deepEqual(L.cols, ['Code', 'Zone']); assert.deepEqual(L.items.map((i) => i.vals), [['1', 'Z'], ['2', '']]);
});

test('diagnostic : noms de champs visibles ou masqués dans l’ordre d’apparition, comme la v1', () => {
  const t = '⟦Code⟧ → 3 car.\n⟦Commune⟧ → 5 car.\n⟦Code⟧ encore';
  for (const m of [false, true]) assert.equal(afficherDiagnostic(t, m), V1(undefined).dgRender(t, m));
  assert.match(afficherDiagnostic(t, true), /champ#1[^]*champ#2[^]*champ#1/);
});

test('mémoire des couches : enregistrement, relecture dans l’ordre, suppression, jamais le cache de la v1', async () => {
  const caches = /** @type {any} */ (fauxCaches()), m = creerMemoireCouches({ caches });
  const a = creerCouche(donnees(2)), b = creerCouche(donnees(1));
  assert.equal(await m.enregistrer(a), true); assert.equal(await m.enregistrer(b), true);
  const lues = await m.charger('relais');
  assert.deepEqual(lues.map((l) => l.id), ['c1', 'c2'], 'ordre d’ajout'); assert.equal(lues[0].items.length, 400); assert.ok(lues[0].items.some((i) => i.hl));
  await m.supprimer('c1'); assert.deepEqual((await m.charger()).map((l) => l.id), ['c2']);
  assert.deepEqual([...caches.noms.keys()], ['vh2-couches-perso']);
  const sansStockage = creerMemoireCouches({ caches: undefined, journal: { avert: () => undefined } });
  assert.equal(await sansStockage.enregistrer(a), false); assert.deepEqual(await sansStockage.charger(), []);
});
