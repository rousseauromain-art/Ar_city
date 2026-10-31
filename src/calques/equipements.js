// @ts-check
/**
 * Calque « équipements » : les équipements urbains (stades, gares, canaux, parcs, places, théâtres, ponts, hôpitaux…) et les pylônes télécom (ANFR). Tous deux
 * se posent dans la bande sous l'horizon (rendu/bande.js) : ce calque classe puis prépare les éléments, il ne place ni ne dessine rien.
 * Équipements urbains : visibles de PRÈS seulement (portée selon le type), 25 au plus par notoriété, jamais en transparence (la v1 n'en montre aucun en
 * « Tout voir » : un équipement caché ou lointain est simplement absent). Pylônes : dans la portée réglée. Fonctions pures.
 * Reprend la partie équipements de `visibleCities`, la préparation de la bande de `draw()` et `monName` de la v1.
 * Entrées : équipements (donnees/monuments-wikidata.js, cat « equip »), supports (donnees/telecom.js), position, relief. Sorties : éléments classés, couches de bande.
 * Dépend de : noyau, scene, rendu/bande.js, donnees/telecom.js.
 */
import { distanceEtCap } from '../noyau/geo.js';
import { RAD } from '../noyau/constantes.js';
import { normaliser } from '../noyau/texte.js';
import { verdictRelief } from '../scene/visibilite.js';
import { villeDense, comparateurAffichage } from '../scene/liste-affichage.js';
import { PLURIELS_INFRA } from '../noyau/constantes.js';
import { operateurs } from '../donnees/telecom.js';

/** @typedef {import('../donnees/monuments-wikidata.js').Monument} Monument */
/** @typedef {import('../donnees/telecom.js').SiteTelecom} SiteTelecom */
/** @typedef {Monument & {dist: number, brg: number, angH: number, far: boolean, cap: boolean, rang: number | null, hidden: boolean, low: boolean, aG: number | null, aP: number | null, mask: number | null}} EquipementCalcule */
/** @typedef {{el: EquipementCalcule, etat: 'net' | 'transparent' | 'absent', raison: string | null}} EquipementClasse */
/** @typedef {{el: SiteTelecom & {dist: number, brg: number}, etat: 'net' | 'absent', raison: string | null}} PylonneClasse */
/** @typedef {import('../rendu/bande.js').CoucheBande} CoucheBande */

/** Équipements affichés au plus (les plus connus), portée par défaut et portée par type (km). */
export const EQUIP_AFFICHES_MAX = 25;
const EQUIP_PORTEE_KM = 6;
const EQUIP_PORTEE_TYPE = Object.freeze(/** @type {Record<string, number>} */ ({ stade: 8, pont: 8, edifice: 5, gare: 5, scene: 5, eau: 6, parc: 5, place: 4 }));
/** Couleurs de la bande : équipements urbains (bleu), pylônes (rouge). */
const COULEUR_EQUIPEMENTS = Object.freeze({ ligne: 'rgba(120,205,232,.85)', texte: '#78CDE8', icone: '#78CDE8' });
const COULEUR_PYLONES = Object.freeze({ ligne: 'rgba(232,90,90,.85)', texte: '#E85A5A', icone: '#E85A5A' });
/** Pluriel d'un groupe d'équipements (par type d'icône). */
export const PLURIELS_EQUIPEMENTS = Object.freeze(/** @type {Record<string, string>} */ ({ stade: 'stades', gare: 'gares et stations', eau: 'cours d’eau', parc: 'parcs', place: 'places', scene: 'salles', pont: 'ponts', edifice: 'édifices' }));

