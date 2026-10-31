// @ts-check
/**
 * Classement de tout ce qui se pose à l'écran avant le placement : lieux (habités, remarquables, sommets lointains), monuments, équipements urbains, puis la liste COMMUNE
 * (tri, dédoublonnage, nets avant fantômes), les étiquettes à poser, et les couches de la bande (équipements, pylônes, repères hauts, couches personnelles). Fonction pure.
 * Reprend `visibleCities` et la préparation de `draw()` de la v1. Entrées : réglages, données chargées, vue. Sorties : classes, étiquettes, couches.
 * Dépend de : calques/*, scene/liste-affichage.js.
 */
import { classerLieux, preparerLieux } from '../calques/lieux.js';
import { classerMonuments, preparerMonuments } from '../calques/monuments.js';
import { classerEquipements, preparerEquipements, classerPylones, preparerPylones } from '../calques/equipements.js';
import { classerReperes, preparerReperes } from '../calques/reperes.js';
import { preparerCouche, sitesTrouves } from '../calques/kml.js';
import { assemblerListe, dedoublonner, ordonnerEtiquettes } from '../scene/liste-affichage.js';
import { normaliser } from '../noyau/texte.js';

/** @typedef {import('./reglages.js').Reglages} Reglages */
/** @typedef {import('../calques/monuments.js').MonumentClasse} MonumentClasse */
/**
 * Données chargées (le moteur ne charge rien lui-même).
 * @typedef {object} DonneesScene
 * @property {{lat: number, lon: number}} pos @property {{h0: number, pm: import('../scene/masque.js').Masque, bands: import('../scene/relief.js').Bande[], solM?: number, origine?: string} | null} terrain
 * @property {import('../donnees/overpass.js').Lieu[]} lieux établissements, lieux remarquables ET sommets lointains (`farPeak`)
 * @property {import('../donnees/monuments-wikidata.js').Monument[]} monuments monuments et équipements urbains @property {import('../donnees/telecom.js').SiteTelecom[]} pylones
 * @property {import('../donnees/reperes-hauts.js').Repere[]} reperes @property {boolean[]} doublonsReperes `doublonsReperes[i]` : le repère `i` est déjà dessiné comme monument
 * @property {import('../donnees/kml.js').CouchePerso[]} couchesPerso @property {import('../donnees/trafic.js').Mobile[]} mobiles mobiles proches (donnees/trafic.js)
 * @property {import('../calques/photo-silhouette.js').AnalysePhoto | null} analysePhoto
 */

/**
 * @param {{S: Reglages, D: DonneesScene, vue: import('../noyau/projection.js').VueRendu, maintenantMs: number, snapPrecedent?: Map<string, number>, analyseAppliqueeT?: number | null}} e `analyseAppliqueeT` : instant de l'analyse dont le lissage du calage fin a déjà avancé
 */
export function classerScene({ S, D, vue, maintenantMs, snapPrecedent, analyseAppliqueeT = null }) {
  const { pos, terrain } = D, avecRelief = S.relief && !!terrain, analyseActive = S.photoVis === true;
  const monuments = S.layers.monuments, equip = monuments && S.layers.equip !== false;
  const rg = { rayonKm: S.radius, relief: S.relief, toutVoir: S.beyond, analyseActive, couche: monuments, distances: S.showDist, filtre: S.filter };
  const scene = { pos, terrain, analysePhoto: D.analysePhoto, maintenantMs, cities: D.lieux, batiments: D.reperes, monuments: D.monuments, snapPrecedent, analyseDejaAppliquee: !!D.analysePhoto && analyseAppliqueeT === D.analysePhoto.t };
  const M = classerMonuments(D.monuments, scene, rg), classesM = monuments ? M.classes : [];
  const classesL = classerLieux(D.lieux, scene, { ...rg, couche: S.layers.places });
  const E = classerEquipements(D.monuments, scene, { rayonKm: S.radius, relief: S.relief, couche: equip });
  const assemblee = assemblerListe(/** @type {any[][]} */ ([classesM.map((c) => c.el), classesL.map((c) => c.el), E.classes.map((c) => c.el)]), M.dense), gardes = new Set(dedoublonner(assemblee));
  const liste = assemblee.filter((e) => gardes.has(e));
  /** @template {{el: object}} T @param {T[]} cs @returns {T[]} */
  const garder = (cs) => cs.filter((c) => gardes.has(c.el));
  const cm = garder(classesM), cl = garder(classesL), ce = garder(E.classes);
  const pm = preparerMonuments(cm, vue, rg, { terrain, cities: D.lieux }), pL = preparerLieux(cl, vue, { ...rg, couche: S.layers.places });
  const etiquettes = ordonnerEtiquettes(liste, [...pm.etiquettes, ...pL.etiquettes]);
  // nombre de noms nets (bandeau d'état) : sans fantôme, filtre appliqué, lieux seulement si leur calque est allumé
  const fq = S.filter ? normaliser(S.filter) : '';
  const affiches = /** @type {{etat: string, el: {name: string, kind: string}}[]} */ ([...cm, ...cl, ...ce]).filter((c) => c.etat === 'net' && (!fq || normaliser(c.el.name).includes(fq)) && (S.layers.places || c.el.kind === 'monument')).length;
  return { avecRelief, rg, monumentsTous: classesM.map((c) => c.el), dense: M.dense, snapSuivant: M.snapSuivant, liste, etiquettes, fantomesEnChamp: pm.fantomesEnChamp + pL.fantomesEnChamp, affiches, classesEquipements: ce };
}

/**
 * Couches de la bande des équipements, dans l'ordre de la v1 : équipements urbains, pylônes, repères hauts, couches personnelles.
 * @param {{S: Reglages, D: DonneesScene, classesEquipements: import('../calques/equipements.js').EquipementClasse[]}} e
 * @returns {{couches: import('../rendu/bande.js').CoucheBande[], trouves: import('../rendu/bande.js').ElementBande[]}}
 */
export function couchesDeLaBande({ S, D, classesEquipements }) {
  const { pos, terrain } = D;
  const couches = [preparerEquipements(classesEquipements, { filtre: S.filter }),
    S.telecom && D.pylones.length ? preparerPylones(classerPylones(D.pylones, { pos }, { telecom: true, portee: S.telecomMax })) : null,
    S.buildings && D.reperes.length ? preparerReperes(classerReperes(D.reperes, { pos }, { reperes: true, portee: S.buildingsMax, toutVoir: S.beyond, doublons: D.doublonsReperes }), S.relief && terrain ? terrain : null) : null,
    ...D.couchesPerso.map((L) => preparerCouche(L))].filter((c) => !!c);
  return { couches: /** @type {import('../rendu/bande.js').CoucheBande[]} */ (couches), trouves: sitesTrouves(D.couchesPerso) };
}
