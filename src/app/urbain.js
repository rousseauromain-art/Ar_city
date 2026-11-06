// @ts-check
/**
 * Données urbaines : bâtiments (BD TOPO) et rues. Décide QUAND charger, garde les résultats dans `D` (`D.batiments`, `D.rues`), recalcule la silhouette des bâtiments (Worker, repli fil principal) et gère
 * la part « hors ligne » (téléchargement, état, suppression). Les bâtiments ne sont chargés que si le calque est coché, si la position par les toits est cochée ou à la demande d'un calage (`assurerBatiments`) ;
 * les rues, légères (1 à 4 tuiles), le sont en direct, ou à la demande en photo rejouée.
 * Dépend de : donnees/bdtopo.js, donnees/rues.js, scene/silhouette-batiments.js, scene/relief.js, noyau/geo.js.
 */
import { distanceEtCap } from '../noyau/geo.js';
import { altitudeEn } from '../scene/relief.js';
import { poserSol, premierPlanM, profilBatiments, lisserCouches } from '../scene/silhouette-batiments.js';
import { BATIMENTS_RAYON_KM } from '../donnees/bdtopo.js';

/** Déplacement (km) en deçà duquel les bâtiments chargés couvrent encore la position (les tuiles font 2,5 km de rayon). */
const RENOUVELER_BATIMENTS_KM = 0.4;
/** Déplacement (m) qui relance le calcul de la silhouette (v1 : 40 m). */
const RECALCUL_M = 40;
/** Rayon (km) des rues gardées pour le hors ligne : de quoi marcher longtemps sans réseau. */
const RAYON_RUES_HORS_LIGNE_KM = 1.5;
const RECUL_INITIAL_MS = 30000;

/** @typedef {{lat: number, lon: number}} Point */
/**
 * Contexte partagé des fonctions du module (le même objet pour tout) : `D` (données de la scène), réglages, journal, sources et état interne `e`.
 * @typedef {object} Contexte
 * @property {any} D @property {() => import('../moteur/reglages.js').Reglages} reglages @property {any} journal @property {(quoi: string) => void} change @property {(p: Point) => boolean} encore @property {() => number} maintenant
 * @property {ReturnType<typeof import('../donnees/bdtopo.js').creerSourceBatiments>} sourceBatiments @property {ReturnType<typeof import('../donnees/rues.js').creerSourceRues>} sourceRues
 * @property {((b: any, o: any, lisser: boolean) => Promise<{profil: any, ls: Float32Array[]}>) | null} calculer @property {ReturnType<typeof import('../donnees/cache-donnees.js').creerCacheDonnees>} cacheDonnees
 * @property {{lire: (n: string, d: any) => any, ecrire: (n: string, v: any) => any}} stockage @property {(ms: number) => number} reculSuivant @property {() => boolean} direct vrai en direct (les rues se chargent seules)
 * @property {ReturnType<typeof etatInitial>} e
 */

const etatInitial = () => ({ msgBatiments: '', msgRues: '', couvertBat: /** @type {Point | null} */ (null), couvertRues: /** @type {Point | null} */ (null), occupeBat: false, occupeRues: false, demandeBat: false, demandeRues: false,
  reculBat: { t: /** @type {number | null} */ (null), ms: RECUL_INITIAL_MS }, reculRues: { t: /** @type {number | null} */ (null), ms: RECUL_INITIAL_MS }, silhouettePos: /** @type {Point | null} */ (null), jeton: 0, zPour: /** @type {any} */ (null), dureeSilhouetteMs: 0 });

/** Silhouette dessinée : recalculée après les bâtiments, le relief (altitude du pied), un déplacement de 40 m ou un changement de réglage. @param {Contexte} c */
async function recalculer(c) {
  const { D, e } = c, S = c.reglages(), pos = D.pos, bats = D.batiments;
  if (!pos || !bats.length || S.layers.urban !== true) { if (D.silhouetteUrbaine) { D.silhouetteUrbaine = null; c.change('silhouette'); } return; }
  const jeton = ++e.jeton, relief = S.relief && D.terrain ? D.terrain : null;
  if (relief && e.zPour !== relief) { poserSol(bats, (lat, lon, dk) => altitudeEn(relief.bands, lat, lon, dk), pos); e.zPour = relief; }
  const lisser = S.layers.urbSmooth !== false, opts = { pos: { lat: pos.lat, lon: pos.lon }, oeilRelM: 1.6 + (S.obsHeight || 0), h0: relief ? relief.h0 : null, clipM: premierPlanM(S.obsHeight || 0, S.layers.urbClip !== false), courbure: true };
  const t0 = c.maintenant();
  try {
    const r = c.calculer ? await c.calculer(bats, opts, lisser) : (() => { const profil = profilBatiments(bats, opts); return { profil, ls: lisserCouches(profil.la, lisser) }; })();
    if (jeton !== e.jeton) return;
    D.silhouetteUrbaine = { ls: r.ls, ld: r.profil.ld, la: r.profil.la, ang: r.profil.ang, dist: r.profil.dist, pos: opts.pos, oeilRelM: opts.oeilRelM };
    e.silhouettePos = opts.pos; e.dureeSilhouetteMs = c.maintenant() - t0; c.change('silhouette');
  } catch (err) { c.journal.avert('urbain', 'silhouette des bâtiments impossible', err); }
}

