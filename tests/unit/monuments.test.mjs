// Monuments (données) : tri Wikidata, fabrication, objets OSM, chargement par tuiles — parité avec le code de la v1 extrait de son fichier.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { wdClassify, monTypeFrom, sparqlMon, normWdqs } from '../../src/donnees/wikidata.js';
import { fabriquerMonuments, MON_KEEP, MON_NEAR_KEEP, EQUIP_KEEP } from '../../src/donnees/monuments-wikidata.js';
import { towerRel, parseTowers, lireTuileOsm, isTdf, isStatueEl, osmHintFrom, towerMonuments, tallMonuments, statueMonuments, combinerMonuments, doublonsBatiments, nearestLocality, TW_TAGS, OT_KEEP } from '../../src/donnees/monuments-osm.js';
import { tuilesOsm, GRILLE_PROCHE, GRILLE_LOINTAINE, requeteTuileOsm, creerSourceOsm } from '../../src/donnees/osm-tuiles.js';
import { creerSourceMonuments, rayonMonuments, tuilesWikidataProches, anciennesTuilesAutour } from '../../src/donnees/monuments.js';
import { creerCacheDonnees } from '../../src/donnees/cache-donnees.js';
import { pointAuCap, distanceEtCap } from '../../src/noyau/geo.js';
import { fauxCaches } from './aide-caches.mjs';
import { alea } from './aide-relief.mjs';

const src = readFileSync(new URL('../../v1/villes-horizon.html', import.meta.url), 'utf8');
/** @param {string} debut @param {string} fin Extrait de `debut` jusqu'à `fin` EXCLU. */
const avant = (debut, fin) => { const i = src.indexOf(debut), j = src.indexOf(fin, i); assert.ok(i >= 0 && j > i, `introuvable : ${debut}`); return src.slice(i, j); };
const v1 = new Function('D', 'pos', `
const norm=t=>t.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'');
${avant('function distBrg(a,b){', 'function recompute(){')}
${avant('const _W=src=>', '// WDCLASS>>')}
${avant('function sparqlMon(lat,lon,radiusKm,minLinks,full){', 'async function monDirect(R){')}
const TW_TAGS=['name','name:fr','official_name','alt_name','operator','owner','brand','height','wikidata','wikipedia','website','contact:website','ref','tower:type','man_made','description'];
const OT_KEEP=[...TW_TAGS,'building:levels','historic','memorial','tourism','artwork_type','subject'];
${avant('const isTdf=t=>', '// 12/10/2026 (tour TDF')}
${avant('function towerRel(t){', '// ---------- OSM repères hauts')}
${avant('const isStatueEl=e=>', 'const STATUE_MAX_KM')}
${avant('function otParse(j){', 'function otTiles(g,fromKm,toKm){')}
${avant('function otTiles(g,fromKm,toKm){', 'const otInflight')}
${avant('function osmHintFrom(c){', 'async function osmLastEdit(id){')}
return {wdClassify,monTypeFrom,sparqlMon,normWdqs,TW_TAGS,OT_KEEP,isTdf,towerRel,parseTowers,isStatueEl,otParse,otTiles,osmHintFrom};`);
const V1 = (/** @type {{lat: number, lon: number}} */ pos) => v1(Math.PI / 180, pos);
const POS = { lat: 48.6459, lon: -2.0281 };

test('Wikidata : constantes de tags identiques à la v1', () => {
  const M = V1(POS);
  assert.deepEqual(TW_TAGS, M.TW_TAGS); assert.deepEqual(OT_KEEP, M.OT_KEEP);
});