/** Type devant le nom quand le nom ne le dit pas (« gare · Rennes », « canal · Ille »), d'après les classes Wikidata. */
const TYPES_COURTS = /** @type {[RegExp, string][]} */ ([[/m[ée]tro|subway|rapid transit/, 'métro'], [/tram/, 'tram'], [/a[ée]roport|airport/, 'aéroport'], [/gare|railway|train station/, 'gare'], [/\bport\b|harbou?r|marina/, 'port'],
  [/canal|canaux/, 'canal'], [/fleuve|rivi[èe]re|river|cours d.eau|stream|ruisseau/, 'rivière'], [/lac\b|lake|[ée]tang|pond|plan d.eau/, 'plan d’eau'], [/barrage|\bdam\b/, 'barrage'],
  [/jardin|garden/, 'jardin'], [/cimeti|cemetery/, 'cimetière'], [/for[êe]t|forest|\bbois\b/, 'bois'], [/\bzoo\b/, 'zoo'], [/parc|park/, 'parc'], [/place|plaza|square|piazza/, 'place'],
  [/stade|stadium|arena/, 'stade'], [/piscine|swimming/, 'piscine'], [/patinoire|ice rink/, 'patinoire'], [/hippodrome/, 'hippodrome'], [/th[ée][âa]tre|theat/, 'théâtre'], [/op[ée]ra/, 'opéra'],
  [/cin[ée]ma/, 'cinéma'], [/biblioth|library|m[ée]diath/, 'bibliothèque'], [/pont|bridge|viaduc|passerelle/, 'pont'], [/h[ôo]pital|hospital|clinique/, 'hôpital'],
  [/universit|campus|facult/, 'université'], [/lyc[ée]e|coll[èe]ge|[ée]cole|school/, 'école'], [/prison/, 'prison'], [/march[ée]|market|halles/, 'marché']]);
/** Le nom dit déjà le type : inutile de le répéter. */
const NOM_DIT_LE_TYPE = /^(place|rue|avenue|boulevard|mail|esplanade|square|parvis|rond-point|quai|cours|pont|parc|jardin|stade|gare|canal|lac|etang|theatre|opera|hopital|universite|lycee|college|ecole|piscine|patinoire|hippodrome|cimetiere|marche|halles|metro|station|cinema|bibliotheque|mediatheque)\b/;
const TYPE_PAR_ICONE = /** @type {Record<string, string>} */ ({ gare: 'gare', parc: 'parc', place: 'place', stade: 'stade', pont: 'pont' });

/** Nom affiché d'un équipement : type devant si le nom ne le dit pas, 28 caractères au plus (v1 : `monName`, branche équipement). @param {{name?: string, types?: string, type?: string}} c */
export function nomEquipement(c) {
  let n = String(c.name || '');
  const t = String(c.types || '').toLowerCase(), nn = normaliser(n);
  let pre = '';
  for (const [re, w] of TYPES_COURTS) if (re.test(t)) { pre = w; break; }
  if (!pre) pre = TYPE_PAR_ICONE[/** @type {string} */ (c.type)] || '';
  if (pre && !nn.includes(normaliser(pre)) && !NOM_DIT_LE_TYPE.test(nn)) n = pre + ' · ' + n;
  if (n.length <= 28) return n;
  const k = n.lastIndexOf(' ', 27);
  return n.slice(0, k > 12 ? k : 27) + '…';
}

/**
 * Classe les équipements urbains. Renvoie TOUS ceux du rayon (même lointains ou cachés : ils comptent dans le tri et le dédoublonnage commun avec les lieux et les
 * monuments) ; seuls ceux d'état « net » sont posés. Calque éteint : rien (ils ne comptent alors pas non plus dans le dédoublonnage).
 * @param {Monument[]} equipements @param {{pos: {lat: number, lon: number}, terrain: {h0: number, pm: import('../scene/masque.js').Masque, bands: import('../scene/relief.js').Bande[]} | null,
 *   cities: {kind: string, pop?: number, lat: number, lon: number}[], batiments: {kind?: string, lat: number, lon: number}[], monuments?: Monument[]}} scene
 * @param {{rayonKm: number, relief: boolean, couche: boolean}} reglages
 * @returns {{classes: EquipementClasse[], dense: boolean}}
 */
