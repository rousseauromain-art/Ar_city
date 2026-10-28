// @ts-check
/**
 * Calque « lieux » : villes, bourgs, villages, hameaux. Classement (Essentiel / Tout voir, avec la raison de chaque absence) puis étiquettes à poser.
 * Le placement et le dessin des noms sont faits par rendu/ pour TOUS les calques : ce calque ne place rien lui-même.
 * Essentiel : seulement les lieux visibles d'ici (ni cachés par le relief, ni au-delà de la portée de leur catégorie, ni cachés sur la photo).
 * Tout voir : en plus, en transparence, les autres — posés APRÈS les visibles, donc passer en Tout voir ne fait jamais disparaître un nom net.
 * Entrées : lieux (donnees/lieux.js), position, relief, analyse de la photo, vue. Sorties : éléments classés, étiquettes. Fonctions pures.
 * Reprend `visibleCities` (partie lieux) et la boucle des lieux de `draw()` de la v1. Dépend de : noyau, scene, rendu/projection.js.
 */
import { distanceEtCap } from '../noyau/geo.js';
import { normaliser } from '../noyau/texte.js';
import { HAUTEUR_TYPE_M, HAUTEUR_DEFAUT_M, verdictRelief } from '../scene/visibilite.js';
import { angleSilhouette } from '../scene/cretes.js';
import { verifierSurPhoto } from '../scene/regle-photo.js';
import { ANALYSE_VALIDE_MS } from './photo-silhouette.js';
import { TYPES_LIEUX } from '../donnees/categories-reperes.js';
import { abscisseSiVisible, yDepuisSite } from '../rendu/projection.js';
import { borner } from '../noyau/maths.js';
import { RAD, HAUTEUR_YEUX_M } from '../noyau/constantes.js';

/** @typedef {import('../donnees/overpass.js').Lieu} Lieu */
/** @typedef {import('../rendu/projection.js').VueRendu} VueRendu */
/** @typedef {import('./photo-silhouette.js').AnalysePhoto} AnalysePhoto */
/** @typedef {Lieu & {dist: number, brg: number, far: boolean, hidden: boolean, photoHid: boolean, aG: number | null, aP: number | null, mask: number | null}} LieuCalcule */
/** @typedef {{el: LieuCalcule, etat: 'net' | 'transparent' | 'absent', raison: string | null}} LieuClasse */

/** Priorité d'affichage par type : plus petit = posé d'abord (v1 : `RANK`). */
export const PRIORITE = Object.freeze(/** @type {Record<string, number>} */ ({ monument: -1, city: 0, town: 1, lighthouse: 1, island: 1, cape: 2, peak: 2, village: 2, view: 3, rock: 3, heritage: 3, beach: 4, hamlet: 4, isolated_dwelling: 4, poi: 3 }));
/** Portée d'affichage par type, en km (v1 : `MAXD`) ; villes et bourgs : aucune limite. */
export const PORTEE_KM = Object.freeze(/** @type {Record<string, number>} */ ({ village: 30, hamlet: 12, isolated_dwelling: 12, lighthouse: 40, cape: 30, peak: 45, island: 60, rock: 20, view: 20, heritage: 15, beach: 12, poi: 15 }));
/** Homonymes à moins de cette distance (km) : un seul est gardé (OSM décrit parfois un même lieu par plusieurs objets). */
export const DOUBLON_KM = 2;

/**
 * @typedef {object} SceneLieux
 * @property {{lat: number, lon: number}} pos @property {{h0: number, pm: import('../scene/masque.js').Masque, bands: import('../scene/relief.js').Bande[]} | null} terrain
 * @property {AnalysePhoto | null} analysePhoto @property {number} maintenantMs @property {number} [correctionOeilM] correction manuelle de la hauteur d'œil
 * @typedef {object} ReglagesLieux
 * @property {number} rayonKm @property {boolean} relief @property {boolean} toutVoir @property {boolean} analyseActive analyse de la photo activée
 * @property {boolean} couche calque « lieux » activé @property {string} [filtre] recherche par nom
 */