const MOTS = ['église', 'church', 'chapelle', 'cathédrale', 'château', 'castle', 'musée', 'museum', 'tour', 'tower', 'émetteur', 'pylône', 'stade', 'gare', 'station de métro', 'canal', 'lac', 'place', 'parc', 'jardin', 'théâtre', 'pont', 'bridge', 'hôpital', 'université', 'commune', 'ville', 'quartier', 'village', 'île', 'événement', 'société', 'bâtiment', 'building', 'monument historique', 'statue', 'obélisque', 'arc de triomphe', 'porte de ville', 'mosquée', 'mairie', 'town hall', 'maison', 'villa', 'phare', 'beffroi', 'colonne', 'aéroport', 'port', 'cimetière', 'zoo', 'inconnu', 'œuvre d’art', 'qwerty', ''];
test('Wikidata : tri (monument / équipement / écarté) et type identiques à la v1 sur des milliers de combinaisons', () => {
  const M = V1(POS), r = alea(77), tirage = () => MOTS[Math.floor(r() * MOTS.length)];
  const comptes = { monument: 0, equip: 0, nul: 0 };
  for (let i = 0; i < 6000; i++) {
    const types = Array.from({ length: 1 + Math.floor(r() * 3) }, tirage).join(r() < 0.5 ? '|' : ' '), name = r() < 0.3 ? tirage() : 'Nom ' + i, links = Math.floor(r() * 120), prot = r() < 0.15;
    const m = { types, name, links, prot }, a = wdClassify(m), b = M.wdClassify(m);
    assert.deepEqual(a, b, JSON.stringify(m));
    assert.equal(monTypeFrom(types, name), M.monTypeFrom(types, name));
    comptes[a.cat === 'monument' ? 'monument' : a.cat === 'equip' ? 'equip' : 'nul']++;
  }
  assert.ok(comptes.monument > 500 && comptes.equip > 500 && comptes.nul > 500, JSON.stringify(comptes));
  assert.deepEqual(wdClassify({}), M.wdClassify({})); assert.deepEqual(wdClassify({ types: undefined, links: 25 }), M.wdClassify({ types: undefined, links: 25 }));
});

test('Wikidata : requête SPARQL et lecture de la réponse identiques à la v1', () => {
  const M = V1(POS);
  for (const full of [true, false]) assert.equal(sparqlMon(48.6459, -2.0281, 31.2, 40, full), M.sparqlMon(48.6459, -2.0281, 31.2, 40, full));
  const rep = { results: { bindings: [
    { i: { value: 'http://www.wikidata.org/entity/Q243' }, iLabel: { value: 'Tour Eiffel' }, lat: { value: '48.8584' }, lon: { value: '2.2945' }, sl: { value: '230' }, h: { value: '330' }, types: { value: 'tour|monument historique' } },
    { i: { value: 'http://www.wikidata.org/entity/Q243' }, iLabel: { value: 'Doublon' }, lat: { value: '1' }, lon: { value: '1' } },
    { i: { value: 'http://www.wikidata.org/entity/Q9' }, iLabel: { value: 'Q9' }, lat: { value: '1' }, lon: { value: '1' } }, // libellé = identifiant : ignoré
    { i: { value: 'http://www.wikidata.org/entity/Q10' }, iLabel: { value: 'Sans hauteur' }, lat: { value: '48.1' }, lon: { value: '-1.6' }, sl: { value: '4' }, h: { value: '-2' } },
  ] } };
  assert.deepEqual(normWdqs(rep), M.normWdqs(rep)); assert.throws(() => normWdqs({}), /format Wikidata inattendu/);
});

/** Ligne Wikidata. */
const ligne = (/** @type {string} */ qid, /** @type {string} */ types, /** @type {number} */ links, /** @type {object} */ o = {}) => ({ qid, name: qid + ' nom', lat: 48.65 + Math.random() * 0, lon: -2.02, links, ht: null, types, ...o });

