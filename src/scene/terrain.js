// @ts-check
/**
 * Terrain d'un lieu : tuiles de relief en deux passes (lointain garanti d'abord, relief fin ensuite), hauteur d'œil, masque.
 * Entrées : position, chargeur de tuiles, calcul du masque. Sortie : publications successives { c, h0, bands, pm, partial, refining, src, solM, origine }.
 * Reprend computeTerrain de la v1 sans changer le résultat ; la v1 garde l'état global, ici tout est passé en paramètres.
 * Dépend de : scene/relief.js, scene/hauteur-oeil.js, scene/masque.js.
 */
import { creerBandes, BANDES_HR, BANDES_AWS } from './relief.js';
import { estimerSol, solFin, altitudeOeil, ORIGINE_SOL } from './hauteur-oeil.js';

/** @typedef {import('./relief.js').Bande} Bande */
/** @typedef {import('./masque.js').Masque} Masque */
/**
 * @typedef {object} Terrain
 * @property {{lat: number, lon: number}} c @property {number} h0 altitude de l'œil (m) @property {Bande[]} bands @property {Masque} pm
 * @property {number} at instant de publication @property {boolean} partial des tuiles manquent @property {boolean} refining relief fin en cours
 * @property {'mapterhorn' | 'aws'} src @property {number} solM sol sous les pieds @property {string} origine origine de l'estimation du sol
 * @typedef {{tuiles: number, cache: number, echecs: number, echecsGarantis: number, mer: number, horsCouverture: number, aws: number, ms: number}} Bilan
 */

/** Tuiles chargées en parallèle. */
const PARALLELE = 4;

/**
 * @param {{
 *   pos: {lat: number, lon: number},
 *   source: 'mapterhorn' | 'aws',
 *   chargeur: {charger: (t: {z: number, x: number, y: number}, source: 'mapterhorn' | 'aws', ts: number, garantie: boolean) => Promise<import('../donnees/tuiles-relief.js').TuileChargee>},
 *   masque: import('./masque.js').CalculMasque,
 *   correctionOeilM?: number,
 *   publier: (t: Terrain) => void,
 *   progression?: (fait: number, total: number) => void,
 *   maintenant?: () => number,
 * }} p
 * @returns {Promise<{repli: true} | {repli: false, terrain: Terrain, bilan: Bilan}>} `repli` : Mapterhorn injoignable, à relancer avec la source 'aws'
 */
export async function calculerTerrain({ pos, source, chargeur, masque, correctionOeilM = 0, publier, progression, maintenant = Date.now }) {
  const t0 = maintenant(), c = { lat: pos.lat, lon: pos.lon };
  const bands = creerBandes(source === 'aws' ? BANDES_AWS : BANDES_HR, c);
  /** @type {{b: Bande, idx: number, x: number, y: number}[]} */
  const tous = [];
  for (const b of bands) for (let iy = 0; iy < b.ny; iy++) for (let ix = 0; ix < b.nx; ix++) tous.push({ b, idx: iy * b.nx + ix, x: b.tx0 + ix, y: b.ty0 + iy });
  const lointains = tous.filter((j) => j.b.garantie), proches = tous.filter((j) => !j.b.garantie);
  const bilan = { tuiles: tous.length, cache: 0, echecs: 0, echecsGarantis: 0, mer: 0, horsCouverture: 0, aws: 0, ms: 0 };
  let fait = 0;

  /** @param {typeof tous} jobs */
  const executer = async (jobs) => {
    let suivant = 0;
    const ouvrier = async () => {
      while (suivant < jobs.length) {
        const j = jobs[suivant++];
        try {
          const r = await chargeur.charger({ z: j.b.z, x: j.x, y: j.y }, source, j.b.ts, j.b.garantie);
          j.b.tiles[j.idx] = r.data;
          if (r.fromCache) bilan.cache++;
          if (r.alt) { bilan.aws++; (j.b.altIdx = j.b.altIdx || new Set()).add(j.idx); }
          if (r.missing) { if (r.sea) bilan.mer++; else bilan.horsCouverture++; }
        } catch {
          bilan.echecs++; // compté au bilan, nouvel essai planifié par l'appelant (terrain.partial)
          if (j.b.garantie) bilan.echecsGarantis++;
        }
        fait++;
        if (progression) progression(fait, tous.length);
      }
    };
    await Promise.all(Array.from({ length: PARALLELE }, ouvrier));
  };

  await executer(lointains);
  if (source === 'mapterhorn' && lointains.length > 0 && bilan.echecsGarantis === lointains.length) return { repli: true };
  if (lointains.length > 0 && bilan.echecs === lointains.length) throw new Error("aucune tuile d'altitude disponible (réseau ?)");

  const sol0 = estimerSol(bands, c);
  let { solM, origine } = sol0;
  let h0 = altitudeOeil(solM, correctionOeilM);
  const construire = (/** @type {Masque} */ pm, /** @type {boolean} */ partial, /** @type {boolean} */ refining) =>
    /** @type {Terrain} */ ({ c, h0, bands, pm, at: maintenant(), partial, refining, src: source, solM: Number.isNaN(solM) ? 0 : solM, origine });

  // 1re publication : relief lointain seul (la bande fine, encore vide, est sautée par altitudeEn) — un calage peut déjà s'en servir.
  let pm = await masque(bands, c, h0);
  publier(construire(pm, true, proches.length > 0));
  if (proches.length) {
    await executer(proches); // 2e passe, en arrière-plan : le relief fin
    // Le sol est relu dans le relief fin (modèle de terrain, sans les toits) : sur un rempart, l'œil n'est plus au niveau de la mer.
    const ef = solFin(bands, c);
    if (!Number.isNaN(ef)) { origine = ORIGINE_SOL.finRelu; solM = ef; h0 = altitudeOeil(ef, correctionOeilM); }
    pm = await masque(bands, c, h0);
  }
  const terrain = construire(pm, bilan.echecs > 0, false);
  bilan.ms = maintenant() - t0;
  publier(terrain);
  return { repli: false, terrain, bilan };
}

/**
 * Terrain avec repli automatique : si Mapterhorn est injoignable (échec de toutes les tuiles garanties), relance avec les tuiles AWS.
 * @param {Parameters<typeof calculerTerrain>[0]} p
 * @returns {Promise<{terrain: Terrain, bilan: Bilan, source: 'mapterhorn' | 'aws', repliAws: boolean}>}
 */
export async function calculerTerrainAvecRepli(p) {
  const r = await calculerTerrain(p);
  if (!r.repli) return { terrain: r.terrain, bilan: r.bilan, source: p.source, repliAws: false };
  const r2 = await calculerTerrain({ ...p, source: 'aws' });
  if (r2.repli) throw new Error('repli AWS impossible'); // inatteignable : le repli ne se déclenche que depuis Mapterhorn
  return { terrain: r2.terrain, bilan: r2.bilan, source: 'aws', repliAws: true };
}
