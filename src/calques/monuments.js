// @ts-check
/**
 * Calque « monuments » : classement d'affichage (Essentiel / Tout voir, avec la raison de chaque absence) puis préparation des icônes, silhouettes et noms.
 * Le placement et le dessin des noms sont faits par rendu/ pour TOUS les calques : ce calque ne place rien lui-même.
 * Essentiel : seulement les monuments visibles d'ici. Tout voir : en plus, en transparence, ceux qu'on ne voit pas (trop petits ou trop loin, plus bas que les
 * toits, au-delà du plafond de noms nets, cachés par un monument devant, par le relief ou sur la photo) — posés APRÈS les visibles.
 * Entrées : monuments (donnees/monuments-*.js), position, relief, analyse de la photo, vue. Sorties : éléments classés, étiquettes de style « monument ».
 * Fonctions pures. Reprend la partie monuments de `visibleCities` et de la boucle de `draw()` de la v1. Les équipements urbains (cat « equip ») : étape 7.
 * Dépend de : noyau, scene, noyau/projection.js, noyau/icones.js.
 */
import { distanceEtCap } from '../noyau/geo.js';
import { normaliser } from '../noyau/texte.js';
import { RAD, HAUTEUR_YEUX_M, LARGEUR_TYPE_M, ANALYSE_VALIDE_MS } from '../noyau/constantes.js';
import { cleMonument } from '../scene/cles.js';
import { ecartAngle, borner } from '../noyau/maths.js';
import { verdictRelief } from '../scene/visibilite.js';
import { angleSilhouette } from '../scene/cretes.js';
import { verifierSurPhoto } from '../scene/regle-photo.js';
import { villeDense, comparateurAffichage, HAUTEUR_TOITS_M } from '../scene/liste-affichage.js';
import { MON_STAR_LINKS } from '../donnees/monuments-wikidata.js';
import { abscisseSiVisible, yDepuisSite, focalePx } from '../noyau/projection.js';
import { cleSilhouette, SILHOUETTES, SILHOUETTES_DISTINCTES, SILHOUETTE_MIN_PX } from '../noyau/icones.js';

/** @typedef {import('../donnees/monuments-wikidata.js').Monument} Monument */
/** @typedef {import('../noyau/projection.js').VueRendu} VueRendu */
/** @typedef {import('./photo-silhouette.js').AnalysePhoto} AnalysePhoto */
/** @typedef {Monument & {dist: number, brg: number, angH: number, far: boolean, roof: boolean, cap: boolean, near: boolean, occBy: string | null, photoHid: boolean, snapDB: number, rang: number | null,
 *   hidden: boolean, low: boolean, aG: number | null, aP: number | null, mask: number | null}} MonumentCalcule */
/** @typedef {{el: MonumentCalcule, etat: 'net' | 'transparent' | 'absent', raison: string | null}} MonumentClasse */

/** Angle apparent minimal (°) pour qu'un monument soit visible d'ici ; seuil abaissé pour un monument très célèbre (jamais supprimé). */
const ANGLE_MIN_DEG = 0.12;
const ANGLE_MIN_CELEBRE_DEG = 0.05;
/** Noms nets au plus (les plus célèbres seulement, le reste en transparence). */
export const NOMS_NETS_MAX = 40;
/** Les N monuments les plus proches (≤ 1,5 km) sont toujours nets et ne comptent pas dans le plafond. */
export const PROCHES_TOUJOURS_NETS = 15;
const PROCHES_RAYON_KM = 1.5;
/** Ville dense : un monument plus bas que les toits (20 m + 5) à plus de 400 m n'est pas visible. */
const TOITS_DISTANCE_KM = 0.4;
/** Statues OSM : de près seulement (800 m, 300 m en ville dense). */
const STATUE_PORTEE_KM = 0.8;
const STATUE_PORTEE_DENSE_KM = 0.3;
/** Marge angulaire (°) de la fenêtre de masquage entre monuments. */
const MASQUAGE_MARGE_DEG = 0.2;
/** Plafond de la hauteur d'un monument à l'écran : 30 % de l'écran, 240 px. */
const TAILLE_MAX_ECRAN = 0.3, TAILLE_MAX_PX = 240;
/** On monte un monument sur la silhouette finale si elle est à moins de 0,5° au-dessus du relief devant lui. */
const REMONTEE_CIEL_DEG = 0.5;