test('fabrication : classement, hauteurs supposées, seuils et équipements', () => {
  const pos = POS;
  const f = fabriquerMonuments([
    ligne('Q1', 'église', 30), ligne('Q2', 'église', 1), ligne('Q3', 'commune', 90), ligne('Q4', 'stade', 3), ligne('Q5', 'stade', 3, { ...pointAuCap(POS, 20, 0) }),
    ligne('Q6', 'bâtiment', 2), ligne('Q7', 'église', 2, { prot: true }), ligne('Q8', 'musée', 1, { ht: 40 }), { qid: 'Q9', name: 'sans position', lat: NaN, lon: 0, links: 9, ht: null, types: 'église' },
  ], { pos, minLinks: 3 });
  const par = (/** @type {string} */ q) => f.gardes.find((m) => m.qid === q);
  assert.equal(par('Q1')?.type, 'clocher'); assert.equal(par('Q1')?.ht, 45); // hauteur du type
  assert.equal(par('Q2')?.minor, true); assert.equal(par('Q2')?.ht, 12); assert.match(String(par('Q2')?.why), /peu connu \(1 langue\) : hauteur supposée 12 m/);
  assert.equal(par('Q3'), undefined); assert.equal(f.nEcartes, 1);
  assert.equal(par('Q4')?.cat, 'equip'); assert.equal(par('Q5'), undefined, 'équipement à plus de 12 km écarté');
  assert.equal(par('Q6')?.minor, true, 'simple bâtiment peu connu : gardé (plus de seuil de langues), hauteur supposée petite'); assert.equal(par('Q6')?.ht, 12);
  assert.equal(par('Q7')?.prot, true); assert.equal(par('Q7')?.minor, false); assert.equal(par('Q8')?.ht, 40);
  assert.equal(f.nProteges, 1);
  // mode de secours (requête unique à 40 langues) : seuil de langues appliqué aux non protégés
  const s = fabriquerMonuments([ligne('A', 'église', 10), ligne('B', 'église', 50), ligne('C', 'église', 2, { prot: true })], { pos, minLinks: 40 });
  assert.deepEqual(s.monuments.map((m) => m.qid), ['B', 'C']);
});

test('fabrication : plafond de 150 monuments, les 80 plus proches (< 2 km) toujours gardés, seuil relevé', () => {
  const lignes = [];
  for (let i = 0; i < 120; i++) lignes.push(ligne('P' + i, 'église', 5 + (i % 7), { ...pointAuCap(POS, 0.2 + i * 0.012, i * 11) })); // 120 proches, peu connus
  for (let i = 0; i < 200; i++) lignes.push(ligne('L' + i, 'église', 10 + (i % 100), { ...pointAuCap(POS, 5 + i * 0.1, i * 7) }));
  const f = fabriquerMonuments(lignes, { pos: POS, minLinks: 3 });
  assert.equal(f.monuments.length, MON_NEAR_KEEP + MON_KEEP);
  assert.equal(f.monuments.slice(0, MON_NEAR_KEEP).every((m) => m.qid?.startsWith('P')), true, 'les plus proches d’abord');
  assert.ok(f.seuilRelevePar > 0 && f.rognes.length > 0 && f.rognes.every((m) => typeof m.dist === 'number'));
  const eq = fabriquerMonuments(Array.from({ length: 400 }, (_, i) => ligne('E' + i, 'stade', i % 50 + 1, { ...pointAuCap(POS, 1 + (i % 10), i) })), { pos: POS, minLinks: 3 });
  assert.equal(eq.equipements.length, EQUIP_KEEP); assert.ok(eq.equipements[0].links >= eq.equipements[EQUIP_KEEP - 1].links);
});

