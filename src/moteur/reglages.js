// @ts-check
/**
 * Réglages de l'application (v1 : l'objet `S`). Mêmes clés que la v1 pour que le moteur, qui reprend son comportement, les lise telles quelles.
 * Valeurs par défaut, liste blanche des clés mémorisées, fusion avec des réglages enregistrés (migration comprise), mémorisation sous `vh2:reglages`
 * (la v1 garde `vh_settings_v2` : les deux ne se gênent pas). Le filtre par nom n'est jamais mémorisé. Fonctions pures, sauf lire/ecrire (stockage injecté).
 */

/**
 * @typedef {object} Reglages
 * @property {boolean} cross croix de visée @property {boolean} gyro fusion boussole/gyroscope @property {boolean} photoVis analyse de la photo (étape 10)
 * @property {boolean} simOn position simulée @property {string} simPos « lat, lon » simulé @property {number} radius rayon des lieux (km) @property {number} camFov champ de la caméra (côté large, °)
 * @property {boolean} hamlets hameaux @property {boolean} lune afficher le symbole de la lune @property {boolean} relief tenir compte du relief pour cacher ce qui est derrière (masquage) @property {boolean} autoRelief « Caler auto » : le relief avant le soleil (défaut non : le soleil visible est exact) @property {boolean} calculRelief calculer le relief (ligne d'horizon, crêtes, calage) : indépendant du masquage @property {boolean} oeilGps en direct, recaler la hauteur d'œil sur l'altitude GPS quand elle est précise @property {number} obsHeight correction de la hauteur d'œil (m)
 * @property {boolean} showDist distances affichées @property {string} filter recherche par nom (jamais mémorisée) @property {number} headOff décalage de cap (°) @property {number} pitchOff décalage d'horizon (°)
 * @property {boolean} air @property {boolean} sea @property {number} airMax @property {number} seaMax avions et bateaux, portées (km)
 * @property {boolean} skyline ligne d'horizon du relief @property {boolean} ridges crêtes intérieures @property {boolean} beyond bouton œil (Tout voir)
 * @property {boolean} telecom @property {number} telecomMax pylônes (km) @property {boolean} buildings @property {number} buildingsMax repères hauts (km) @property {boolean} chipsFold puces repliées
 * @property {{places: boolean, monuments: boolean, equip: boolean, urban: boolean, urbClip: boolean, urbSmooth: boolean, urbFill: boolean}} layers calques
 * @property {Record<string, boolean>} poi catégories de lieux remarquables recherchées
 */

/** @returns {Reglages} réglages par défaut (v1 l. 440). */
export const reglagesParDefaut = () => ({ cross: false, gyro: true, photoVis: false, simOn: false, simPos: '', radius: 60, camFov: 67, hamlets: false, lune: true, relief: true, calculRelief: true, autoRelief: false, obsHeight: 0, oeilGps: true, showDist: true, filter: '',
  headOff: 0, pitchOff: 0, air: false, sea: false, airMax: 120, seaMax: 40, skyline: true, ridges: true, beyond: false, telecom: false, telecomMax: 8, buildings: false, buildingsMax: 12, chipsFold: false,
  layers: { places: true, monuments: true, equip: true, urban: false, urbClip: true, urbSmooth: true, urbFill: true },
  poi: { lighthouse: true, cape: true, rock: true, view: false, heritage: false, beach: false } });

/** Clés mémorisées (liste blanche) ; `layers` et `poi` sont fusionnés clé par clé. */
export const CLES_MEMORISEES = Object.freeze(['cross', 'gyro', 'photoVis', 'simOn', 'simPos', 'radius', 'camFov', 'hamlets', 'lune', 'relief', 'calculRelief', 'autoRelief', 'obsHeight', 'oeilGps', 'showDist', 'headOff', 'pitchOff', 'air', 'sea', 'airMax', 'seaMax',
  'skyline', 'ridges', 'beyond', 'telecom', 'telecomMax', 'buildings', 'buildingsMax', 'chipsFold']);

/**
 * Fusionne des réglages enregistrés (peut être n'importe quoi) dans les valeurs par défaut : clés connues seulement, `undefined` ignoré (v1 : `loadSettings`).
 * Migration : l'ancienne clé `autoCal` éteint l'analyse de la photo.
 * @param {unknown} enregistres @returns {Reglages}
 */
