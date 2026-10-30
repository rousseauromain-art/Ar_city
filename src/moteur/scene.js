// @ts-check
/**
 * MOTEUR DE SCÈNE : un seul assemblage de tous les calques, commun aux deux modes (réalité augmentée en direct, photo rejouée). Mêmes données + même vue + mêmes réglages
 * → mêmes commandes de dessin. Pas de réseau, pas de DOM, pas d'horloge : tout est passé en paramètres. Reprend l'ORDRE de `draw()` de la v1 : horizon et réticule, croix de visée,
 * ligne de relief et crêtes, traits bleus de la photo, réservation des icônes (monuments, mobiles), bande des équipements au-dessus de l'horizon (si l'horizon est trop bas à l'écran),
 * lieux et monuments, bande sous l'horizon, pastilles des sites trouvés, icônes des mobiles, avions, bateaux ; puis, sans roulis, le ruban de cap et le message central.
 * Pas encore portés (étape 10) : symbole du soleil, silhouette lue sur la photo (le moteur sait la tracer si on lui en donne une), silhouette des bâtiments (BD TOPO).
 * Les mémoires (placement des noms, lignes de la bande, choix des bateaux, calage fin des monuments) sont passées par l'appelant et MISES À JOUR ici.
 */
import { commandesHorizon } from '../rendu/repere-horizon.js';
import { commandesCroix } from '../rendu/croix-visee.js';
import { commandesRuban } from '../rendu/ruban-cap.js';
import { ordonneeHorizon } from '../rendu/projection.js';
import { creerPlaceur } from '../rendu/placement.js';
import { composerEtiquettes } from '../rendu/etiquettes.js';
import { composerBande, pointeursHorsChamp } from '../rendu/bande.js';
import { grouperMobiles, reserverIcones, commandesIcones, composerAvions } from '../rendu/mobiles.js';
import { poserBateaux } from '../rendu/escalier.js';
import { texte } from '../rendu/commandes.js';
import { commandesSoleil } from '../rendu/soleil.js';
import { commandesLune } from '../rendu/lune.js';
import { positionSoleil, positionLune, phaseLune } from '../noyau/astro.js';
import { calque as calqueRelief, classerCretes, cretesDe } from '../calques/relief.js';
import { calque as calquePhoto } from '../calques/photo-silhouette.js';
import { classerMobiles } from '../calques/avions.js';
import { classerNavires } from '../calques/bateaux.js';
import { normaliser } from '../noyau/texte.js';
import { classerScene, couchesDeLaBande } from './classement.js';
import { messageCentral, texteStatut } from './statut.js';

/** @typedef {import('./reglages.js').Reglages} Reglages */
/** @typedef {import('./classement.js').DonneesScene} DonneesScene */
/** @typedef {import('../rendu/commandes.js').Commande} Commande */
/**
 * Mémoires entre deux images, MISES À JOUR par composerScene.
 * @typedef {object} MemoiresScene
 * @property {Map<string, {side: number, k: number}>} placement place de chaque nom à l'image précédente @property {Map<string, number>} lignes ligne de chaque nom de la bande
 * @property {import('../rendu/escalier.js').ChoixBateaux} choixBateaux bateaux nommés @property {Map<string, number>} calageMonuments calage fin des monuments sur la silhouette lue @property {number | null} [analyseT] instant de la dernière analyse dont le lissage a déjà avancé
 * @typedef {object} EcranScene
 * @property {import('../rendu/reservations.js').Reservation[]} reservations rectangles de l'interface qu'aucun nom ne doit recouvrir @property {number} safeT hauteur de la zone de sécurité (haut) @property {number} safeB marge basse (px)
 * @property {(police: string, texte: string) => number} mesurerTexte @property {{affichage: string, mono: string}} familles
 * @typedef {object} EtatScene
 * @property {boolean} photo mode photo rejouée @property {boolean} capteur boussole disponible @property {string} erreurCamera @property {number} precisionM précision du GPS @property {boolean} chargement lieux en chargement
 * @property {number | null} [utcMs] instant du soleil : heure de la prise de vue en photo, heure du téléphone en direct ; absent ou null : pas de symbole du soleil
 * @property {string} source source des lieux @property {string} etatRelief « calcul… », « indispo », … @property {string} messageAir @property {string} messageSea
 */