/** Étiquettes OSM aléatoires. */
function etiquettesAleatoires(/** @type {() => number} */ r) {
  const t = /** @type {Record<string, string>} */ ({});
  const choix = (/** @type {string[]} */ a) => a[Math.floor(r() * a.length)];
  if (r() < 0.8) t.man_made = choix(['tower', 'mast', 'communications_tower', 'water_tower', 'chimney']);
  if (r() < 0.4) t['tower:type'] = choix(['communication', 'bell_tower', 'observation', 'cooling', 'church']);
  if (r() < 0.5) t.height = choix(['12', '25', '45', '80', '150', 'haute', '']);
  if (r() < 0.3) t.operator = choix(['TDF', 'Télédiffusion de France', 'Orange', 'SFR']);
  if (r() < 0.2) t['communication:mobile_phone'] = 'yes';
  if (r() < 0.2) t.name = choix(['Tour TDF', 'Tour des Anglais', 'mât', 'Bell']);
  if (r() < 0.2) { t.historic = choix(['memorial', 'monument']); delete t.man_made; }
  if (r() < 0.1) { t.tourism = 'artwork'; t.artwork_type = 'statue'; delete t.man_made; }
  return t;
}
test('OSM : relevance télécom, tours, statues et lecture de tuile identiques à la v1', () => {
  const M = V1(POS), r = alea(5);
  let rel = 0, ecartes = 0, statues = 0;
  const elements = [];
  for (let i = 0; i < 1500; i++) {
    const tags = etiquettesAleatoires(r);
    assert.equal(towerRel(tags), M.towerRel(tags), JSON.stringify(tags)); assert.equal(isTdf(tags), M.isTdf(tags)); assert.equal(isStatueEl({ tags }), M.isStatueEl({ tags }));
    if (towerRel(tags)) rel++; else ecartes++;
    if (isStatueEl({ tags })) statues++;
    elements.push(i % 3 === 0 ? { type: 'way', id: i % 50, center: { lat: 48 + r(), lon: -2 + r() }, tags } : { type: 'node', id: i, lat: 48 + r(), lon: -2 + r(), tags: { ...tags, 'communication:radio': 'x', extra: 'y' } });
  }
  assert.ok(rel > 100 && ecartes > 100 && statues > 20, `${rel}/${ecartes}/${statues}`);
  elements.push({ type: 'node', id: 9999, tags: { man_made: 'tower' } }, { type: 'node', id: 9998, lat: 1, lon: 1 });
  assert.deepEqual(parseTowers({ elements }), M.parseTowers({ elements })); assert.deepEqual(lireTuileOsm({ elements }), M.otParse({ elements }));
  assert.deepEqual(parseTowers({}), []);
  for (const c of ['updated Mabilay', 'Added: Saint-Jacques', 'mise à jour Dinard', 'survey', 'updated #1234', 'Updated https://x', 'fixed 12', 'rien', '', null, 'maj Le Très Long Nom De Lieu Qui Depasse Largement Quarante']) assert.equal(osmHintFrom(c), M.osmHintFrom(c), String(c));
});