/** Faut-il (re)charger les bâtiments ? Sinon, la silhouette est recalculée si l'on a bougé de 40 m. @param {Contexte} c @param {boolean} force @param {Point} pos */
function doitChargerBatiments(c, force, pos) {
  const { e } = c, S = c.reglages();
  if (e.occupeBat || !(S.layers.urban === true || S.positionToits === true || e.demandeBat)) return false;
  if (!force && e.couvertBat && distanceEtCap(pos, e.couvertBat).distKm < RENOUVELER_BATIMENTS_KM) {
    if (!e.silhouettePos || distanceEtCap(pos, e.silhouettePos).distKm * 1000 >= RECALCUL_M) recalculer(c);
    return false;
  }
  return force || e.reculBat.t === null || c.maintenant() - e.reculBat.t >= e.reculBat.ms;
}

/** Résultat d'un chargement : publié si l'observateur est resté ici ; recul progressif en cas d'échec de tuiles. @param {Contexte} c @param {Point} pos @param {Awaited<ReturnType<Contexte['sourceBatiments']['charger']>>} r */
function appliquerBatiments(c, pos, r) {
  const { D, e } = c;
  if (c.encore(pos)) { D.batiments = r.batiments; e.zPour = null; recalculer(c); }
  e.msgBatiments = `${r.batiments.length} bâtiment(s), ${r.tuilesOk}/${r.tuiles} tuile(s)${r.viaRelais ? ' via le relais' : ''}${r.tuilesCache ? `, ${r.tuilesCache} en mémoire` : ''}`;
  if (r.tuilesEchec) echecBatiments(c); else { e.reculBat.t = null; e.reculBat.ms = RECUL_INITIAL_MS; e.couvertBat = { ...pos }; }
}
/** @param {Contexte} c */
function echecBatiments(c) { c.e.reculBat.t = c.maintenant(); c.e.reculBat.ms = c.reculSuivant(c.e.reculBat.ms); }

/** @param {Contexte} c @param {boolean} force */
async function chargerBatiments(c, force = false) {
  const pos = c.D.pos;
  if (!pos || !doitChargerBatiments(c, force, pos)) return;
  c.e.occupeBat = true; c.e.msgBatiments = 'chargement…'; c.change('batiments');
  try { appliquerBatiments(c, pos, await c.sourceBatiments.charger({ pos, contourner: force })); }
  catch (err) { c.e.msgBatiments = 'indispo'; echecBatiments(c); c.journal.erreur('app', 'bâtiments', err); }
  c.e.occupeBat = false; c.change('batiments');
}

/** @param {Contexte} c @param {boolean} force */
async function chargerRues(c, force = false) {
  const { D, e } = c, pos = D.pos;
  if (!pos || e.occupeRues || !(c.direct() || e.demandeRues || force)) return;
  if (!force && e.couvertRues && distanceEtCap(pos, e.couvertRues).distKm * 1000 < 100) return;
  if (!force && e.reculRues.t !== null && c.maintenant() - e.reculRues.t < e.reculRues.ms) return;
  e.occupeRues = true; e.msgRues = 'chargement…'; c.change('rues');
  try {
    const r = await c.sourceRues.charger({ pos, contourner: force });
    if (c.encore(pos)) D.rues = r.rues;
    e.msgRues = `${r.rues.length} rue(s) (${r.source})`; e.reculRues.t = null; e.reculRues.ms = RECUL_INITIAL_MS; e.couvertRues = { ...pos };
  } catch (err) { e.msgRues = 'indispo'; e.reculRues.t = c.maintenant(); e.reculRues.ms = c.reculSuivant(e.reculRues.ms); c.journal.erreur('app', 'rues', err); }
  e.occupeRues = false; c.change('rues');
}

/** Attend qu'un chargeur ait fini (au plus `msMax`). @param {Contexte} c @param {() => boolean} fini @param {number} msMax */
async function attendre(c, fini, msMax) { const t0 = c.maintenant(); while (!fini() && c.maintenant() - t0 < msMax) await new Promise((ok) => setTimeout(ok, 120)); }