export function classerEquipements(equipements, scene, reglages) {
  const { pos, terrain } = scene, avecRelief = reglages.relief && !!terrain;
  const dense = villeDense({ pos, cities: scene.cities, monuments: scene.monuments || equipements, batiments: scene.batiments });
  if (!reglages.couche) return { classes: [], dense };
  const masque = terrain ? { oeilM: terrain.h0, pm: terrain.pm } : null;
  /** @type {EquipementCalcule[]} */
  const cs = [];
  for (const m of equipements) {
    if (m.cat !== 'equip') continue;
    const { distKm, capDeg } = distanceEtCap(pos, m);
    if (distKm > reglages.rayonKm) continue;
    const v = masque && terrain ? verdictRelief(masque, terrain.bands, { ...m, dist: distKm, brg: capDeg }) : null;
    cs.push({ ...m, dist: distKm, brg: capDeg, angH: Math.atan((m.ht || 0) / Math.max(50, distKm * 1000)) / RAD, far: distKm > (EQUIP_PORTEE_TYPE[m.type] || EQUIP_PORTEE_KM), cap: false, rang: null,
      hidden: v ? v.hidden : false, low: v ? v.low : false, aG: v ? v.aG : null, aP: v ? v.aP : null, mask: v ? v.mask : null });
  }
  cs.sort(comparateurAffichage(dense));
  let n = 0;
  for (const c of cs) { // plafond : les plus connus seulement
    c.rang = c.far ? null : n + 1;
    if (!c.far && ++n > EQUIP_AFFICHES_MAX) { c.far = true; c.cap = true; }
  }
  const classes = cs.map((el) => {
    const absent = el.far || (avecRelief && el.hidden);
    const raison = !absent ? null : el.cap ? 'au-delà du plafond de noms nets' : el.far ? 'hors de portée de ce type d’équipement' : 'caché par le relief';
    return /** @type {EquipementClasse} */ ({ el, etat: absent ? 'absent' : 'net', raison });
  });
  return { classes, dense };
}

/**
 * Couche de bande des équipements urbains posés (filtre par nom : réglage « chercher »).
 * @param {EquipementClasse[]} classes dans l'ordre de la liste commune @param {{filtre?: string}} reglages @returns {CoucheBande | null}
 */
export function preparerEquipements(classes, reglages) {
  const fq = reglages.filtre ? normaliser(reglages.filtre) : '';
  const elements = classes.filter((c) => c.etat === 'net' && (!fq || normaliser(c.el.name).includes(fq))).map(({ el }) => {
    const nom = nomEquipement(el);
    return { nom, icone: el.type, dist: el.dist, brg: el.brg, idMemoire: String(/** @type {any} */ (el).sup_id || nom + el.lat), source: el };
  });
  if (!elements.length) return null;
  return { cle: 'eq', elements, couleur: COULEUR_EQUIPEMENTS, groupePar: 'icone', rangees: 2, iconeDy: 17, tailleK: 0.72, aCote: true, pluriels: PLURIELS_EQUIPEMENTS, pluralParDefaut: 'lieux' };
}

/**
 * Classe les supports télécom : nets dans la portée réglée, sinon absents.
 * @param {SiteTelecom[]} sites @param {{pos: {lat: number, lon: number}}} scene @param {{telecom: boolean, portee: number}} reglages portée en km
 * @returns {PylonneClasse[]}
 */
export function classerPylones(sites, scene, reglages) {
  if (!reglages.telecom) return [];
  return sites.map((s) => {
    const { distKm, capDeg } = distanceEtCap(scene.pos, s), loin = distKm > reglages.portee;
    return { el: { ...s, dist: distKm, brg: capDeg }, etat: loin ? 'absent' : 'net', raison: loin ? `au-delà de la portée réglée (${reglages.portee} km)` : null };
  });
}

/** Couche de bande des pylônes posés : pastilles d'opérateurs et badge 5G d'un groupe. @param {PylonneClasse[]} classes @returns {CoucheBande | null} */
export function preparerPylones(classes) {
  const elements = classes.filter((c) => c.etat === 'net').map(({ el }) => ({ nom: el.name, icone: el.icon, dist: el.dist, brg: el.brg, idMemoire: String(el.sup_id || el.name + el.lat), source: el }));
  if (!elements.length) return null;
  return { cle: 'tel', elements, couleur: COULEUR_PYLONES, pluriels: PLURIELS_INFRA,
    decorations: (items) => ({ pastilles: operateurs(items.flatMap((t) => /** @type {SiteTelecom} */ (t.source).operators || [])), g5: items.some((t) => /** @type {SiteTelecom} */ (t.source).g5) }) };
}

/** Calque équipements (interface commune, REFONTE.md §7). */
export const calque = {
  id: 'equipements',
  libelle: 'Équipements',
  /** @param {unknown} _zone @param {{monuments: Monument[]}} donnees */
  async charger(_zone, donnees) { return donnees.monuments.filter((m) => m.cat === 'equip'); },
  classer: classerEquipements,
  preparer: preparerEquipements,
};