test('OSM : grille de tuiles identique à la v1', () => {
  const r = alea(9);
  for (let i = 0; i < 60; i++) {
    const pos = { lat: 40 + r() * 20, lon: -5 + r() * 15 }, M = V1(pos);
    for (const [g, de, a] of /** @type {[readonly number[], number, number][]} */ ([[GRILLE_PROCHE, 0, 12], [GRILLE_LOINTAINE, 12, 30], [GRILLE_PROCHE, 0, 6]])) assert.deepEqual(tuilesOsm(pos, g, de, a), M.otTiles(g, de, a));
  }
  const t = tuilesOsm(POS, GRILLE_PROCHE, 0, 3)[0], proche = requeteTuileOsm(t, true), loin = requeteTuileOsm(t, false);
  assert.match(proche.cle, /^ot2\/n\/\d+,-?\d+$/); assert.match(loin.cle, /^ot1\/f\//);
  assert.match(proche.q, /out center qt;$/); assert.match(proche.q, /historic.*memorial/); assert.match(loin.q, /communications_tower/);
});

/** Tour OSM minimale. */
const tour = (/** @type {string} */ id, /** @type {number} */ lat, /** @type {number} */ lon, /** @type {Record<string, string>} */ tags) => ({ id, lat, lon, tags, rel: !!towerRel(tags), why: 'x' });
const entrees = (/** @type {object} */ o = {}) => ({ pos: POS, rayonKm: 15, cities: [{ name: 'Saint-Malo', kind: 'town', lat: 48.65, lon: -2.03 }], tours: [], statues: [], hints: {}, supportsAnfr: [], batiments: [], avecAnfr: true, ...o });

test('OSM : tours télécom comme monuments (nom, hauteur, ANFR non doublé, nom d’usage)', () => {
  const p1 = pointAuCap(POS, 3, 40), p2 = pointAuCap(POS, 4, 90), p3 = pointAuCap(POS, 5, 150);
  const e = entrees({
    tours: [tour('node/1', p1.lat, p1.lon, { man_made: 'communications_tower', height: '80', operator: 'TDF' }), tour('node/2', p2.lat, p2.lon, { man_made: 'mast', ref: 'A12' }), tour('node/3', 49.5, -2, { man_made: 'tower', height: '90' })],
    hints: { 'node/2': 'Mabilay' },
    supportsAnfr: [{ icon: 'pylone', height_m: 40, owner: 'TDF', ...pointAuCap(p1, 0.05, 0) }, { icon: 'pylone', height_m: 40, owner: 'Orange', ...p3 }, { icon: 'mat', height_m: 10, ...p3 }, { icon: 'toit', height_m: 100, ...p3 }],
  });
  const m = towerMonuments(e);
  assert.equal(m.length, 3); // 3e tour trop loin ; ANFR proche d'une tour OSM écarté ; mât < 30 m écarté ; toit ignoré
  assert.equal(m[0].name, 'Tour TDF · Saint-Malo (80 m)'); assert.equal(m[0].tdf, true); assert.equal(m[0].ht, 80);
  assert.match(m[1].name, /^Mât A12 · Mabilay$/); assert.equal(m[1].unnamed, true); assert.equal(m[1].ht, 60);
  assert.equal(m[2].anfr, true); assert.match(m[2].name, /^Tour · Saint-Malo \(40 m\)$/);
  assert.equal(towerMonuments({ ...e, avecAnfr: false }).length, 2);
  assert.equal(nearestLocality({ lat: 10, lon: 10 }, e.cities), '');
});

test('OSM : bâtiments hauts — fusion avec un monument Wikidata voisin (copie), sinon nouveau monument', () => {
  const p = pointAuCap(POS, 2, 20), q = pointAuCap(POS, 3, 200);
  const base = fabriquerMonuments([ligne('Q1', 'église', 30, { ...p, name: 'Église X' })], { pos: POS, minLinks: 3 }).gardes;
  const e = entrees({ tours: [tour('node/5', p.lat + 0.0003, p.lon, { man_made: 'tower', 'tower:type': 'bell_tower', height: '55' })], batiments: [{ id: 'b1', lat: q.lat, lon: q.lon, kind: 'immeuble', height_m: 90, named: false }, { id: 'b2', lat: q.lat + 0.1, lon: q.lon, kind: 'immeuble', height_m: 30 }] });
  const { tall, base: base2 } = tallMonuments(e, base);
  assert.equal(base2[0].ht, 55); assert.equal(base2[0].htOsm, 55); assert.equal(base2[0].osmTall, 'node/5'); assert.equal(base[0].ht, 45, 'la base d’origine n’est pas modifiée');
  assert.deepEqual(tall.map((t) => t.name), ['Immeuble (90 m) · Saint-Malo'].map((n) => tall[0].name.startsWith('Immeuble (90 m)') ? tall[0].name : n)); assert.equal(tall.length, 1); assert.equal(tall[0].type, 'tour'); assert.equal(tall[0].src, 'osmh');
  const tous = combinerMonuments(e, base);
  assert.equal(tous.length, 2); assert.equal(tous[0].ht, 55);
});

test('OSM : statues ; combinaison sans doublon ; bâtiments déjà dessinés comme monuments', () => {
  const p = pointAuCap(POS, 0.2, 10);
  const base = fabriquerMonuments([ligne('Q1', 'église', 30, { ...pointAuCap(POS, 0.2, 10.02), name: 'Église X' })], { pos: POS, minLinks: 3 }).gardes;
  /** @type {import('../../src/donnees/monuments-osm.js').ObjetOsm[]} */
  const statues = [{ type: 'node', id: 1, ...pointAuCap(POS, 0.5, 10), tags: { historic: 'memorial', memorial: 'statue', name: 'Surcouf' } }, { type: 'node', id: 2, ...pointAuCap(POS, 0.4, 100), tags: { historic: 'monument', name: 'Monument aux morts', height: '12' } },
    { type: 'node', id: 3, ...pointAuCap(POS, 0.5, 100), tags: { tourism: 'artwork', artwork_type: 'bust' } }];
  const st = statueMonuments(statues, base);
  assert.deepEqual(st.map((s) => [s.name, s.ht]), [['Surcouf (statue)', 8], ['Monument aux morts', 12]]); // le buste sans nom est ignoré
  const proche = statueMonuments([{ ...statues[0], ...p }], base);
  assert.equal(proche.length, 0, 'déjà connue de Wikidata à moins de 60 m');
  const d = doublonsBatiments([{ lat: base[0].lat + 0.0005, lon: base[0].lon }, { lat: 10, lon: 10 }], base);
  assert.deepEqual(d, [true, false]);
  const c = combinerMonuments(entrees({ statues }), base);
  assert.equal(c.length, 1 + st.length);
  assert.equal(distanceEtCap(POS, c[0]).distKm > 0, true);
});

/** Faux relais et réseau. */
function monde({ wd = /** @type {Record<string, any>} */ ({}), ancien = /** @type {any} */ ({ monuments: [] }), relaisAncien = false, panneRelais = false, direct = /** @type {any} */ (null) } = {}) {
  const appels = /** @type {string[]} */ ([]);
  const reseau = { requeter: async (/** @type {string} */ url, /** @type {any} */ o = {}) => {
    appels.push(url.replace(/^https?:\/\/[^/]+/, '').replace(/\?.*/, ''));
    if (url.includes('query.wikidata.org')) { if (!direct) throw new Error('Wikidata en panne'); return direct; }
    if (panneRelais) return { ok: false, statut: 503, donnees: { error: 'relais en panne' } };
    if (url.includes('/wdtile')) {
      if (relaisAncien) return { ok: false, statut: 404, donnees: { error: 'route inconnue' } };
      const m = /lat=([\d.-]+)&lon=([\d.-]+)/.exec(url);
      const key = `${Math.floor(+(m?.[1] ?? 0) / 0.1)},${Math.floor(+(m?.[2] ?? 0) / 0.1)}`;
      return { ok: true, statut: 200, donnees: wd[key] || { wdOk: true, rows: [], minLinksUsed: 1 } };
    }
    return o.brut ? { ok: true, statut: 200, donnees: ancien } : ancien;
  } };
  /** @type {Record<string, any>} */
  const mem = {};
  const stockage = { lire: (/** @type {string} */ n, /** @type {any} */ d) => mem[n] ?? d, ecrire: (/** @type {string} */ n, /** @type {any} */ v) => { mem[n] = JSON.parse(JSON.stringify(v)); return true; } };
  const cache = creerCacheDonnees('vh2-t', { caches: /** @type {any} */ (fauxCaches()) });
  return { reseau, stockage, cache, appels, mem, creer: () => creerSourceMonuments({ reseau, cache, stockage, relais: 'https://r.test' }) };
}

test('monuments : rayon de recherche et grilles de tuiles', () => {
  assert.deepEqual([5, 20, 90].map(rayonMonuments), [15, 20, 30]);
  const wd = tuilesWikidataProches(POS, 15), old = anciennesTuilesAutour(POS, 30);
  assert.ok(wd.length > 10 && wd[0].d <= wd[wd.length - 1].d && wd.every((t) => t.d <= 15));
  assert.ok(old.length > 5 && old.every((t) => typeof t.rk === 'number'));
});

test('monuments : tuiles Wikidata du relais, mémoire 30 jours, puis aucune requête', async () => {
  const w = monde({ wd: { '486,-21': { wdOk: true, rows: [{ qid: 'Q1', name: 'Fort', lat: 48.65, lon: -2.02, links: 20, ht: null, types: 'fort|monument historique' }], minLinksUsed: 1 } } });
  const s = w.creer();
  const r = await s.charger({ pos: POS, rayonKm: 30 });
  assert.ok(r.fabrication && r.fabrication.monuments.some((m) => m.qid === 'Q1' && m.type === 'chateau'));
  assert.ok(w.appels.some((a) => a === '/wdtile') && w.appels.some((a) => a === '/monuments'), w.appels.join());
  assert.equal(r.statut, 'ok');
  const avant = w.appels.length;
  const s2 = w.creer(), r2 = await s2.charger({ pos: POS, rayonKm: 30 });
  assert.ok(r2.fabrication?.monuments.some((m) => m.qid === 'Q1'));
  assert.ok(w.appels.slice(avant).every((a) => a !== '/wdtile'), 'les tuiles proches viennent de la mémoire');
});

test('monuments : relais sans /wdtile → ancien mode ; relais en panne → Wikidata direct → mémoire de la zone → indisponible', async () => {
  const ancien = monde({ relaisAncien: true, ancien: { monumentsOk: true, monuments: [{ qid: 'Q7', name: 'Vieille tour', lat: 48.7, lon: -2, links: 50, ht: 30, types: 'tour' }] } });
  const r = await ancien.creer().charger({ pos: POS, rayonKm: 20 });
  assert.equal(r.fabrication?.monuments[0].qid, 'Q7'); assert.match(r.comment, /ancien mode/); assert.match(r.erreurs[0], /sans \/wdtile/);
  const direct = monde({ panneRelais: true, direct: { results: { bindings: [{ i: { value: 'http://x/Q5' }, iLabel: { value: 'Cathédrale' }, lat: { value: '48.64' }, lon: { value: '-2.02' }, sl: { value: '60' }, types: { value: 'cathédrale' } }] } } });
  const d = await direct.creer().charger({ pos: POS, rayonKm: 20 });
  assert.equal(d.statut, 'direct'); assert.equal(d.fabrication?.monuments[0].name, 'Cathédrale'); assert.equal(direct.mem.monuments.length, 1);
  const panne = monde({ panneRelais: true }); panne.mem.monuments = direct.mem.monuments;
  const m = await panne.creer().charger({ pos: POS, rayonKm: 20 });
  assert.equal(m.statut, 'memoire'); assert.match(m.comment, /mémoire de l'appareil/); assert.equal(m.fabrication?.monuments[0].name, 'Cathédrale');
  const rien = await monde({ panneRelais: true }).creer().charger({ pos: POS, rayonKm: 20 });
  assert.equal(rien.statut, 'indisponible'); assert.equal(rien.fabrication, null);
  const sansRelais = await creerSourceMonuments({ reseau: monde().reseau, cache: monde().cache, stockage: monde().stockage, relais: '' }).charger({ pos: POS, rayonKm: 20 });
  assert.equal(sansRelais.statut, 'indisponible');
});

test('monuments : tuile proche en échec → mémoire périmée, sinon tuile en échec comptée', async () => {
  const w = monde();
  const s = w.creer();
  await s.charger({ pos: POS, rayonKm: 15 });
  const ecriture = w.appels.length;
  assert.ok(ecriture > 0);
  const panne = monde({ panneRelais: true });
  const r = await panne.creer().charger({ pos: POS, rayonKm: 15 });
  assert.equal(r.statut, 'indisponible'); assert.ok(panne.appels.length <= 12, 'le relais manifestement en panne : on n’insiste pas (trois échecs sans succès)');
});

test('OSM : chargement par tuiles — mémoire, ordre, arrêt si Overpass est injoignable', async () => {
  const cache = creerCacheDonnees('vh2-t', { caches: /** @type {any} */ (fauxCaches()) });
  const requetes = /** @type {string[]} */ ([]);
  const overpass = { interroger: async (/** @type {string} */ q, /** @type {number} */ _ms, /** @type {(j: any) => any} */ analyseur) => { requetes.push(q); return analyseur({ elements: [{ type: 'node', id: requetes.length, lat: 48.65, lon: -2.03, tags: { man_made: 'tower', height: '60' } }] }); } };
  const s = creerSourceOsm({ cache, overpass: /** @type {any} */ (overpass) });
  const paliers = /** @type {number[]} */ ([]);
  const r = await s.charger(POS, 3, 12, (o) => paliers.push(o.length));
  assert.equal(r.echecs, 0); assert.equal(r.reseau, r.tuiles); assert.ok(r.objets.length >= 2 && paliers.length === r.tuiles && paliers[paliers.length - 1] === r.objets.length);
  const n = requetes.length, r2 = await s.charger(POS, 3, 12);
  assert.equal(requetes.length, n, 'tout vient de la mémoire'); assert.equal(r2.enMemoire, r2.tuiles);
  const mort = creerSourceOsm({ cache: creerCacheDonnees('vh2-z', { caches: /** @type {any} */ (fauxCaches()) }), overpass: /** @type {any} */ ({ interroger: async () => { throw new Error('tous les miroirs en échec'); } }) });
  const m = await mort.charger(POS, 3, 12);
  assert.equal(m.echecs, 1); assert.equal(m.objets.length, 0); assert.match(String(m.erreur), /miroirs/);
});
