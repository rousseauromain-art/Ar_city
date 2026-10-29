// @ts-check
/**
 * RACINE DE COMPOSITION de la v2 : le seul endroit qui assemble réseau, caches, sources de données, relief et moteur de scène. Les modules de `donnees/` ne se connaissent pas entre eux,
 * le moteur ne charge rien : ici, on décide QUAND charger (mêmes seuils de déplacement que la v1), on garde ce qui est chargé et on prévient l'affichage quand quelque chose change.
 * Entrées : réglages (lus à chaque décision), position, journal, stockage, adresse du relais, adresse du Worker du masque. Sortie : `donnees()` (pour `composerScene`) + `etat()` (diagnostic).
 * Les chargements ne bloquent jamais l'affichage : une erreur est journalisée, l'étape suivante continue, un recul progressif évite de harceler un service en panne.
 * Dépend de : donnees/*, scene/terrain.js, scene/masque-worker.js, noyau/geo.js.
 */
import { creerReseau } from '../donnees/reseau.js';
import { creerCacheDonnees } from '../donnees/cache-donnees.js';
import { creerCacheOctets } from '../donnees/cache-api.js';
import { creerOverpass, MIROIRS_OVERPASS } from '../donnees/overpass.js';
import { creerOpenFreeMap } from '../donnees/openfreemap.js';
import { creerSourcesRelais } from '../donnees/relais-lieux.js';
import { creerAtlas } from '../donnees/atlas.js';
import { creerSourceLieux } from '../donnees/lieux.js';
import { listeIntegree } from '../donnees/lieux-integres.js';
import { creerSourceSommets } from '../donnees/sommets-lointains.js';
import { creerSourceMonuments, rayonMonuments } from '../donnees/monuments.js';
import { creerSourceOsm } from '../donnees/osm-tuiles.js';
import { combinerMonuments, doublonsBatiments, separerTuilesOsm } from '../donnees/monuments-osm.js';
import { creerSourceTelecom, doitChargerTelecom, reculSuivant, rayonTelecom, telecomVoulu, RECUL_INITIAL_MS } from '../donnees/telecom.js';
import { creerSourceReperes } from '../donnees/reperes-hauts.js';
import { creerChargeurTuiles } from '../donnees/tuiles-relief.js';
import { decoderTuile } from '../donnees/decodage-navigateur.js';
import { calculerTerrainAvecRepli } from '../scene/terrain.js';
import { calculerMasque } from '../scene/masque.js';
import { creerMasqueWorker } from '../scene/masque-worker.js';
import { creerSourceAvions } from '../donnees/avions.js';
import { creerSourceNavires } from '../donnees/navires.js';
import { creerMemoireDirect } from '../donnees/memoire-direct.js';
import { listerMobiles } from '../donnees/trafic.js';
import { distanceEtCap } from '../noyau/geo.js';
import { PROCHE_KM } from '../scene/relief.js';

/** @typedef {import('../moteur/classement.js').DonneesScene} DonneesScene */
/** @typedef {import('../moteur/reglages.js').Reglages} Reglages */
/** @typedef {{lat: number, lon: number}} Point */

/** Caches de la v1 (même origine, mêmes clés), lus en dernier recours et jamais écrits : au premier lancement la v2 retrouve ce que la v1 avait mémorisé. */
const CACHE_DONNEES_V1 = 'vh-data-v1', CACHE_TERRAIN_V1 = 'vh-terrain-v1';
/** Mémoires de la v1 gardées dans le stockage local (atlas des lieux, monuments) : copiées une fois si la v2 n'a encore rien. [nom v2, clé v1] */
const STOCKAGE_V1 = /** @type {[string, string][]} */ ([['atlas', 'vh_atlas_v1'], ['monuments', 'vh_mon_v2'], ['tuilesAnciennes', 'vh_montile_v2']]);

/** Stockage de la v2 vu par les sources de données : `lire(nom, valeurParDefaut)`. @param {ReturnType<typeof import('../outils/stockage.js').creerStockage>} s */
const stockageSimple = (s) => ({ lire: (/** @type {string} */ nom, /** @type {any} */ defaut) => s.lire(nom, { parDefaut: defaut === undefined ? null : defaut }), ecrire: (/** @type {string} */ nom, /** @type {unknown} */ v) => s.ecrire(nom, v) });