export function fusionnerReglages(enregistres) {
  const S = /** @type {Record<string, any>} */ (reglagesParDefaut());
  if (!enregistres || typeof enregistres !== 'object') return /** @type {Reglages} */ (S);
  const e = /** @type {Record<string, any>} */ (enregistres);
  for (const k of CLES_MEMORISEES) if (e[k] !== undefined) S[k] = e[k];
  if (e.poi && typeof e.poi === 'object') Object.assign(S.poi, e.poi);
  if (e.layers && typeof e.layers === 'object') Object.assign(S.layers, e.layers);
  if (e.autoCal !== undefined) S.photoVis = false;
  return /** @type {Reglages} */ (S);
}

/** Ce qui est mémorisé : liste blanche + `poi` + `layers`, sans le filtre. En photo rejouée, le calage d'avant la photo remplace celui de la photo. @param {Reglages} S @param {Partial<Reglages> | null} [sauvegardePhoto] */
export function reglagesAMemoriser(S, sauvegardePhoto = null) {
  const src = /** @type {Record<string, any>} */ (sauvegardePhoto ? { ...S, ...sauvegardePhoto } : S), out = /** @type {Record<string, any>} */ ({});
  for (const k of CLES_MEMORISEES) out[k] = src[k];
  out.poi = { ...S.poi }; out.layers = { ...S.layers };
  return out;
}

/** @param {ReturnType<typeof import('../outils/stockage.js').creerStockage>} stockage @returns {Reglages} */
export const lireReglages = (stockage) => fusionnerReglages(stockage.lire('reglages', { parDefaut: null }));
/** @param {ReturnType<typeof import('../outils/stockage.js').creerStockage>} stockage @param {Reglages} S @param {Partial<Reglages> | null} [sauvegardePhoto] @returns {boolean} */
export const ecrireReglages = (stockage, S, sauvegardePhoto = null) => stockage.ecrire('reglages', reglagesAMemoriser(S, sauvegardePhoto));

/** Clés d'AFFICHAGE reprises de la v1 : jamais le calage (`headOff`, `pitchOff`, `camFov`), propre à chaque photo ou à chaque appareil, ni la position simulée. */
export const CLES_REPRISES_V1 = Object.freeze(['skyline', 'ridges', 'relief', 'radius', 'hamlets', 'showDist', 'beyond', 'telecom', 'buildings', 'air', 'sea', 'obsHeight', 'layers', 'poi']);
/** Clé des réglages de la v1 (lue, jamais écrite). */
const CLE_REGLAGES_V1 = 'vh_settings_v2';

/**
 * Premier lancement de ce correctif : reprend UNE fois les réglages d'affichage de la v1 (lecture seule, même origine), pour que la v2 ressemble à la v1
 * (ligne de relief, rayon, calques…). Marque `reglages-v1-repris` pour ne le refaire jamais. @param {ReturnType<typeof import('../outils/stockage.js').creerStockage>} stockage
 * @param {(cle: string) => string | null} lireLocal @returns {boolean} des réglages ont été repris
 */
export function reprendreReglagesV1(stockage, lireLocal) {
  if (stockage.lire('reglages-v1-repris', { parDefaut: false })) return false;
  stockage.ecrire('reglages-v1-repris', true);
  let v1;
  try { v1 = JSON.parse(lireLocal(CLE_REGLAGES_V1) || 'null'); } catch { return false; }
  if (!v1 || typeof v1 !== 'object') return false;
  const repris = /** @type {Record<string, any>} */ ({});
  for (const k of CLES_REPRISES_V1) if (v1[k] !== undefined) repris[k] = v1[k];
  if (!Object.keys(repris).length) return false;
  const avant = /** @type {Record<string, any>} */ (stockage.lire('reglages', { parDefaut: null }) || {}); // réglages déjà enregistrés par la v2 : l'affichage de la v1 les remplace, le reste est gardé
  return stockage.ecrire('reglages', { ...avant, ...repris, layers: { ...avant.layers, ...repris.layers }, poi: { ...avant.poi, ...repris.poi } });
}