/**
 * @param {{vue: import('../rendu/projection.js').VueRendu, reglages: Reglages, donnees: DonneesScene | null, memoires: MemoiresScene, ecran: EcranScene, maintenantMs: number, etat: EtatScene}} e
 * @returns {{scene: Commande[], ecran: Commande[], bilan: {liste: any[], monuments: any[], affiches: number, badge: number, statut: string, message: string, etage: 'bas' | 'haut', comptes: import('../rendu/etiquettes.js').ComptesEtiquettes | null, zones: {bande: unknown[], avions: unknown[], bateaux: unknown[]}}}}
 */
export function composerScene({ vue, reglages: S, donnees: D, memoires: M, ecran: E, maintenantMs, etat }) {
  const { mesurerTexte, familles } = E, W = vue.largeurPx, H = vue.hauteurPx;
  const hy = ordonneeHorizon(vue), lowTop = hy + 30, lowBot = H - Math.max(8, E.safeB) - 6, basse = lowBot - lowTop >= 46, hautLimite = E.safeT + 24 + 14;
  const habille = (/** @type {number} */ affiches, /** @type {number} */ nbLieux, /** @type {number} */ nbListe) => ({
    message: messageCentral({ erreurCamera: etat.erreurCamera, photo: etat.photo, pos: D && D.pos, nbLieux, nbListe, rayonKm: S.radius, capteur: etat.capteur }),
    statut: texteStatut({ affiches, pos: D && D.pos, precisionM: etat.precisionM, chargement: etat.chargement, source: etat.source, relief: S.calculRelief !== false, etatRelief: etat.etatRelief, capteur: etat.capteur, photo: etat.photo,
      air: S.air, sea: S.sea, messageAir: etat.messageAir, messageSea: etat.messageSea }) });
  /** @param {string} message @returns {Commande[]} */
  const surimpression = (message) => [...commandesRuban(vue, { safeT: E.safeT, familles }),
    ...(message ? [texte(message, W / 2, H * 0.62, `500 15px ${familles.mono}`, '#F3E9D2', { alignement: 'center', contour: { couleur: 'rgba(14,26,43,.9)', largeur: 4 } })] : [])];
  const base = [...commandesHorizon(vue), ...(S.cross ? commandesCroix(vue, { mesurerTexte, familles }) : [])];
  if (!D || !D.pos) {
    const h = habille(0, 0, 0);
    return { scene: base, ecran: surimpression(h.message), bilan: { liste: [], monuments: [], affiches: 0, badge: 0, statut: h.statut, message: h.message, etage: basse ? 'bas' : 'haut', comptes: null, zones: { bande: [], avions: [], bateaux: [] } } };
  }
  const terrain = D.terrain, ligneRelief = S.skyline && !!terrain, jointureHeritee = ligneRelief ? 'round' : 'miter';
  // 1. relief et traits bleus de la photo
  if (terrain) base.push(...calqueRelief.preparer(S.skyline ? classerCretes(cretesDe(terrain.pm), { toutVoir: S.beyond }) : [], vue, { terrain, reglages: { silhouette: S.skyline, cretes: S.ridges !== false, distances: S.showDist, toutVoir: S.beyond }, mesurerTexte }));
  base.push(...calquePhoto.preparer(D.analysePhoto, vue, { reglages: { toutVoir: S.beyond, analyseActive: S.photoVis === true }, maintenantMs, jointure: jointureHeritee }));
  // 2. classements, étiquettes, bande, mobiles
  const c = classerScene({ S, D, vue, maintenantMs, snapPrecedent: M.calageMonuments, analyseAppliqueeT: M.analyseT }), { couches, trouves } = couchesDeLaBande({ S, D, classesEquipements: c.classesEquipements });
  const oeilM = terrain ? terrain.h0 : 1.6, fq = S.filter ? normaliser(S.filter) : '', scM = { oeilM };
  const mobiles = [...classerMobiles(D.mobiles, vue, scM, { couche: S.air, filtre: fq }, 'plane'), ...classerNavires(D.mobiles, vue, scM, { couche: S.sea, filtre: fq })]
    .filter((x) => x.etat === 'net').sort((a, b) => a.el.ordre - b.el.ordre).map((x) => x.el);
  const groupes = grouperMobiles(mobiles);
  const placeur = creerPlaceur({ largeurPx: W, hauteurPx: H, limiteHautePx: hautLimite, reservations: E.reservations.map((r) => /** @type {typeof r} */ (r.slice())), memoire: M.placement });
  const optBande = (/** @type {'bas'|'haut'} */ etage, /** @type {'miter'|'round'} */ jointure) => ({ etage, hy, basTexteLimite: lowBot, hautLimite, debutBas: lowTop, calquesHautActifs: S.layers.places || S.layers.monuments, lignesMax: 60,
    memoireLignes: M.lignes, mesurerTexte, familles, jointure });
  /** @type {{haut: ReturnType<typeof composerBande> | null}} */
  const etageHaut = { haut: null };
  const noms = composerEtiquettes(c.etiquettes, placeur, { mesurerTexte, familles, avantNoms: () => {
    reserverIcones(groupes, placeur.reservations); // icônes des mobiles : réservées avant tout nom
    if (!basse) etageHaut.haut = composerBande(couches, vue, placeur, optBande('haut', jointureHeritee)); // horizon trop bas à l'écran : la bande passe au-dessus, avant les lieux
  } });
  const bandeHaut = etageHaut.haut, bandeBas = basse ? composerBande(couches, vue, placeur, optBande('bas', 'round')) : null, bande = /** @type {ReturnType<typeof composerBande>} */ (bandeHaut || bandeBas);
  const pointeurs = pointeursHorsChamp(trouves, vue, placeur, { hy, mesurerTexte, familles });
  const optM = { mesurerTexte, familles, distances: S.showDist }, avions = composerAvions(groupes, placeur, optM);
  const bateaux = poserBateaux({ bateaux: groupes.filter((g) => g.kind === 'ship').flatMap((g) => g.items.map((it) => ({ ...it, g }))), vue, reservations: placeur.reservations, estIcone: (r) => groupes.includes(/** @type {any} */ (r[5])),
    mesurerTexte, familles, maintenantMs, choix: M.choixBateaux, distances: S.showDist });
  M.choixBateaux = bateaux.choix; M.calageMonuments = c.snapSuivant; M.analyseT = D.analysePhoto ? D.analysePhoto.t : null;
  const h = habille(c.affiches, D.lieux.filter((l) => !l.farPeak).length, c.liste.length);
  return { scene: [...base, ...(bandeHaut ? bandeHaut.commandes : []), ...noms.commandes, ...(bandeBas ? bandeBas.commandes : []), ...pointeurs, ...commandesIcones(groupes, vue), ...avions.commandes, ...bateaux.commandes,
      ...commandesSoleil(vue, etat.utcMs ? positionSoleil(etat.utcMs, D.pos.lat, D.pos.lon) : null, { familles, jointure: 'round', extremite: 'butt' }),
      ...(S.lune !== false && etat.utcMs ? commandesLune(vue, positionLune(etat.utcMs, D.pos.lat, D.pos.lon), phaseLune(etat.utcMs), { familles, jointure: 'round', extremite: 'butt' }) : [])],
    ecran: surimpression(h.message),
    bilan: { liste: c.liste, monuments: c.monumentsTous, affiches: c.affiches, badge: S.beyond ? 0 : c.fantomesEnChamp, statut: h.statut, message: h.message, etage: basse ? 'bas' : 'haut', comptes: noms.comptes, zones: { bande: bande.zones, avions: avions.zones, bateaux: bateaux.zones } } };
}