/**
 * Classe les lieux. Le résultat suit l'ordre d'affichage (priorité, puis distance) ; `etat` et `raison` suivent le contrat de REFONTE.md §4.
 * @param {Lieu[]} lieux @param {SceneLieux} scene @param {ReglagesLieux} reglages
 * @returns {LieuClasse[]}
 */
export function classerLieux(lieux, scene, reglages) {
  const { pos, terrain } = scene, avecRelief = reglages.relief && !!terrain;
  const masque = terrain ? { oeilM: terrain.h0, pm: terrain.pm } : null;
  /** @type {LieuCalcule[]} */
  const calcules = [];
  for (const l of lieux) {
    if (!TYPES_LIEUX.has(l.kind)) continue;
    const { distKm, capDeg } = distanceEtCap(pos, l);
    if (distKm > reglages.rayonKm) continue;
    const portee = PORTEE_KM[l.kind];
    const v = masque && terrain ? verdictRelief(masque, terrain.bands, { ...l, dist: distKm, brg: capDeg }) : null;
    calcules.push({ ...l, dist: distKm, brg: capDeg, far: portee !== undefined && distKm > portee, hidden: v ? v.hidden : false, photoHid: false, aG: v ? v.aG : null, aP: v ? v.aP : null, mask: v ? v.mask : null });
  }
  calcules.sort((a, b) => (PRIORITE[a.kind] ?? 3) - (PRIORITE[b.kind] ?? 3) || a.dist - b.dist);
  appliquerRegleDePhoto(calcules, scene, reglages, avecRelief);
  // doublons : on garde le plus significatif (déjà trié en tête) et on écarte les homonymes à moins de 2 km
  /** @type {Map<string, LieuCalcule[]>} */
  const vus = new Map();
  /** @type {LieuCalcule[]} */
  const gardes = [];
  for (const c of calcules) {
    const k = normaliser(c.name), g = vus.get(k);
    if (g && g.some((o) => distanceEtCap(o, c).distKm < DOUBLON_KM)) continue;
    if (g) g.push(c); else vus.set(k, [c]);
    gardes.push(c);
  }
  return gardes.map((el) => {
    const fantome = el.far || (avecRelief && el.hidden);
    const raison = !fantome ? null : avecRelief && el.hidden ? 'caché par le relief' : el.photoHid ? 'caché sur la photo' : 'trop loin pour sa catégorie';
    return { el, etat: !fantome ? 'net' : reglages.toutVoir ? 'transparent' : 'absent', raison };
  });
}

/** Règle de la photo : un lieu dont le sommet passe sous une silhouette formée par un objet PROCHE devient un fantôme. @param {LieuCalcule[]} cs @param {SceneLieux} scene @param {ReglagesLieux} reglages @param {boolean} avecRelief */
function appliquerRegleDePhoto(cs, scene, reglages, avecRelief) {
  const a = scene.analysePhoto;
  if (!(reglages.analyseActive && a && a.ok && scene.maintenantMs - a.t < ANALYSE_VALIDE_MS)) return;
  const oeil = HAUTEUR_YEUX_M + (scene.correctionOeilM || 0), pm = scene.terrain ? scene.terrain.pm : null;
  const angleRelief = avecRelief && pm ? (/** @type {number} */ brg) => angleSilhouette(pm, brg) : null;
  for (const c of cs) {
    const aTop = c.aP !== null && avecRelief ? c.aP : Math.atan2((HAUTEUR_TYPE_M[c.kind] ?? HAUTEUR_DEFAUT_M) - oeil, Math.max(30, c.dist * 1000)) / RAD;
    const r = verifierSurPhoto(a.cols, c.brg, aTop, angleRelief);
    if (r && r.state === 'hid' && !c.far && !(avecRelief && c.hidden)) { c.far = true; c.photoHid = true; }
  }
}