/**
 * @param {{
 *   reglages: () => Reglages,
 *   journal: ReturnType<typeof import('../outils/journal.js').creerJournal>,
 *   stockage: ReturnType<typeof import('../outils/stockage.js').creerStockage>,
 *   relais?: string,
 *   urlWorkerMasque?: string | URL,
 *   fetchImpl?: (url: string, init: any) => Promise<Response>,
 *   caches?: CacheStorage,
 *   maintenant?: () => number,
 *   quandChange?: (quoi: string) => void,
 *   visible?: () => boolean,
 * }} p
 */
export function creerApplication({ reglages, journal, stockage, relais, urlWorkerMasque, fetchImpl, caches = globalThis.caches, maintenant = Date.now, quandChange = () => {}, visible = () => !globalThis.document || !globalThis.document.hidden }) {
  const st = stockageSimple(stockage);
  for (const [nomV2, cleV1] of STOCKAGE_V1) { // reprise unique : la v1 n'est ni modifiée ni effacée
    try {
      if (st.lire(nomV2, null) !== null) continue;
      const brut = globalThis.localStorage ? globalThis.localStorage.getItem(cleV1) : null;
      if (brut) { st.ecrire(nomV2, JSON.parse(brut)); journal.info('app', `mémoire de la v1 reprise : ${nomV2}`); }
    } catch (e) { journal.avert('app', `mémoire de la v1 illisible : ${cleV1}`, e); }
  }
  const reseau = creerReseau({ journal, fetchImpl, maintenant, cache: null });
  const cacheDonnees = creerCacheDonnees('vh2-donnees', { caches, maintenant, journal, secours: [CACHE_DONNEES_V1] });
  const reseauTuiles = creerReseau({ journal, fetchImpl, maintenant, cache: creerCacheOctets('vh2-terrain', { caches, maintenant, journal, secours: [CACHE_TERRAIN_V1] }) });
  const overpass = creerOverpass({ reseau: /** @type {any} */ (reseau), miroirs: MIROIRS_OVERPASS, journal });
  const openfreemap = creerOpenFreeMap({ reseau: /** @type {any} */ (reseau), journal });
  const atlas = creerAtlas(st);
  const sourceLieux = creerSourceLieux({ cache: cacheDonnees, overpass, openfreemap, relais: creerSourcesRelais({ reseau: /** @type {any} */ (reseau), relais }), atlas, journal });
  const sourceSommets = creerSourceSommets({ reseau: /** @type {any} */ (reseau), cache: cacheDonnees, openfreemap });
  const sourceMonuments = creerSourceMonuments({ reseau: /** @type {any} */ (reseau), cache: cacheDonnees, stockage: st, relais, maintenant, journal });
  const osm = creerSourceOsm({ cache: cacheDonnees, overpass });
  const sourceTelecom = creerSourceTelecom({ reseau: /** @type {any} */ (reseau), cache: cacheDonnees, relais, maintenant });
  const sourceReperes = creerSourceReperes({ osm, overpass, cache: cacheDonnees, journal });
  const memoireDirect = creerMemoireDirect(cacheDonnees);
  const sourceAvions = creerSourceAvions({ reseau: /** @type {any} */ (reseau), memoire: memoireDirect, relais, maintenant });
  const sourceNavires = creerSourceNavires({ reseau: /** @type {any} */ (reseau), memoire: memoireDirect, relais, maintenant });
  const chargeurTuiles = creerChargeurTuiles({ reseau: /** @type {any} */ (reseauTuiles), decoder: decoderTuile });
  /** @type {import('../scene/masque.js').CalculMasque} */
  let masque = (b, c, o) => calculerMasque(b, c, o);
  if (urlWorkerMasque && typeof Worker !== 'undefined') { try { masque = creerMasqueWorker(urlWorkerMasque); } catch (e) { journal.avert('app', 'Worker du masque indisponible : calcul sur le fil principal', e); } }

  /** Ce qui est chargé, et d'où. */
  const D = /** @type {DonneesScene & {mobiles: any[]}} */ ({ pos: /** @type {any} */ (null), terrain: null, lieux: [], monuments: [], pylones: [], reperes: [], doublonsReperes: [], couchesPerso: [], mobiles: [], analysePhoto: null });
  const E = { terrainCentre: /** @type {Point | null} */ (null), source: '', debutLieux: 0, sourcesLieux: /** @type {import('../donnees/lieux.js').DetailSource[]} */ ([]), chargementLieux: false, etatRelief: '', msgMonuments: '', msgTelecom: '', msgReperes: '', rayonCharge: 0, dernierLieux: /** @type {Point | null} */ (null) };
  /** @type {{lieux: Point | null, sommets: Point | null, terrain: Point | null, monuments: Point | null, telecom: Point | null, reperes: Point | null}} */
  const couvert = { lieux: null, sommets: null, terrain: null, monuments: null, telecom: null, reperes: null };
  const occupe = { lieux: false, sommets: false, terrain: false, monuments: false, telecom: false, reperes: false };
  const recul = { telecom: { t: /** @type {number | null} */ (null), ms: RECUL_INITIAL_MS }, monuments: { t: /** @type {number | null} */ (null), ms: 30000 }, reperes: { t: /** @type {number | null} */ (null), ms: 30000 } };
  let lieuxBase = /** @type {import('../donnees/overpass.js').Lieu[]} */ ([]), sommets = /** @type {import('../donnees/overpass.js').Lieu[]} */ ([]), baseWikidata = /** @type {any[]} */ ([]), tuilesOsm = /** @type {any[]} */ ([]), batiments = /** @type {any[]} */ ([]);
  /** Trafic en direct : avions, navires, pause de quota, messages. Jamais chargé en photo rejouée. */
  const trafic = { mode: /** @type {'direct' | 'photo'} */ ('photo'), avions: /** @type {import('../donnees/trafic.js').Avion[]} */ ([]), navires: /** @type {Map<string, import('../donnees/trafic.js').Navire>} */ (new Map()), pauseAir: 0,
    msgAir: '', msgSea: '', minuteurAir: /** @type {any} */ (0), minuteurSea: /** @type {any} */ (0), minuteurRattrapage: /** @type {any} */ (0), cacheMobilesT: 0 };
  let version = 0;
  // comme la v1 : on part de l'atlas des lieux (repris de la v1 s'il existe), sinon de la liste intégrée, affichés tout de suite pendant que les sources répondent
  lieuxBase = atlas.nombre() ? atlas.lieux() : listeIntegree();
  E.source = atlas.nombre() ? `atlas local (${atlas.nombre()} lieux)` : 'liste intégrée';
  D.lieux = lieuxBase;
  const change = (/** @type {string} */ quoi) => { version++; quandChange(quoi); };
  /** Les lieux de la v1 (`cities`) d'abord, puis les sommets lointains (`farPeaks`) : l'ordre compte pour les égalités de tri. */
  const publierLieux = () => { D.lieux = sommets.length ? lieuxBase.concat(sommets) : lieuxBase; };
  const encore = (/** @type {Point} */ ici) => !!D.pos && D.pos.lat === ici.lat && D.pos.lon === ici.lon; // la position n'a pas changé pendant le chargement

  /** Monuments finaux : base Wikidata + tours, bâtiments hauts et statues OSM. Les doublons repères/monuments sont recalculés avec. */
  function recomposerMonuments() {
    if (!D.pos) return;
    const S = reglages(), sep = separerTuilesOsm(tuilesOsm);
    D.monuments = combinerMonuments({ pos: D.pos, rayonKm: rayonMonuments(S.radius), cities: /** @type {any} */ (lieuxBase), tours: sep.tours, statues: sep.statues, hints: {}, supportsAnfr: /** @type {any} */ (D.pylones),
      batiments: /** @type {any} */ (batiments), avecAnfr: !!S.layers.monuments }, baseWikidata);
    D.doublonsReperes = doublonsBatiments(D.reperes, D.monuments);
  }

  async function chargerLieux(force = false) {
    const S = reglages(), pos = D.pos;
    if (!pos || occupe.lieux) return;
    if (!sourceLieux.doitRecharger({ force, dernier: couvert.lieux, source: E.source, rayonCharge: E.rayonCharge, pos, rayonKm: S.radius })) return;
    occupe.lieux = true; E.chargementLieux = true; E.debutLieux = maintenant(); change('lieux');
    try {
      const sourceAvant = E.source;
      const r = await sourceLieux.charger({ pos, rayonKm: S.radius, hameaux: S.hamlets, reperes: /** @type {any} */ (S.poi), sourceActuelle: sourceAvant, lieuxActuels: lieuxBase,
        quandPartiel: (p) => { E.sourcesLieux = p.sources; if (!encore(pos) || !p.lieux.length) { change('lieux'); return; } lieuxBase = p.lieux; publierLieux(); E.source = p.source; change('lieux'); } });
      E.sourcesLieux = r.sources;
      if (encore(pos)) { lieuxBase = r.lieux; publierLieux(); E.source = r.source; E.rayonCharge = S.radius; if (r.enLigne) couvert.lieux = { ...pos }; }
    } catch (e) { journal.erreur('app', 'chargement des lieux', e); }
    occupe.lieux = false; E.chargementLieux = false; change('lieux');
  }

  async function chargerSommets(force = false) {
    const S = reglages(), pos = D.pos;
    if (!pos || S.calculRelief === false || occupe.sommets) return;
    if (!force && couvert.sommets && distanceEtCap(pos, couvert.sommets).distKm < 25) return;
    occupe.sommets = true;
    try {
      const r = await sourceSommets.charger({ pos });
      if (encore(pos)) { sommets = r.sommets; publierLieux(); recomposerMonuments(); if (r.tuilesOk) couvert.sommets = { ...pos }; }
      journal.info('app', `${r.sommets.length} grand(s) sommet(s) lointain(s) (${r.tuilesOk}/${r.tuiles} tuile(s))`);
    } catch (e) { journal.avert('app', 'sommets lointains indisponibles', e); }
    occupe.sommets = false; change('sommets');
  }

  async function chargerTerrain(force = false) {
    const S = reglages(), pos = D.pos;
    if (S.calculRelief === false) { // relief éteint : on retire celui qui était affiché
      if (D.terrain) { D.terrain = null; E.terrainCentre = null; couvert.terrain = null; change('relief'); }
      E.etatRelief = 'désactivé'; return;
    }
    if (!pos || occupe.terrain) return;
    if (!force && couvert.terrain && distanceEtCap(pos, couvert.terrain).distKm < PROCHE_KM) return;
    occupe.terrain = true; E.etatRelief = 'calcul…'; change('relief');
    try {
      await calculerTerrainAvecRepli({ pos, source: 'mapterhorn', chargeur: chargeurTuiles, masque, correctionOeilM: S.obsHeight || 0, maintenant,
        publier: (t) => { if (!encore(pos)) return; D.terrain = { h0: t.h0, pm: t.pm, bands: t.bands }; E.terrainCentre = { ...pos }; E.etatRelief = t.refining || t.partial ? 'calcul…' : 'ok'; change('relief'); } });
      couvert.terrain = { ...pos }; E.etatRelief = 'ok';
    } catch (e) { E.etatRelief = 'indispo'; journal.erreur('app', 'relief', e); }
    occupe.terrain = false; change('relief');
  }

  async function chargerMonuments(force = false) {
    const S = reglages(), pos = D.pos;
    if (!pos || !S.layers.monuments || occupe.monuments) return;
    const R = rayonMonuments(S.radius);
    if (!force && couvert.monuments && distanceEtCap(pos, couvert.monuments).distKm < R * 0.25) return;
    if (!force && recul.monuments.t !== null && maintenant() - recul.monuments.t < recul.monuments.ms) return;
    occupe.monuments = true; E.msgMonuments = 'recherche…'; change('monuments');
    try {
      const r = await sourceMonuments.charger({ pos, rayonKm: S.radius, force, pendantChargement: (f) => { if (!encore(pos)) return; baseWikidata = f.gardes; recomposerMonuments(); change('monuments'); } });
      E.msgMonuments = r.comment;
      if (r.fabrication && encore(pos)) { baseWikidata = r.fabrication.gardes; recomposerMonuments(); }
      if (r.statut === 'indisponible' || r.tuilesEnEchec) { recul.monuments.t = maintenant(); recul.monuments.ms = reculSuivant(recul.monuments.ms); } else { recul.monuments.t = null; recul.monuments.ms = 30000; couvert.monuments = { ...pos }; }
      change('monuments');
      const F = Math.min(12, R), o = await osm.charger(pos, F, R, (els) => { if (!encore(pos)) return; tuilesOsm = els; recomposerMonuments(); change('monuments'); });
      if (encore(pos)) { tuilesOsm = o.objets; recomposerMonuments(); }
    } catch (e) { E.msgMonuments = 'indispo'; recul.monuments.t = maintenant(); recul.monuments.ms = reculSuivant(recul.monuments.ms); journal.erreur('app', 'monuments', e); }
    occupe.monuments = false; change('monuments');
  }

  async function chargerTelecom(force = false) {
    const S = reglages(), pos = D.pos;
    if (!pos || occupe.telecom) return;
    const demande = { telecom: S.telecom, monuments: !!S.layers.monuments, telecomMaxKm: S.telecomMax };
    if (!telecomVoulu(demande) || !relais) return;
    const rayonKm = rayonTelecom(demande);
    if (!force && !doitChargerTelecom({ pos, couvertEn: couvert.telecom, rayonKm, echecT: recul.telecom.t, reculMs: recul.telecom.ms, maintenant: maintenant() })) return;
    occupe.telecom = true; E.msgTelecom = 'recherche…'; change('telecom');
    try {
      const r = await sourceTelecom.charger({ pos, rayonKm, contourner: force });
      if (encore(pos)) { D.pylones = r.sites; recomposerMonuments(); }
      E.msgTelecom = r.horsFrance ? 'hors de France' : `${r.sites.length} site(s)`;
      if (r.source === 'secours') { recul.telecom.t = maintenant(); recul.telecom.ms = reculSuivant(recul.telecom.ms); } else { recul.telecom.t = null; recul.telecom.ms = RECUL_INITIAL_MS; couvert.telecom = { ...pos }; }
    } catch (e) { E.msgTelecom = 'indispo'; recul.telecom.t = maintenant(); recul.telecom.ms = reculSuivant(recul.telecom.ms); journal.erreur('app', 'télécom', e); }
    occupe.telecom = false; change('telecom');
  }

  async function chargerReperes(force = false) {
    const S = reglages(), pos = D.pos;
    if (!pos || !S.buildings || occupe.reperes) return;
    if (!force && couvert.reperes && distanceEtCap(pos, couvert.reperes).distKm < Math.max(1, S.buildingsMax * 0.3)) return;
    if (!force && recul.reperes.t !== null && maintenant() - recul.reperes.t < recul.reperes.ms) return;
    occupe.reperes = true; E.msgReperes = 'recherche…'; change('reperes');
    try {
      const r = await sourceReperes.charger({ pos, rayonKm: S.buildingsMax, quandPartiel: (liste) => { if (!encore(pos)) return; batiments = liste; D.reperes = liste; recomposerMonuments(); change('reperes'); } });
      if (encore(pos)) { batiments = r.liste; D.reperes = r.liste; recomposerMonuments(); }
      E.msgReperes = `${r.liste.length} repère(s)`;
      if (r.partiel) { recul.reperes.t = maintenant(); recul.reperes.ms = reculSuivant(recul.reperes.ms); } else { recul.reperes.t = null; recul.reperes.ms = 30000; couvert.reperes = { ...pos }; }
    } catch (e) { E.msgReperes = 'indispo'; recul.reperes.t = maintenant(); recul.reperes.ms = reculSuivant(recul.reperes.ms); journal.erreur('app', 'repères hauts', e); }
    occupe.reperes = false; change('reperes');
  }

  async function chargerAvions() {
    const S = reglages(), pos = D.pos;
    if (trafic.mode !== 'direct' || !S.air || !pos || !visible()) return;
    const r = await sourceAvions.charger({ pos, rayonKm: S.airMax, avions: trafic.avions, pauseJusqua: trafic.pauseAir });
    trafic.avions = r.avions; trafic.pauseAir = r.pauseJusqua;
    trafic.msgAir = r.message || (r.restaure ? `${r.avions.length} av. (mémoire)` : trafic.msgAir);
    if (r.detail !== 'pause en cours') journal[r.ok ? 'info' : 'avert']('avions', r.detail);
    change('avions');
  }
  async function chargerNavires() {
    const S = reglages(), pos = D.pos;
    if (trafic.mode !== 'direct' || !S.sea || !pos || !visible()) return;
    const r = await sourceNavires.charger({ pos, rayonKm: S.seaMax, navires: trafic.navires });
    trafic.navires = r.navires;
    trafic.msgSea = r.message || (r.restaure ? `${r.navires.size} bat. (mémoire)` : trafic.msgSea);
    journal[r.ok ? 'info' : 'avert']('bateaux', r.detail);
    change('bateaux');
  }
  /** (Re)lance les relevés périodiques d'après les réglages : avions toutes les 20 s (60 s sans relais), bateaux toutes les 30 s. */
  function lancerTrafic() {
    clearInterval(trafic.minuteurAir); clearInterval(trafic.minuteurSea); trafic.minuteurAir = trafic.minuteurSea = 0;
    const S = reglages();
    if (trafic.mode !== 'direct') { trafic.avions = []; trafic.navires = new Map(); trafic.msgAir = trafic.msgSea = ''; return; }
    if (!S.air) { trafic.avions = []; trafic.msgAir = ''; }
    if (!S.sea) { trafic.navires = new Map(); trafic.msgSea = ''; }
    if (S.air) { chargerAvions(); trafic.minuteurAir = setInterval(chargerAvions, relais ? 20000 : 60000); }
    if (S.sea) { chargerNavires(); trafic.minuteurSea = setInterval(chargerNavires, 30000); }
  }

  const chargeurs = { lieux: chargerLieux, sommets: chargerSommets, terrain: chargerTerrain, monuments: chargerMonuments, telecom: chargerTelecom, reperes: chargerReperes };
  /** Tout ce qui doit l'être pour la position courante (chaque chargeur applique ses propres seuils). @param {boolean} [force] */
  const actualiser = (force = false) => Promise.allSettled(Object.values(chargeurs).map((c) => c(force)));

  /** Après un saut de position : tous les chargements sont relancés toutes les 3 s pendant 1 min (chacun s'ignore s'il couvre déjà le lieu) et les reculs sont oubliés. */
  function rattraper() {
    clearInterval(trafic.minuteurRattrapage);
    recul.telecom.t = recul.monuments.t = recul.reperes.t = null;
    let n = 0;
    trafic.minuteurRattrapage = setInterval(() => { if (++n > 20 || !D.pos) { clearInterval(trafic.minuteurRattrapage); return; } actualiser(false); }, 3000);
  }

  return {
    /** Le réseau unique (le carnet de calage s'en sert pour son envoi au relais). */
    reseau,
    /** Le relief affiché est-il périmé pour la position courante (absent, ou calculé à plus de 300 m) ? */
    reliefPerime: () => !D.terrain || !D.pos || !E.terrainCentre || distanceEtCap(D.pos, E.terrainCentre).distKm > PROCHE_KM,
    /** Avant un calage : relance le relief s'il est périmé et attend sa première publication (au plus `msMax`), comme la v1 (le relief lointain suffit : pas besoin du relief fin). @param {number} [msMax] */
    async attendreRelief(msMax = 8000) {
      const perime = () => !D.terrain || !D.pos || !E.terrainCentre || distanceEtCap(D.pos, E.terrainCentre).distKm > PROCHE_KM;
      if (!perime() || E.etatRelief === 'indispo' || reglages().calculRelief === false) return;
      chargerTerrain(false);
      const t0 = maintenant();
      while (perime() && maintenant() - t0 < msMax) await new Promise((ok) => setTimeout(ok, 120));
    },
    /** Mode de la page : le trafic en direct n'existe qu'en `direct`. @param {'direct' | 'photo'} mode */
    definirMode(mode) { trafic.mode = mode; lancerTrafic(); change('mode'); },
    /** Après un changement des réglages avions / bateaux. */
    synchroniserTrafic: lancerTrafic,
    /** Mobiles proches pour `composerScene`, recalculés toutes les 0,4 s (positions extrapolées) ; aucun en photo rejouée. @param {number} [t] */
    actualiserMobiles(t = maintenant()) {
      if (t - trafic.cacheMobilesT < 400) return D.mobiles;
      trafic.cacheMobilesT = t;
      if (!D.pos) { D.mobiles = []; return D.mobiles; }
      const S = reglages(), r = listerMobiles({ pos: D.pos, avions: trafic.avions, navires: trafic.navires, reglages: { air: S.air, sea: S.sea, airMaxKm: S.airMax, seaMaxKm: S.seaMax }, maintenantMs: t, photo: trafic.mode === 'photo' });
      for (const id of r.expires) trafic.navires.delete(id);
      D.mobiles = r.mobiles;
      return D.mobiles;
    },
    /** Nouvelle position (GPS, photo, simulation) : les chargements dont le seuil de déplacement est dépassé repartent. @param {Point} pos @param {{force?: boolean}} [o] */
    definirPosition(pos, { force = false } = {}) {
      const saut = D.pos ? distanceEtCap(D.pos, pos).distKm : Infinity;
      D.pos = { lat: pos.lat, lon: pos.lon };
      if (saut > 2) { D.terrain = null; sommets = []; publierLieux(); D.monuments = []; D.pylones = []; D.reperes = []; D.doublonsReperes = []; baseWikidata = []; tuilesOsm = []; batiments = []; Object.assign(couvert, { lieux: null, sommets: null, terrain: null, monuments: null, telecom: null, reperes: null }); }
      change('position');
      if (trafic.mode === 'direct' && (saut === Infinity || saut > 3)) { chargerNavires(); chargerAvions(); } // la mémoire de l'appareil s'affiche dès le premier point GPS
      if (saut !== Infinity && saut > 3) rattraper();
      return actualiser(force || saut > 2);
    },
    /** Après un changement de réglage (rayon, calques, relief…) : relance ce qui est nécessaire. @param {{lieux?: boolean, terrain?: boolean, monuments?: boolean, telecom?: boolean, reperes?: boolean}} [quoi] */
    recharger(quoi = {}) {
      if (quoi.terrain) { couvert.terrain = null; couvert.sommets = null; }
      if (quoi.monuments) couvert.monuments = null;
      if (quoi.telecom) couvert.telecom = null;
      if (quoi.reperes) couvert.reperes = null;
      return Promise.allSettled([chargerLieux(!!quoi.lieux), chargerSommets(!!quoi.terrain), chargerTerrain(!!quoi.terrain), chargerMonuments(!!quoi.monuments), chargerTelecom(!!quoi.telecom), chargerReperes(!!quoi.reperes)]);
    },
    actualiser,
    /** Silhouette du ciel lue sur l'image (null : aucune) ; datée par l'appelant. @param {any} analyse */
    definirAnalysePhoto(analyse) { D.analysePhoto = analyse; change('analyse'); },
    /** Données pour `composerScene`. */
    donnees: () => D,
    /** Corrige la hauteur d'œil : relit le relief. @param {number} m */
    corrigerHauteurOeil(m) { reglages().obsHeight = m; return chargerTerrain(true); },
    /** @returns {{version: number, source: string, chargementLieux: boolean, depuisLieuxMs: number, sourcesLieux: import('../donnees/lieux.js').DetailSource[], etatRelief: string, monuments: string, telecom: string, reperes: string, messageAir: string, messageSea: string, lieux: number, sommets: number, nbMonuments: number}} */
    etat: () => ({ version, source: E.source, chargementLieux: E.chargementLieux, depuisLieuxMs: E.chargementLieux ? maintenant() - E.debutLieux : 0, sourcesLieux: E.sourcesLieux, etatRelief: E.etatRelief, monuments: E.msgMonuments, telecom: E.msgTelecom, reperes: E.msgReperes, messageAir: trafic.msgAir, messageSea: trafic.msgSea, lieux: lieuxBase.length, sommets: sommets.length, nbMonuments: D.monuments.length }),
    /** Compteurs de la mémoire de l'appareil par genre : { hit, net, stale, fail }. */
    compteursCache: () => cacheDonnees.compteurs(),
    /** Vrai si un chargement est en cours. */
    occupe: () => Object.values(occupe).some(Boolean),
  };
}
