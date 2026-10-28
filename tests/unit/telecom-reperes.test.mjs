// Pylônes télécom et repères hauts (données) : formules de la v1 extraites de son fichier, puis chargement avec mémoire et secours.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { iconeTelecom, operateurs, a5G, siteTelecom, rayonTelecom, telecomVoulu, doitChargerTelecom, reculSuivant, creerSourceTelecom, TEL_CASE_DEG, LIBELLE_TELECOM, RECUL_MAX_MS } from '../../src/donnees/telecom.js';
import { typeRepere, analyserReperes, fusionnerReperes, requeteImmeubles, creerSourceReperes, HAUTEUR_DEFAUT } from '../../src/donnees/reperes-hauts.js';
import { creerCacheDonnees } from '../../src/donnees/cache-donnees.js';
import { fauxCaches } from './aide-caches.mjs';
import { alea } from './aide-relief.mjs';

const src = readFileSync(new URL('../../v1/villes-horizon.html', import.meta.url), 'utf8');
const entre = (/** @type {string} */ debut, /** @type {string} */ fin) => { const i = src.indexOf(debut), j = src.indexOf(fin, i); assert.ok(i >= 0 && j > i, `introuvable : ${debut}`); return src.slice(i, j); };
const v1 = new Function(`${entre('const NAT_HIDDEN=', '// ---------- monuments emblematiques')}
${entre('const BLD_DEF_H=', 'const BUILD_LABEL')}
${entre('const BUILD_LABEL=', '// REPERES HAUTS (OSM)')}
return {telIcon,opsOf,has5G,TEL_LABEL,parseBuildings,kindOfBuilding,BLD_DEF_H,BUILD_LABEL};`)();

const POS = { lat: 48.8495, lon: 2.2865 };

test('icône d’un support télécom : même table que la v1, codes et libellés', () => {
  const r = alea(11), natures = ['Pylône autostable', 'Mât', 'château d’eau', 'Bâtiment', 'Tunnel', 'intérieur', 'mobilier urbain', 'autre', 'Silo', undefined, ''];
  for (let i = 0; i < 3000; i++) {
    const code = r() < 0.15 ? undefined : r() < 0.3 ? 'x' : Math.floor(r() * 60), nature = natures[Math.floor(r() * natures.length)];
    assert.equal(iconeTelecom(code, nature), v1.telIcon(code, nature), `${code} ${nature}`);
  }
  assert.equal(iconeTelecom(8), null); assert.equal(iconeTelecom(55), null); assert.equal(iconeTelecom(21), 'pylone'); assert.equal(iconeTelecom(999), 'antenne');
  assert.deepEqual(LIBELLE_TELECOM, v1.TEL_LABEL);
});

test('opérateurs et 5G identiques à la v1', () => {
  const noms = ['Orange', 'SFR', 'Bouygues Telecom', 'Free Mobile', 'Autre opérateur', 'ORANGE SA', ''];
  const r = alea(5);
  for (let i = 0; i < 500; i++) {
    const ops = Array.from({ length: Math.floor(r() * 5) }, () => ({ name: noms[Math.floor(r() * noms.length)], systems: Array.from({ length: Math.floor(r() * 3) }, () => ({ generation: r() < 0.3 ? '5G' : '4G', system: r() < 0.3 ? 'NR 3500' : 'LTE 800' })) }));
    assert.deepEqual(operateurs(ops), v1.opsOf(ops)); assert.equal(a5G(ops), v1.has5G(ops));
  }
  assert.deepEqual(operateurs(undefined), []); assert.deepEqual(operateurs([{ name: 'Free' }, { name: 'Orange' }, { name: 'Zeop' }]).map((x) => x.k), ['O', 'F', '·']);
});

test('site télécom : forme de la v1, supports invisibles écartés, rayon demandé', () => {
  const s = { nature_code: 21, nature: 'Pylône', name: '', address: '1 rue X', lat: 48.1, lon: 2.1, sup_id: 77, height_m: 40, owner: 'TDF', operators: [{ name: 'Free', systems: [{ generation: '5G' }] }] };
  const x = siteTelecom(s);
  assert.deepEqual([x?.name, x?.icon, x?.kind, x?.place, x?.g5, x?.ops.length], ['Pylône', 'pylone', 'telecom', '1 rue X', true, 1]);
  assert.equal(siteTelecom({ ...s, address: '', name: '' })?.place, 'Support 77');
  assert.equal(siteTelecom({ ...s, nature_code: 9 }), null);
  assert.equal(rayonTelecom({ telecom: true, telecomMaxKm: 8, monuments: true }), 12); assert.equal(rayonTelecom({ telecom: true, telecomMaxKm: 30, monuments: true }), 30);
  assert.equal(rayonTelecom({ telecom: false, telecomMaxKm: 8, monuments: false }), 8); assert.equal(rayonTelecom({ telecom: false, telecomMaxKm: 8, monuments: true }), 12);
  assert.equal(telecomVoulu({ telecom: false, monuments: false }), false);
});

