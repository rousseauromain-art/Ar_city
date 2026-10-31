import test from 'node:test';
import assert from 'node:assert/strict';
import { creerChargeurTuiles, urlMapterhorn, urlAws, tuileMer } from '../../src/donnees/tuiles-relief.js';
import { ErreurReseau } from '../../src/donnees/reseau.js';
import { calculerTerrain, calculerTerrainAvecRepli } from '../../src/scene/terrain.js';
import { calculerMasque } from '../../src/scene/masque.js';
import { NB_RELEVEMENTS, DISTANCES_KM } from '../../src/scene/relief.js';
import { tuile } from '../unit/aide-relief.mjs';

const POS = { lat: 48.6459, lon: -2.0281 };
const octets = (/** @type {number} */ n) => new Uint8Array([n]);
/** Décodeur factice : le premier octet donne la valeur de remplissage de la tuile. */
const decoder = async (/** @type {Uint8Array} */ o, /** @type {number} */ ts) => new Uint8ClampedArray(ts * ts * 4).fill(o[0]);

/** Réseau factice : table url → octets | statut d'erreur (absent de la table : `defaut`, 404 = hors couverture, 0 = panne). @param {Record<string, number | Uint8Array>} table */
function reseauFactice(table, appels = /** @type {string[]} */ ([]), defaut = 404) {
  return {
    appels,
    async obtenir(/** @type {string} */ url) {
      appels.push(url);
      const v = table[url];
      if (v instanceof Uint8Array) return { donnees: v, source: 'reseau' };
      const statut = typeof v === 'number' ? v : defaut;
      throw new ErreurReseau(`HTTP ${statut}`, statut, url);
    },
  };
}

test('tuiles : Mapterhorn trouvée → décodée', async () => {
  const ch = creerChargeurTuiles({ reseau: reseauFactice({ [urlMapterhorn(12, 1, 2)]: octets(7) }), decoder });
  const r = await ch.charger({ z: 12, x: 1, y: 2 }, 'mapterhorn', 512, true);
  assert.equal(r.data?.length, 512 * 512 * 4); assert.equal(r.data?.[0], 7); assert.equal(r.missing, undefined);
});

test('tuiles : absente de Mapterhorn → mosaïque AWS (4 tuiles z+1), quart manquant = mer', async () => {
  const table = { [urlAws(13, 2, 4)]: octets(1), [urlAws(13, 3, 4)]: octets(2), [urlAws(13, 2, 5)]: octets(3) }; // le 4e (3,5) manque
  const ch = creerChargeurTuiles({ reseau: reseauFactice(table), decoder });
  const r = await ch.charger({ z: 12, x: 1, y: 2 }, 'mapterhorn', 512, true);
  assert.equal(r.alt, true);
  const px = (/** @type {number} */ x, /** @type {number} */ y) => r.data?.[(y * 512 + x) * 4];
  assert.deepEqual([px(0, 0), px(300, 0), px(0, 300), px(300, 300)], [1, 2, 3, 128]);
});

test('tuiles : rien nulle part → mer si la bande est garantie, « pas de donnée » sinon', async () => {
  const ch = creerChargeurTuiles({ reseau: reseauFactice({}, [], 0), decoder }); // panne réseau (statut 0)
  await assert.rejects(ch.charger({ z: 12, x: 1, y: 2 }, 'mapterhorn', 512, true)); // panne réseau : remontée
  const ch404 = creerChargeurTuiles({ reseau: { obtenir: async (/** @type {string} */ u) => { throw new ErreurReseau('HTTP 404', 404, u); } }, decoder });
  const garantie = await ch404.charger({ z: 12, x: 1, y: 2 }, 'mapterhorn', 512, true);
  assert.deepEqual([garantie.sea, garantie.missing, garantie.data?.[0]], [true, true, tuileMer(512)[0]]);
  const fine = await ch404.charger({ z: 13, x: 1, y: 2 }, 'mapterhorn', 512, false);
  assert.deepEqual([fine.sea, fine.missing, fine.data], [false, true, null]);
});

test('tuiles : 4 échecs réseau de suite → Mapterhorn abandonnée sans nouvelle requête', async () => {
  const appels = /** @type {string[]} */ ([]);
  const ch = creerChargeurTuiles({ reseau: reseauFactice({}, appels, 0), decoder });
  for (let i = 0; i < 4; i++) await assert.rejects(ch.charger({ z: 12, x: i, y: 0 }, 'mapterhorn', 512, true));
  const avant = appels.length;
  await assert.rejects(ch.charger({ z: 12, x: 9, y: 0 }, 'mapterhorn', 512, true), /injoignable/);
  assert.equal(appels.length, avant);
  ch.reinitialiser(); await assert.rejects(ch.charger({ z: 12, x: 9, y: 0 }, 'mapterhorn', 512, true)); assert.ok(appels.length > avant);
});