/**
 * @typedef {object} SceneMonuments
 * @property {{lat: number, lon: number}} pos @property {{h0: number, pm: import('../scene/masque.js').Masque, bands: import('../scene/relief.js').Bande[]} | null} terrain
 * @property {AnalysePhoto | null} analysePhoto @property {number} maintenantMs @property {number} [correctionOeilM]
 * @property {{name: string, kind: string, pop?: number, lat: number, lon: number}[]} cities lieux (ville dense, noms abrégés)
 * @property {{kind?: string, lat: number, lon: number}[]} batiments bâtiments hauts (ville dense)
 * @property {Map<string, number>} [snapPrecedent] calage fin de l'image précédente, par monument (lissé)
 * @property {boolean} [analyseDejaAppliquee] la silhouette lue de cette analyse a déjà fait avancer le lissage du calage fin : la v1 ne recalcule sa liste qu'à chaque nouvelle analyse (toutes les 3 s), pas à chaque image
 * @typedef {object} ReglagesMonuments
 * @property {number} rayonKm @property {boolean} relief @property {boolean} toutVoir @property {boolean} analyseActive @property {boolean} couche calque « monuments » activé
 */


/**
 * Classe les monuments (hors équipements). Le résultat suit l'ordre d'affichage (notoriété × hauteur apparente, puis distance) ; `etat` et `raison` suivent
 * REFONTE.md §4. Le tri ENTRE calques et le dédoublonnage sont faits par scene/liste-affichage.js. Renvoie aussi le calage lissé à réinjecter à l'image suivante.
 * @param {Monument[]} monuments @param {SceneMonuments} scene @param {ReglagesMonuments} reglages
 * @returns {{classes: MonumentClasse[], dense: boolean, snapSuivant: Map<string, number>}}
 */
export function classerMonuments(monuments, scene, reglages) {
  const { pos, terrain } = scene, avecRelief = reglages.relief && !!terrain;
  const dense = villeDense({ pos, cities: scene.cities, monuments, batiments: scene.batiments });
  const masque = terrain ? { oeilM: terrain.h0, pm: terrain.pm } : null;
  /** @type {MonumentCalcule[]} */
  const cs = [];
  for (const m of monuments) {
    if (m.cat === 'equip') continue;
    const { distKm, capDeg } = distanceEtCap(pos, m);
    if (distKm > reglages.rayonKm) continue;
    if (m.src === 'osms' && distKm > (dense ? STATUE_PORTEE_DENSE_KM : STATUE_PORTEE_KM)) continue; // statue : de près seulement
    const v = masque && terrain ? verdictRelief(masque, terrain.bands, { ...m, dist: distKm, brg: capDeg }) : null;
    // visible d'ici si sa hauteur apparente dépasse ~0,12° (ou s'il est très célèbre : seuil abaissé, jamais supprimé)
    const angH = Math.atan((m.ht || 20) / Math.max(50, distKm * 1000)) / RAD;
    let far = angH < ((m.links || 0) >= MON_STAR_LINKS ? ANGLE_MIN_CELEBRE_DEG : ANGLE_MIN_DEG);
    if (!far && m.type === 'maison' && !m.prot && (m.links || 0) < 10) far = true; // maison / hôtel particulier peu connu et non protégé : en transparence
    // ville dense : plus bas que les toits et à plus de 400 m → on ne le voit pas d'ici (sauf très célèbre)
    const roof = !far && dense && distKm > TOITS_DISTANCE_KM && (m.ht || 20) < HAUTEUR_TOITS_M + 5 && (m.links || 0) < MON_STAR_LINKS;
    if (roof) far = true;
    cs.push({ ...m, dist: distKm, brg: capDeg, angH, far, roof, cap: false, near: false, occBy: null, photoHid: false, snapDB: 0, rang: null,
      hidden: v ? v.hidden : false, low: v ? v.low : false, aG: v ? v.aG : null, aP: v ? v.aP : null, mask: v ? v.mask : null });
  }
  cs.sort(comparateurAffichage(dense));
  plafondEtProches(cs);
  masquageEntreMonuments(cs, scene, avecRelief);
  const snapSuivant = reglePhoto(cs, scene, reglages, avecRelief);
  const classes = cs.map((el) => {
    const fantome = el.far || (avecRelief && el.hidden);
    const raison = !fantome ? null : avecRelief && el.hidden ? (el.low ? 'tour sous la crête' : 'caché par le relief') : el.occBy ? 'caché par un monument devant : ' + el.occBy : el.roof ? 'plus bas que les toits (ville dense)'
      : el.cap ? 'au-delà du plafond de noms nets' : el.photoHid ? 'caché sur la photo' : 'trop petit vu d’ici ou peu connu';
    return /** @type {MonumentClasse} */ ({ el, etat: !fantome ? 'net' : reglages.toutVoir ? 'transparent' : 'absent', raison });
  });
  return { classes, dense, snapSuivant };
}