test('recharger ? : zone couverte, échec récent, recul plafonné à 5 min', () => {
  const base = { pos: POS, couvertEn: null, rayonKm: 12, echecT: null, reculMs: 30000, maintenant: 100000 };
  assert.equal(doitChargerTelecom(base), true);
  assert.equal(doitChargerTelecom({ ...base, couvertEn: { lat: POS.lat + 0.01, lon: POS.lon } }), false, 'déplacement de ~1 km < 0,3 × 12');
  assert.equal(doitChargerTelecom({ ...base, couvertEn: { lat: POS.lat + 0.1, lon: POS.lon } }), true);
  assert.equal(doitChargerTelecom({ ...base, echecT: 90000 }), false); assert.equal(doitChargerTelecom({ ...base, echecT: 60000 }), true);
  let r = 30000; for (let i = 0; i < 20; i++) r = reculSuivant(r);
  assert.equal(r, RECUL_MAX_MS); assert.equal(reculSuivant(30000), 45000);
});

/** Faux relais /telecom. */
const faux = (/** @type {Record<string, any>} */ reponse, /** @type {{n: number, urls: string[]}} */ compte, panne = false) => ({ requeter: async (/** @type {string} */ url) => { compte.n++; compte.urls.push(url); if (panne) throw new Error('hors ligne'); return { ok: true, statut: 200, donnees: reponse }; } });

test('chargement télécom : réseau puis mémoire fraîche, secours périmé, hors de France', async () => {
  const caches = /** @type {any} */ (fauxCaches());
  let t = 1000000;
  const cache = creerCacheDonnees('vh2-tel', { caches, maintenant: () => t });
  const rep = { sites: [{ nature_code: 21, nature: 'Pylône', lat: 48.9, lon: 2.3, sup_id: 1 }, { nature_code: 8, lat: 48.9, lon: 2.3, sup_id: 2 }], communes: ['a'], radius_eff: 5 };
  const compte = { n: 0, urls: /** @type {string[]} */ ([]) };
  const src1 = creerSourceTelecom({ reseau: faux(rep, compte), cache, relais: 'relais.example.org', maintenant: () => t });
  const a = await src1.charger({ pos: POS, rayonKm: 12 });
  assert.deepEqual([a.source, a.sites.length, a.ecartes, a.rayonEff, a.communes], ['reseau', 1, 1, 5, 1]);
  assert.match(compte.urls[0], /^https:\/\/relais\.example\.org\/telecom\?lat=48\.84950&lon=2\.28650&radius_km=12$/);
  await new Promise((r) => setTimeout(r, 5));
  const b = await src1.charger({ pos: { lat: POS.lat + 0.02, lon: POS.lon }, rayonKm: 12 });
  assert.deepEqual([b.source, compte.n], ['cache', 1], 'case voisine, rayon couvert : aucune requête');
  const c = await src1.charger({ pos: POS, rayonKm: 30 });
  assert.equal(c.source, 'reseau', 'rayon plus grand que celui mémorisé : nouvelle requête'); assert.equal(compte.n, 2);
  t += 8 * 86400000;
  const mort = creerSourceTelecom({ reseau: faux({}, compte, true), cache, relais: 'relais.example.org', maintenant: () => t });
  const d = await mort.charger({ pos: POS, rayonKm: 12 });
  assert.deepEqual([d.source, d.sites.length], ['secours', 1], 'mémoire périmée de 8 jours, réseau en panne');
  await assert.rejects(creerSourceTelecom({ reseau: faux({}, compte, true), cache: creerCacheDonnees('vh2-vide', { caches }), relais: 'r.example.org' }).charger({ pos: POS, rayonKm: 12 }), /hors ligne/);
  const hf = await creerSourceTelecom({ reseau: faux({ hors_france: true }, compte), cache: creerCacheDonnees('vh2-hf', { caches }), relais: 'r.example.org' }).charger({ pos: POS, rayonKm: 12 });
  assert.deepEqual([hf.horsFrance, hf.sites.length], [true, 0]);
  assert.ok(TEL_CASE_DEG > 0);
});