/** Zone téléchargée : bâtiments sur 2,5 km, rues sur 1,5 km ; tout reste sur l'appareil 30 jours (mêmes clés que le chargement normal). @param {Contexte} c @param {Point} pos */
async function telechargerZone(c, pos) {
  const bat = await c.sourceBatiments.charger({ pos, rayonKm: BATIMENTS_RAYON_KM }), tuilesRues = c.sourceRues.tuilesDe(pos, RAYON_RUES_HORS_LIGNE_KM * 1000);
  let ru = 0;
  for (const t of tuilesRues) { try { await c.sourceRues.garderTuile(t); ru++; } catch (err) { c.journal.avert('urbain', `tuile de rues ${t.x}/${t.y} indisponible`, err); } }
  if (!bat.tuilesOk) throw new Error('aucune tuile de bâtiments reçue');
  const info = { t: c.maintenant(), batiments: bat.tuilesOk, rues: ru, nBatiments: bat.batiments.length, centre: { lat: pos.lat, lon: pos.lon } };
  c.stockage.ecrire('zoneUrbaine', info);
  return info;
}

/** @param {Contexte} c */
function assurerBatiments(c) {
  return async (/** @type {number} */ msMax = 10000) => {
    const { D, e } = c;
    e.demandeBat = true;
    if (D.pos && (!e.couvertBat || distanceEtCap(D.pos, e.couvertBat).distKm >= RENOUVELER_BATIMENTS_KM)) { chargerBatiments(c, false); await attendre(c, () => !e.occupeBat && (!!e.couvertBat || e.msgBatiments === 'indispo'), msMax); }
    return D.batiments;
  };
}
/** @param {Contexte} c */
function assurerRues(c) {
  return async (/** @type {number} */ msMax = 6000) => {
    const { D, e } = c;
    e.demandeRues = true;
    if (D.pos && (!e.couvertRues || distanceEtCap(D.pos, e.couvertRues).distKm * 1000 >= 100)) { chargerRues(c, false); await attendre(c, () => !e.occupeRues && (!!e.couvertRues || e.msgRues === 'indispo'), msMax); }
    return D.rues;
  };
}

/**
 * @param {Omit<Contexte, 'e'> & {calculer?: Contexte['calculer']}} p
 */
export function creerUrbain(p) {
  /** @type {Contexte} */
  const c = { ...p, calculer: p.calculer ?? null, e: etatInitial() }, { D, e } = c;
  D.batiments = []; D.rues = []; D.silhouetteUrbaine = null;
  return {
    chargerBatiments: (/** @type {boolean} */ force) => chargerBatiments(c, force), chargerRues: (/** @type {boolean} */ force) => chargerRues(c, force), recalculer: () => recalculer(c), telechargerZone: (/** @type {Point} */ pos) => telechargerZone(c, pos),
    /** Les bâtiments d'ici, au besoin (calage en ville) : chargés même si le calque est éteint. */
    assurerBatiments: assurerBatiments(c),
    /** Les rues d'ici, au besoin (photo rejouée, guidage). */
    assurerRues: assurerRues(c),
    /** Saut de position (> 2 km) : tout est oublié. */
    reinitialiser() { D.batiments = []; D.rues = []; D.silhouetteUrbaine = null; e.couvertBat = e.couvertRues = null; e.silhouettePos = null; e.zPour = null; e.jeton++; },
    /** Demande explicite (bouton « Recharger », réglage) : on oublie la couverture et le recul, si `oui`. @param {boolean} oui */
    oublier(oui) { if (!oui) return; e.couvertBat = null; e.couvertRues = null; e.reculBat.t = null; e.reculRues.t = null; },
    oublierRecul() { e.reculBat.t = null; e.reculRues.t = null; },
    /** Ce qui est gardé pour le hors ligne. */
    infoZone: () => c.stockage.lire('zoneUrbaine', null),
    /** Efface bâtiments et rues gardés. */
    async effacer() {
      c.stockage.ecrire('zoneUrbaine', null); // tout de suite : l'écran ne doit pas annoncer une zone en cours d'effacement
      const a = await c.cacheDonnees.effacerPrefixe('bd/'), b = await c.cacheDonnees.effacerPrefixe('ru/');
      return { batiments: a, rues: b };
    },
    etat: () => ({ batiments: e.msgBatiments, rues: e.msgRues, silhouetteMs: e.dureeSilhouetteMs, nBatiments: D.batiments.length, nRues: D.rues.length }),
    occupe: () => e.occupeBat || e.occupeRues,
  };
}