/** Plafond de noms nets : les N plus proches (≤ 1,5 km) sont toujours nets et ne comptent pas ; les autres jusqu'à 40, par notoriété. @param {MonumentCalcule[]} cs */
function plafondEtProches(cs) {
  const proches = new Set(cs.filter((c) => !c.far && c.dist <= PROCHES_RAYON_KM).sort((a, b) => a.dist - b.dist).slice(0, PROCHES_TOUJOURS_NETS));
  let n = 0;
  for (const c of cs) {
    c.cap = false;
    c.near = proches.has(c);
    c.rang = c.far || c.near ? null : n + 1;
    if (c.near) continue;
    if (!c.far && ++n > NOMS_NETS_MAX) { c.far = true; c.cap = true; }
  }
}

/**
 * Masquage entre monuments : du plus proche au plus lointain, chaque monument net occupe une fenêtre (largeur selon son type, de sa base à son sommet vu d'ici) ;
 * un monument plus lointain dont le sommet tombe dans cette fenêtre est caché. @param {MonumentCalcule[]} cs @param {SceneMonuments} scene @param {boolean} avecRelief
 */
function masquageEntreMonuments(cs, scene, avecRelief) {
  const oeil = HAUTEUR_YEUX_M + (scene.correctionOeilM || 0), ang = (/** @type {number} */ hm, /** @type {number} */ d) => Math.atan2(hm, Math.max(30, d * 1000)) / RAD;
  const sommet = (/** @type {MonumentCalcule} */ c) => (c.aP !== null && avecRelief ? c.aP : ang((c.ht || 20) - oeil, c.dist));
  const base = (/** @type {MonumentCalcule} */ c) => (c.aG !== null && avecRelief ? c.aG : ang(-oeil, c.dist));
  /** @type {{name: string, dist: number, brg: number, top: number, bot: number, hw: number}[]} */
  const occ = [];
  for (const c of cs.slice().sort((a, b) => a.dist - b.dist)) {
    c.occBy = null;
    if (!c.far && !(avecRelief && c.hidden)) {
      const t = sommet(c), o = occ.find((x) => x.dist < c.dist * 0.85 && Math.abs(ecartAngle(c.brg - x.brg)) < x.hw + MASQUAGE_MARGE_DEG && t < x.top - 0.05);
      if (o) { c.far = true; c.near = false; c.occBy = o.name; continue; }
    }
    if (c.far || (avecRelief && c.hidden) || c.src === 'osms') continue; // une statue est trop fine pour cacher ce qui est derrière
    occ.push({ name: c.name, dist: c.dist, brg: c.brg, top: sommet(c), bot: base(c), hw: Math.atan2((LARGEUR_TYPE_M[c.type] || 20) / 2, Math.max(30, c.dist * 1000)) / RAD });
  }
}

/**
 * Règle de la photo : un monument vu sur la photo est affiché quoi qu'en disent les règles de toits ou de masquage ; sous une silhouette formée par un objet
 * PROCHE, il devient fantôme ; calage fin sur la pointe lue, lissé d'une image à l'autre (sans nouvelle lecture, le calage précédent est conservé).
 * @returns {Map<string, number>} calage lissé à réinjecter à l'image suivante
 * @param {MonumentCalcule[]} cs @param {SceneMonuments} scene @param {ReglagesMonuments} reglages @param {boolean} avecRelief
 */
function reglePhoto(cs, scene, reglages, avecRelief) {
  /** @type {Map<string, number>} */
  const suivant = new Map();
  const a = scene.analysePhoto;
  const fraiche = reglages.analyseActive && !!a && a.ok && scene.maintenantMs - a.t < ANALYSE_VALIDE_MS;
  if (!fraiche || !a) return suivant; // pas d'analyse récente : calage remis à zéro
  const oeil = HAUTEUR_YEUX_M + (scene.correctionOeilM || 0), pm = scene.terrain ? scene.terrain.pm : null;
  const angleRelief = avecRelief && pm ? (/** @type {number} */ brg) => angleSilhouette(pm, brg) : null;
  for (const c of cs) {
    c.snapDB = (scene.snapPrecedent && scene.snapPrecedent.get(cleMonument(c))) || 0;
    const aTop = c.aP !== null && avecRelief ? c.aP : Math.atan2((c.ht || 20) - oeil, Math.max(30, c.dist * 1000)) / RAD;
    const r = verifierSurPhoto(a.cols, c.brg, aTop, angleRelief);
    if (r) {
      if (r.state === 'vis') {
        if (!scene.analyseDejaAppliquee) c.snapDB = r.snap !== null ? c.snapDB * 0.6 + r.snap * 0.4 : c.snapDB * 0.6; // un pas de lissage par analyse, comme la v1
        if (c.far && (c.roof || c.occBy) && !c.cap) { c.far = false; c.roof = false; c.occBy = null; } // vu sur la photo : affiché, quoi qu'en disent les règles
      } else if (r.state === 'hid' && !c.far && !(avecRelief && c.hidden)) { c.far = true; c.near = false; c.photoHid = true; c.snapDB = 0; }
    }
    if (c.snapDB !== 0) suivant.set(cleMonument(c), c.snapDB);
  }
  return suivant;
}