/** Chargeur de terrain synthétique : tuiles Terrarium calculées, avec un relief fin éventuellement absent. */
function chargeurSynth({ fin = true, ordre = /** @type {string[]} */ ([]) } = {}) {
  return {
    async charger(/** @type {{z:number,x:number,y:number}} */ t, /** @type {string} */ _s, /** @type {number} */ ts, /** @type {boolean} */ garantie) {
      ordre.push(garantie ? 'loin' : 'fin');
      if (!garantie && !fin) return { data: null, fromCache: false, missing: true, sea: false };
      return { data: tuile(t.z, t.x, t.y, ts), fromCache: false };
    },
  };
}
const masqueRapide = (/** @type {any} */ b, /** @type {any} */ c, /** @type {number} */ o) => calculerMasque(b, c, o, async () => {});

test('terrain : relief lointain publié d’abord, puis le fin ; le sol est relu dans le relief fin', async () => {
  const ordre = /** @type {string[]} */ ([]), pubs = /** @type {any[]} */ ([]);
  const r = await calculerTerrain({ pos: POS, source: 'mapterhorn', chargeur: chargeurSynth({ ordre }), masque: masqueRapide, publier: (t) => pubs.push(t) });
  assert.equal(r.repli, false);
  assert.equal(pubs.length, 2); assert.equal(pubs[0].partial, true); assert.equal(pubs[0].refining, true); assert.equal(pubs[1].refining, false); assert.equal(pubs[1].partial, false);
  assert.ok(ordre.indexOf('fin') > ordre.lastIndexOf('loin'), 'toutes les tuiles garanties avant les tuiles fines');
  assert.match(pubs[1].origine, /relief fin/); assert.equal(pubs[1].pm.length, NB_RELEVEMENTS); assert.equal(pubs[1].pm[0].length, DISTANCES_KM.length);
  assert.ok(pubs[1].pm.raw && pubs[1].pm.raw.length === NB_RELEVEMENTS);
  assert.ok(Math.abs(pubs[1].h0 - (pubs[1].solM + 1.6)) < 1e-9);
});

test('terrain : sans relief fin → un seul calcul utile, partial = false (rien n’a échoué)', async () => {
  const r = await calculerTerrain({ pos: POS, source: 'mapterhorn', chargeur: chargeurSynth({ fin: false }), masque: masqueRapide, publier: () => {} });
  assert.equal(r.repli, false); if (r.repli) return;
  assert.equal(r.terrain.partial, false); assert.ok(r.bilan.horsCouverture > 0); assert.match(r.terrain.origine, /données fines|modèle 30 m/);
});

test('terrain : toutes les tuiles garanties en échec → repli AWS demandé, puis calcul avec les tuiles AWS', async () => {
  const sources = /** @type {string[]} */ ([]);
  const chargeur = { async charger(/** @type {any} */ t, /** @type {string} */ s, /** @type {number} */ ts, /** @type {boolean} */ _g) { sources.push(s); if (s === 'mapterhorn') throw new Error('panne'); return { data: tuile(t.z, t.x, t.y, ts), fromCache: false, missing: false }; } };
  const premier = await calculerTerrain({ pos: POS, source: 'mapterhorn', chargeur, masque: masqueRapide, publier: () => {} });
  assert.deepEqual(premier, { repli: true });
  const r = await calculerTerrainAvecRepli({ pos: POS, source: 'mapterhorn', chargeur, masque: masqueRapide, publier: () => {} });
  assert.equal(r.repliAws, true); assert.equal(r.source, 'aws'); assert.ok(sources.includes('aws'));
});

test('terrain : aucune tuile → erreur claire', async () => {
  const chargeur = { async charger() { throw new Error('panne'); } };
  await assert.rejects(calculerTerrain({ pos: POS, source: 'aws', chargeur, masque: masqueRapide, publier: () => {} }), /aucune tuile/);
});

test('terrain : correction manuelle de la hauteur d’œil', async () => {
  const a = await calculerTerrain({ pos: POS, source: 'mapterhorn', chargeur: chargeurSynth({ fin: false }), masque: masqueRapide, publier: () => {} });
  const b = await calculerTerrain({ pos: POS, source: 'mapterhorn', chargeur: chargeurSynth({ fin: false }), masque: masqueRapide, correctionOeilM: 5, publier: () => {} });
  if (a.repli || b.repli) throw new Error('repli inattendu');
  assert.ok(Math.abs(b.terrain.h0 - a.terrain.h0 - 5) < 1e-9);
});

test('masque : le découpage en tranches ne change pas le résultat', async () => {
  const { creerBandes, BANDES_HR } = await import('../../src/scene/relief.js');
  const bands = creerBandes(BANDES_HR, POS);
  for (const b of bands) for (let i = 0; i < b.tiles.length; i++) b.tiles[i] = tuile(b.z, b.tx0 + (i % b.nx), b.ty0 + Math.floor(i / b.nx), b.ts);
  let cessions = 0, t = 0;
  const a = await calculerMasque(bands, POS, 15.6, async () => {}, { horloge: () => 0 });
  const b = await calculerMasque(bands, POS, 15.6, async () => { cessions++; }, { budgetMs: 1, horloge: () => (t += 1) });
  assert.ok(cessions > 100, `cessions ${cessions}`);
  assert.deepEqual(a.map((r) => [...r]), b.map((r) => [...r]));
});