/** Corps du nom selon le type (v1). @param {string} kind */
const tailleDuNom = (kind) => (kind === 'city' ? 18 : kind === 'town' ? 16 : kind === 'village' ? 14 : 12);

/**
 * Étiquettes à poser, dans l'ordre : nets d'abord, puis (Tout voir) les transparents. Un lieu hors champ est ignoré.
 * @param {LieuClasse[]} classes @param {VueRendu} vue @param {ReglagesLieux & {distances: boolean}} reglages
 * @returns {{etiquettes: import('../rendu/etiquettes.js').Etiquette[], fantomesEnChamp: number}}
 */
export function preparerLieux(classes, vue, reglages) {
  const avecRelief = reglages.relief;
  const visibles = classes.filter((c) => c.etat === 'net'), fantomes = classes.filter((c) => c.etat !== 'net');
  const fq = reglages.filtre ? normaliser(reglages.filtre) : '';
  /** @type {import('../rendu/etiquettes.js').Etiquette[]} */
  const etiquettes = [];
  let fantomesEnChamp = 0;
  if (!reglages.couche) return { etiquettes, fantomesEnChamp };
  const ordre = reglages.toutVoir ? visibles.concat(fantomes) : visibles;
  for (const { el: c, etat } of ordre) {
    if (fq && !normaliser(c.name).includes(fq)) continue;
    const x = abscisseSiVisible(vue, c.brg);
    if (x === null) continue;
    const fantome = etat !== 'net';
    if (fantome) fantomesEnChamp++;
    let aA = 0;
    if (avecRelief && c.aG !== null) aA = c.hidden ? c.aG : Math.max(c.aG, Math.min(/** @type {number} */ (c.mask), /** @type {number} */ (c.aP)));
    const taille = tailleDuNom(c.kind), opacite = (c.kind === 'city' || c.kind === 'town' ? 1 : 0.8) * (fantome ? 0.5 : 1);
    const altitude = c.ele !== null && c.ele !== undefined ? Math.round(c.ele) + ' m' : '';
    const distance = reglages.distances ? (c.dist < 10 ? c.dist.toFixed(1) : Math.round(c.dist)) + ' km' : '';
    etiquettes.push({ cle: c.name + '|' + c.kind, proprietaire: c, texte: c.name, detail: [altitude, distance].filter(Boolean).join(' · '), taille,
      x, y: borner(yDepuisSite(vue, aA), -vue.hauteurPx, 2 * vue.hauteurPx), opacite, teinte: '243,233,210', fantome, decalage: 10, elevation: 18 });
  }
  if (!reglages.toutVoir) fantomesEnChamp = fantomesAffichables(fantomes, vue, fq);
  return { etiquettes, fantomesEnChamp };
}

/** Nombre de fantômes dans le champ, compté aussi en Essentiel : c'est le badge « +N » du bouton œil. @param {LieuClasse[]} fantomes @param {VueRendu} vue @param {string} fq */
function fantomesAffichables(fantomes, vue, fq) {
  let n = 0;
  for (const { el: c } of fantomes) if ((!fq || normaliser(c.name).includes(fq)) && abscisseSiVisible(vue, c.brg) !== null) n++;
  return n;
}

/**
 * Calque lieux (interface commune, REFONTE.md §7).
 */
export const calque = {
  id: 'lieux',
  libelle: 'Lieux',
  /** @param {unknown} _zone @param {{lieux: Lieu[]}} donnees */
  async charger(_zone, donnees) { return donnees.lieux.filter((l) => TYPES_LIEUX.has(l.kind)); },
  /** @param {Lieu[]} lieux @param {SceneLieux} scene @param {ReglagesLieux} reglages */
  classer(lieux, scene, reglages) { return classerLieux(lieux, scene, reglages); },
  preparer: preparerLieux,
};