// ---------- nom, géométrie et étiquettes ----------

/** Noms des établissements humains, normalisés (un monument « Cathédrale Saint-Pierre de Rennes » devient « Cathédrale Saint-Pierre »). @param {{name: string, kind: string}[]} cities */
export const nomsDeLieux = (cities) => new Set(cities.filter((c) => c.kind === 'city' || c.kind === 'town' || c.kind === 'village' || c.kind === 'hamlet' || c.kind === 'isolated_dwelling').map((c) => normaliser(c.name)));

/** Nom abrégé d'un monument : suffixe = commune connue retiré ; 28 caractères au plus (v1 : `monName`, hors équipements). @param {{name?: string}} c @param {Set<string>} lieux */
export function nomMonument(c, lieux) {
  let n = String(c.name || '');
  const m = /^(.*\S)\s+(?:de |d['’]|du |des |à )(.+)$/.exec(n);
  if (m && m[1].length >= 5 && lieux.has(normaliser(m[2]))) n = m[1];
  if (n.length <= 28) return n;
  const k = n.lastIndexOf(' ', 27);
  return n.slice(0, k > 12 ? k : 27) + '…';
}

/** Hauteur de l'icône (px) : plus loin = plus petit ; un monument très célèbre est plus grand (v1 : `monGH`, hors équipements). @param {{dist: number, links?: number}} c */
export function hauteurIcone(c) {
  const t = Math.max(0, Math.min(1, Math.log(Math.max(c.dist || 0.3, 0.05) / 0.3) / Math.log(15 / 0.3)));
  return Math.round(((c.links || 0) >= MON_STAR_LINKS ? 22 : 18) * (1 - 0.28 * t));
}

/**
 * Angles du sol et du sommet d'un monument. Un monument visible ne descend jamais sous la ligne de relief devant lui : base, sommet et icône sont remontés
 * du même écart ; on ne monte jusqu'à la silhouette finale que si elle est à moins de 0,5° au-dessus de ce relief. Les fantômes (cachés) ne bougent pas.
 * Le sommet est ramené vers le sol si la hauteur à l'écran dépasse 30 % de l'écran (240 px).
 * @param {MonumentCalcule} c @param {VueRendu} vue @param {{pm: import('../scene/masque.js').Masque} | null} terrain @param {boolean} avecRelief
 * @returns {{aGnd: number, aA: number}}
 */
export function anglesMonument(c, vue, terrain, avecRelief) {
  const hid = avecRelief && c.hidden;
  let lift = 0;
  if (avecRelief && !c.hidden && c.aG !== null && terrain) {
    const sky = angleSilhouette(terrain.pm, c.brg), front = c.mask !== null && c.mask > -89 ? Math.max(c.mask, c.aG) : c.aG;
    let tgt = front;
    if (!Number.isNaN(sky) && sky - front <= REMONTEE_CIEL_DEG) tgt = sky;
    lift = tgt > c.aG ? tgt - c.aG : 0;
  }
  const aGnd = (avecRelief && c.aG !== null ? c.aG : 0) + lift;
  let aA = (avecRelief && c.aP !== null ? (hid ? /** @type {number} */ (c.aG) : c.aP) : (avecRelief && c.aG !== null ? c.aG : 0) + (c.angH || 0)) + lift;
  const fh = focalePx(vue), H = vue.hauteurPx, yg = H / 2 + fh * Math.tan((vue.inclinaisonDeg - aGnd) * RAD), yt = H / 2 + fh * Math.tan((vue.inclinaisonDeg - aA) * RAD), mx = Math.min(TAILLE_MAX_PX, H * TAILLE_MAX_ECRAN);
  if (isFinite(yg) && isFinite(yt) && yg <= H * 1.15 && yg - yt > mx) aA = vue.inclinaisonDeg - Math.atan((yg - mx - H / 2) / fh) / RAD;
  return { aGnd, aA };
}

/** Silhouette à taille réelle si le monument est assez grand à l'écran (sol → sommet), sinon null (icône). @param {MonumentCalcule} c @param {number} x @param {number} yTop @param {number} aGnd @param {VueRendu} vue */
function boiteSilhouette(c, x, yTop, aGnd, vue) {
  const yBase = borner(yDepuisSite(vue, aGnd), -vue.hauteurPx, 2 * vue.hauteurPx), Hpx = yBase - yTop;
  if (!(Hpx >= SILHOUETTE_MIN_PX) || Hpx > 3 * vue.hauteurPx) return null;
  const cle = cleSilhouette(c);
  if (!SILHOUETTES_DISTINCTES.has(cle)) return null;
  const w = SILHOUETTES[cle].asp * Hpx;
  return { cle, x0: x - w / 2, x1: x + w / 2, yTop, yBase, w };
}

/**
 * Étiquettes de style « monument » : nets d'abord puis (Tout voir) les transparents. Un monument hors champ est ignoré.
 * @param {MonumentClasse[]} classes @param {VueRendu} vue @param {ReglagesMonuments & {distances: boolean, filtre?: string}} reglages
 * @param {{terrain: {pm: import('../scene/masque.js').Masque} | null, cities: {name: string, kind: string}[]}} contexte
 * @returns {{etiquettes: import('../rendu/etiquettes.js').EtiquetteMonument[], fantomesEnChamp: number}}
 */
export function preparerMonuments(classes, vue, reglages, { terrain, cities }) {
  /** @type {import('../rendu/etiquettes.js').EtiquetteMonument[]} */
  const etiquettes = [];
  let fantomesEnChamp = 0;
  if (!reglages.couche) return { etiquettes, fantomesEnChamp };
  const avecRelief = reglages.relief && !!terrain, lieux = nomsDeLieux(cities), fq = reglages.filtre ? normaliser(reglages.filtre) : '';
  const nets = classes.filter((c) => c.etat === 'net'), fantomes = classes.filter((c) => c.etat !== 'net');
  const enChamp = (/** @type {MonumentCalcule} */ c) => (!fq || normaliser(c.name).includes(fq)) ? abscisseSiVisible(vue, c.brg, c.snapDB) : null;
  if (!reglages.toutVoir) for (const { el } of fantomes) if (enChamp(el) !== null) fantomesEnChamp++;
  for (const { el: c, etat } of reglages.toutVoir ? nets.concat(fantomes) : nets) {
    const x = enChamp(c);
    if (x === null) continue;
    const fantome = etat !== 'net';
    if (fantome) fantomesEnChamp++;
    const { aGnd, aA } = anglesMonument(c, vue, terrain, avecRelief);
    const ay = borner(yDepuisSite(vue, aA), -vue.hauteurPx, 2 * vue.hauteurPx), gH = hauteurIcone(c), boite = boiteSilhouette(c, x, ay, aGnd, vue);
    const taille = (c.links || 0) >= MON_STAR_LINKS ? 17 : 15, htConnue = c.htWd || c.htOsm;
    const altitude = !(c.ht > 0) ? '' : htConnue ? `↑${Math.round(htConnue)} m` : `↑~${Math.round(c.ht)} m`;
    const distance = reglages.distances ? (c.dist < 10 ? c.dist.toFixed(1) : Math.round(c.dist)) + ' km' : '';
    etiquettes.push({ style: 'monument', cle: c.name + '|' + c.kind, proprietaire: c, texte: nomMonument(c, lieux), detail: [altitude, distance].filter(Boolean).join(' · '), taille,
      x, y: ay, opacite: 1 * (fantome ? 0.5 : 1), teinte: '242,193,78', fantome, decalage: gH / 2 + 4, elevation: gH * 0.5,
      icone: { type: c.type, gH, yTerre: borner(yDepuisSite(vue, aGnd), -vue.hauteurPx, 2 * vue.hauteurPx), boite } });
  }
  return { etiquettes, fantomesEnChamp };
}

/** Calque monuments (interface commune, REFONTE.md §7). */
export const calque = {
  id: 'monuments',
  libelle: 'Monuments',
  /** @param {unknown} _zone @param {{monuments: Monument[]}} donnees */
  async charger(_zone, donnees) { return donnees.monuments.filter((m) => m.cat !== 'equip'); },
  classer: classerMonuments,
  preparer: preparerMonuments,
};