test('repères hauts : type, noms fabriqués, hauteur, ess et déduplication identiques à la v1', () => {
  const r = alea(21), tags = () => {
    const t = /** @type {Record<string, string>} */ ({});
    const mm = ['tower', 'communications_tower', 'water_tower', 'chimney', 'mast', undefined][Math.floor(r() * 6)]; if (mm) t.man_made = mm;
    if (mm === 'tower' && r() < 0.6) t['tower:type'] = ['church', 'bell_tower', 'communication', 'observation'][Math.floor(r() * 4)];
    if (r() < 0.5) t.height = String(Math.round(r() * 120)); else if (r() < 0.3) t['building:levels'] = String(Math.round(r() * 30));
    if (r() < 0.4) t.name = 'Nom ' + Math.floor(r() * 5); if (r() < 0.1) t['name:fr'] = 'Nom fr'; if (r() < 0.3) t.operator = ['TDF', 'Une société au nom très long qui dépasse', 'Orange'][Math.floor(r() * 3)];
    if (!t.man_made) t.building = 'yes';
    return t;
  };
  const elements = Array.from({ length: 400 }, (_, i) => ({ type: 'way', id: i % 350, center: { lat: 48 + Math.floor(r() * 6) / 1000, lon: 2 + Math.floor(r() * 6) / 1000 }, tags: r() < 0.03 ? undefined : tags() }));
  elements.push(/** @type {any} */ ({ type: 'node', id: 9999, lat: 48.5, lon: 2.5, tags: { man_made: 'tower' } }), /** @type {any} */ ({ type: 'node', id: 1, tags: { man_made: 'tower' } }));
  const j = { elements };
  const a = analyserReperes(j), b = v1.parseBuildings(j);
  assert.ok(a.length > 100 && a.length < 400, `${a.length}`);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
  for (const t of elements.map((e) => e.tags).filter(Boolean)) assert.equal(typeRepere(/** @type {any} */ (t)), v1.kindOfBuilding(t));
  assert.deepEqual(HAUTEUR_DEFAUT, v1.BLD_DEF_H);
  assert.equal(analyserReperes({ elements: [{ type: 'way', id: 1, center: { lat: 1, lon: 1 }, tags: { building: 'yes', height: '45' } }] })[0].ess, true, 'immeuble anonyme ≥ 40 m : Essentiel');
  assert.equal(analyserReperes({ elements: [{ type: 'way', id: 1, center: { lat: 1, lon: 1 }, tags: { building: 'yes', height: '35' } }] })[0].ess, false, 'immeuble anonyme < 40 m : Tout voir seulement');
  assert.equal(analyserReperes({ elements: [{ type: 'way', id: 2, center: { lat: 1, lon: 1 }, tags: { man_made: 'tower', operator: 'TDF', height: '60' } }] })[0].name, 'Tour TDF (60 m)');
  const fus = fusionnerReperes(a.slice(0, 50), a.slice(30, 80));
  assert.equal(fus.length, 80); assert.match(requeteImmeubles(POS, 5000), /around:5000,48\.8495,2\.2865/);
});

test('chargement des repères hauts : tuiles + immeubles au mieux, échec total levé', async () => {
  const caches = /** @type {any} */ (fauxCaches()), cache = creerCacheDonnees('vh2-rep', { caches });
  const tour = { type: 'node', id: 5, lat: POS.lat + 0.01, lon: POS.lon, tags: { man_made: 'tower', height: '50' } };
  const loin = { type: 'node', id: 6, lat: POS.lat + 0.3, lon: POS.lon, tags: { man_made: 'tower', height: '50' } };
  /** @param {any[]} objets @param {number} echecs */
  const osm = (objets, echecs = 0) => /** @type {any} */ ({ charger: async (/** @type {any} */ _p, /** @type {any} */ _f, /** @type {any} */ _r, /** @type {any} */ cb) => { if (cb && objets.length) cb(objets); return { objets, tuiles: 2, echecs, secours: 0, enMemoire: 0, reseau: 2, erreur: echecs ? new Error('504') : null }; } });
  let rep = 0;
  const overpass = /** @type {any} */ ({ interroger: async (/** @type {string} */ q, /** @type {number} */ _ms, /** @type {(j: any) => any} */ an) => { rep++; return an({ elements: [{ type: 'way', id: 7, center: { lat: POS.lat, lon: POS.lon + 0.01 }, tags: { building: 'yes', height: '80' } }] }); } });
  const etapes = /** @type {number[]} */ ([]);
  const ok = await creerSourceReperes({ osm: osm([tour, loin]), overpass, cache }).charger({ pos: POS, rayonKm: 12, quandPartiel: (l) => etapes.push(l.length) });
  assert.deepEqual([ok.liste.length, ok.partiel, ok.sansImmeubles, etapes], [2, false, false, [1]], 'la tour lointaine (33 km) est filtrée ; un immeuble de 80 m');
  assert.deepEqual(ok.liste.map((x) => x.kind), ['tour', 'immeuble']);
  await creerSourceReperes({ osm: osm([tour]), overpass, cache }).charger({ pos: POS, rayonKm: 12 });
  assert.equal(rep, 1, 'immeubles : mémoire de 3 jours, pas de seconde requête');
  const sans = await creerSourceReperes({ osm: osm([tour]), overpass: /** @type {any} */ ({ interroger: async () => { throw new Error('504'); } }), cache: creerCacheDonnees('vh2-rep2', { caches }) }).charger({ pos: POS, rayonKm: 12 });
  assert.deepEqual([sans.liste.length, sans.partiel, sans.sansImmeubles], [1, true, true], 'immeubles indisponibles : les tours restent');
  await assert.rejects(creerSourceReperes({ osm: osm([], 2), overpass, cache }).charger({ pos: POS, rayonKm: 12 }), /504/);
});
