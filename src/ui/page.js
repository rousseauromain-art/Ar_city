// @ts-check
/**
 * Page de la v2 (v2/photo.html en photo rejouée, v2/ar.html en direct) : même interface que la v1, branchée sur la racine de composition (app/application.js) et le moteur de scène (moteur/scene.js).
 * DOM uniquement : la logique est dans src/. Entrées : le document, config.js (APP_CONFIG.relay), le fichier choisi. Sortie : le canvas à 30 images/s, les réglages mémorisés (`vh2:reglages`).
 * Les deux modes ne diffèrent que par la pose (photo : réglages de calage ; direct : capteurs), l'image de fond (photo ou caméra), la position (EXIF ou GPS) et le trafic en direct.
 */
import { journal } from '../outils/journal.js';
import { etat } from '../outils/etat.js';
import { creerStockage, adaptateurNavigateur, PREFIXE_CACHE } from '../outils/stockage.js';
import { lireDrapeaux } from '../outils/drapeaux.js';
import { chargerEruda } from '../outils/debug.js';
import { VERSION_V2 } from '../outils/version.js';
import { lireReglages, ecrireReglages, reprendreReglagesV1 } from '../moteur/reglages.js';
import { composerScene } from '../moteur/scene.js';
import { creerApplication } from '../app/application.js';
import { champAffiche } from '../rendu/projection.js';
import { avecRoulis, dessiner } from '../rendu/canvas.js';
import { creerFusion, poseCapteurs, mesuresFusion } from '../entrees/capteurs.js';
import { creerEntreeDirecte } from '../entrees/direct.js';
import { PERIODE_ANALYSE_MS } from '../vision/silhouette-ciel.js';
import { lirePositionTexte } from '../entrees/photo.js';
import { installerOeil } from './oeil.js';
import { installerVisibilitePhoto } from './visibilite-photo.js';
import { installerCalage } from './calage.js';
import { installerDiagnostic } from './diagnostic.js';
import { installerPhoto } from './photo.js';
import { installerGestes } from './gestes.js';
import { installerDeclencheur } from './declencheur.js';
import { creerCarnet } from '../app/carnet.js';

/** @param {string} id @returns {any} */
const $ = (id) => { const e = document.getElementById(id); if (!e) throw new Error(`élément #${id} introuvable`); return e; };
/** Élément facultatif (absent de la page en direct : la photo rejouée a sa propre page) : un élément détaché si la page ne l'a pas. @param {string} id @returns {any} */
const $f = (id) => document.getElementById(id) || document.createElement('span');

/** @param {{mode: 'photo' | 'direct'}} o `photo` : photo rejouée (v2/photo.html) ; `direct` : caméra, GPS et capteurs (v2/ar.html). */
export function demarrerPage({ mode }) {
  const direct = mode === 'direct';
  const stockage = creerStockage({ adaptateur: adaptateurNavigateur(journal), journal });
  etat.definirVersion(VERSION_V2);
  etat.remplacerDrapeaux(lireDrapeaux({ recherche: location.search, stockage, journal }));
  window.addEventListener('error', (ev) => journal.erreur('page', ev.message, { fichier: ev.filename, ligne: ev.lineno }));
  window.addEventListener('unhandledrejection', (ev) => journal.erreur('page', 'promesse rejetée', ev.reason));
  chargerEruda({ recherche: location.search, journal });

  const sm = document.querySelector('#start small'); if (sm) sm.textContent += ` · ${VERSION_V2}`;
  const reglagesRepris = reprendreReglagesV1(stockage, (k) => { try { return localStorage.getItem(k); } catch { return null; } });
  const S = lireReglages(stockage);
  /** État partagé par la page et ses modules (ui/*.js) : la photo ouverte, la taille de l'écran, le dernier bilan de la scène, le dernier retour à la boussole. @type {import('./contexte.js').EtatPartage} */
  const ps = { photoMode: null, W: 0, H: 0, dpr: 1, dernierBilan: null, dernierRetour: null };
  const sauver = () => ecrireReglages(stockage, S, ps.photoMode ? ps.photoMode.backup : null);
  const relais = String((/** @type {any} */ (window).APP_CONFIG || {}).relay || '');
  const app = creerApplication({ reglages: () => S, journal, stockage, relais, urlWorkerMasque: new URL('../workers/masque-relief.js', import.meta.url), quandChange: () => {} });
  app.definirMode(mode);
  const fusion = creerFusion();
  const carnet = creerCarnet({ stockage, journal, relais, reseau: app.reseau }); carnet.demarrer();

  const video = /** @type {HTMLVideoElement | null} */ (document.getElementById('cam'));
  const simulee = () => S.simOn && !!lirePositionTexte(S.simPos);
  const entree = direct && video ? creerEntreeDirecte({ video, fusion, journal, positionSimulee: simulee, surPosition: (p) => app.definirPosition({ lat: p.lat, lon: p.lon }),
    surRetourBoussole: (m) => { ps.dernierRetour = { t: Date.now(), m, headOff: S.headOff, pitchOff: S.pitchOff }; } }) : null;
  /** Échantillons du cap (1 par seconde, 10 min) : cap affiché, boussole, gyroscope, repère, calage — pour comprendre un décrochage. @type {{t: number, cap: number, boussole: number | null, gyro: number | null, repere: number | null, headOff: number, pitchOff: number}[]} */
  const echantillons = [];
  const ov = /** @type {HTMLCanvasElement} */ ($('ov')), ctx = /** @type {CanvasRenderingContext2D} */ (ov.getContext('2d'));
  const css = getComputedStyle(document.body), familles = { affichage: css.getPropertyValue('--display'), mono: css.getPropertyValue('--mono') };
  let safeT = 0;
  const memoires = { placement: new Map(), lignes: new Map(), choixBateaux: { ids: null }, calageMonuments: new Map(), analyseT: /** @type {number | null} */ (null) };
  const mesurerTexte = (/** @type {string} */ police, /** @type {string} */ t) => { ctx.font = police; return ctx.measureText(t).width; };

  function redimensionner() {
    ps.dpr = Math.min(window.devicePixelRatio || 1, 3); ps.W = window.innerWidth; ps.H = window.innerHeight;
    ov.width = Math.round(ps.W * ps.dpr); ov.height = Math.round(ps.H * ps.dpr); safeT = $('safe').getBoundingClientRect().height || 0; obstaclesT = 0;
  }
  let obstacles = /** @type {[number, number, number, number][]} */ ([]), obstaclesT = 0;
  /** Rectangles de l'interface qu'aucun nom ne doit recouvrir (mesurés une fois par seconde). */
  function obstaclesInterface() {
    const t = Date.now(); if (t - obstaclesT < 1000) return obstacles;
    obstaclesT = t; obstacles = [];
    for (const el of $('bar').querySelectorAll('button')) { const r = el.getBoundingClientRect(); if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden') obstacles.push([r.left - 4, r.right + 4, r.top - 4, r.bottom + 4]); }
    for (const id of ['tools', 'chips', 'btnSet', 'shutter', 'btnBeyond', 'layers']) { const r = $(id).getBoundingClientRect(); if (r.width && r.height) obstacles.push([r.left, r.right, r.top, r.bottom]); }
    return obstacles;
  }
  window.addEventListener('resize', () => setTimeout(redimensionner, 80));

  // ---------- notes, bandeau ----------
  /** @type {any} */
  let noteT = 0;
  const note = (/** @type {string} */ msg, ms = 4500) => { const n = $('note'); n.textContent = msg; n.style.display = 'block'; clearTimeout(noteT); noteT = setTimeout(() => { n.style.display = 'none'; }, ms); };
  const fluxImage = () => (ps.photoMode ? { largeurPx: ps.photoMode.w, hauteurPx: ps.photoMode.h } : entree ? entree.flux() : null);
  const vFov = () => champAffiche(S.camFov, { largeurPx: ps.W, hauteurPx: ps.H }, fluxImage());
  const pose = () => (direct ? poseCapteurs(fusion, S, Date.now()) : { capDeg: ((S.headOff % 360) + 360) % 360, inclinaisonDeg: S.pitchOff, roulisDeg: 0 });
  const montrerChamp = () => { $('fovV').textContent = `${S.camFov}° · affiché ${Math.round(vFov())}°`; };

  // ---------- réglages <-> commandes ----------
  /** @type {[string, (s: any) => boolean, (s: any, v: boolean) => void, string?][]} */
  const cases = [
    ['lyPlaces', (s) => s.layers.places, (s, v) => { s.layers.places = v; }], ['lyMon', (s) => s.layers.monuments, (s, v) => { s.layers.monuments = v; }, 'monuments'],
    ['lyEq', (s) => s.layers.equip !== false, (s, v) => { s.layers.equip = v; }], ['lyTel', (s) => s.telecom, (s, v) => { s.telecom = v; }, 'telecom'],
    ['lyBld', (s) => s.buildings, (s, v) => { s.buildings = v; }, 'reperes'], ['lySea', (s) => s.sea, (s, v) => { s.sea = v; }], ['lyAir', (s) => s.air, (s, v) => { s.air = v; }],
    ['air', (s) => s.air, (s, v) => { s.air = v; }], ['sea', (s) => s.sea, (s, v) => { s.sea = v; }], ['tel', (s) => s.telecom, (s, v) => { s.telecom = v; }, 'telecom'], ['bld', (s) => s.buildings, (s, v) => { s.buildings = v; }, 'reperes'],
    ['dst', (s) => s.showDist, (s, v) => { s.showDist = v; }], ['vil', (s) => s.hamlets, (s, v) => { s.hamlets = v; }, 'lieux'], ['rdg', (s) => s.ridges !== false, (s, v) => { s.ridges = v; }],
    ['sky', (s) => s.skyline, (s, v) => { s.skyline = v; }], ['crs', (s) => s.cross, (s, v) => { s.cross = v; }], ['lun', (s) => s.lune !== false, (s, v) => { s.lune = v; }], ['rel', (s) => s.relief, (s, v) => { s.relief = v; if (v) s.calculRelief = true; }, 'terrain'], ['relc', (s) => s.calculRelief !== false, (s, v) => { s.calculRelief = v; if (!v) s.relief = false; }, 'terrain'],
    ['simOn', (s) => s.simOn, (s, v) => { s.simOn = v; }],
  ];
  function synchroniser() {
    for (const [id, lire] of cases) { const e = $(id); if (e) e.checked = !!lire(S); }
    $('bey').checked = S.beyond; $('btnBeyond').classList.toggle('on', S.beyond); $('btnBeyond').setAttribute('aria-pressed', String(S.beyond)); $('eyeLbl').textContent = S.beyond ? 'Tout voir' : 'Essentiel';
    $('rad').value = $('radQ').value = S.radius; $('radV').textContent = $('radChip').textContent = '';
    $('radV').textContent = `${S.radius} km`; $('radChip').textContent = `⌖ ${S.radius} km`;
    $('fov').value = S.camFov; $('obsH').value = S.obsHeight; $('obsHV').textContent = `${S.obsHeight > 0 ? '+' : ''}${S.obsHeight} m`; $('simPos').value = S.simPos; $('flt').value = S.filter;
    document.querySelector('.chips')?.classList.toggle('folded', !!S.chipsFold); montrerChamp();
  }
  for (const [id, , ecrire, rechargement] of cases) $(id).addEventListener('change', (/** @type {any} */ e) => {
    ecrire(S, e.target.checked); sauver(); synchroniser();
    if (rechargement) app.recharger(rechargement === 'lieux' ? { lieux: true } : { [rechargement]: true });
    if (id === 'lyAir' || id === 'air' || id === 'lySea' || id === 'sea') app.synchroniserTrafic();
    if (id === 'simOn' || id === 'rel' || id === 'relc') memoires.placement.clear();
  });
  const setBeyond = (/** @type {boolean} */ v) => { S.beyond = v; sauver(); synchroniser(); };
  $('btnBeyond').addEventListener('click', () => setBeyond(!S.beyond));
  $('bey').addEventListener('change', (/** @type {any} */ e) => setBeyond(e.target.checked));
  const regleRayon = (/** @type {string} */ v) => { S.radius = +v; synchroniser(); };
  const rayonFini = () => { sauver(); app.recharger({ lieux: true, monuments: true, telecom: true, reperes: true }); };
  for (const id of ['rad', 'radQ']) { $(id).addEventListener('input', (/** @type {any} */ e) => regleRayon(e.target.value)); $(id).addEventListener('change', rayonFini); }
  $('radChip').addEventListener('click', () => { $('radPop').hidden = !$('radPop').hidden; });
  $('btnFold').addEventListener('click', () => { S.chipsFold = !S.chipsFold; sauver(); synchroniser(); });
  $('fov').addEventListener('input', (/** @type {any} */ e) => { S.camFov = +e.target.value; montrerChamp(); }); $('fov').addEventListener('change', sauver);
  /** Image dont on lit les pixels : la photo, ou le flux de la caméra une fois prêt. */
  const imageSource = () => (ps.photoMode ? ps.photoMode.img : video && entree && entree.flux() ? video : null);
  /** Dimensions de l'écran pour les lectures d'image. */
  const ecranPx = () => ({ largeurPx: ps.W, hauteurPx: ps.H });
  // ---------- modules de la page (ui/*.js) : chacun reçoit le contexte `c` ----------
  const c = /** @type {import('./contexte.js').Contexte} */ ({ direct, S, app, journal, stockage, carnet, fusion, entree, video, relais, memoires, ov, familles, ps, simulee, echantillons, reglagesRepris,
    $, $f, note, sauver, synchroniser, pose, vFov, fluxImage, ecranPx, imageSource, dessinerImage, redimensionner });
  const oeil = installerOeil(c);
  const vis = installerVisibilitePhoto(c);
  const calage = installerCalage(c);
  $('floorN').addEventListener('change', (/** @type {any} */ e) => oeil.regleOeil(Math.min(250, Math.round((+e.target.value || 0) * 3.2))));
  $('flt').addEventListener('input', (/** @type {any} */ e) => { S.filter = e.target.value; });
  $('simPos').addEventListener('change', (/** @type {any} */ e) => { S.simPos = e.target.value; sauver(); });
  $('reset').addEventListener('click', () => { S.headOff = 0; S.pitchOff = 0; sauver(); note('Calage remis à zéro'); });
  $('btnReload').addEventListener('click', () => { memoires.placement.clear(); app.recharger({ lieux: true, terrain: true, monuments: true, telecom: true, reperes: true }); note('Rechargement des lieux et du relief…'); });
  $('btnSky').addEventListener('click', async () => {
    if (S.calculRelief === false) { note('Relief désactivé (Réglages › Calculer le relief)', 5000); return; }
    if (!app.donnees().pos) { note('Relief : en attente de la position (GPS)', 5000); return; }
    if (app.etat().etatRelief === 'calcul…') { note('Relief : calcul déjà en cours', 4000); return; }
    note('Relief : calcul…', 60000);
    await app.recharger({ terrain: true });
    const e = app.etat().etatRelief;
    note(e === 'ok' ? 'Relief recalculé' : e === 'indispo' ? 'Relief indisponible (réseau ?) : nouvel essai automatique' : `Relief : ${e}`, 5000);
  });
  $('btnFs').addEventListener('click', () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => {}); });
  $('calib').addEventListener('click', () => { S.headOff = 0; S.pitchOff = 0; sauver(); note('Calage remis à zéro'); });
  // ---------- calage : sur le soleil (bouton cible) et par pointage (bouton réticule) ----------
  const bascule = (/** @type {string} */ id) => $(id).classList.toggle('open');
  $('btnLayers').addEventListener('click', () => { bascule('layers'); $('btnLayers').setAttribute('aria-expanded', String($('layers').classList.contains('open'))); });
  $('btnSet').addEventListener('click', () => $('sheet').classList.add('open')); $('btnClose').addEventListener('click', () => $('sheet').classList.remove('open'));
  $('btnFind').addEventListener('click', () => { $('sheet').classList.add('open'); setTimeout(() => $('flt').focus(), 300); });
  for (const id of ['btnZoneDL', 'btnZoneDel']) { const b = $(id); b.disabled = true; b.classList.add('etape10'); }
  $('phv').checked = S.photoVis === true;
  $('phv').addEventListener('change', (/** @type {any} */ e) => { S.photoVis = e.target.checked; app.definirAnalysePhoto(null); vis.analyse.derniere = null; sauver(); });
  $('oeilGps').checked = S.oeilGps !== false; $('oeilGps').disabled = !direct; $('oeilGps').addEventListener('change', (/** @type {any} */ e) => { S.oeilGps = e.target.checked; oeil.reprendreAuto(); sauver(); });
  $('autoRel').checked = S.autoRelief === true; $('autoRel').addEventListener('change', (/** @type {any} */ e) => { S.autoRelief = e.target.checked; sauver(); });
  $('gyr').disabled = !direct; $('gyr').checked = S.gyro !== false;
  $('gyr').addEventListener('change', (/** @type {any} */ e) => { S.gyro = e.target.checked; sauver(); });
  $('btnCacheClr').addEventListener('click', async () => {
    if (!confirm('Supprimer les données mémorisées de la v2 (relief, lieux, monuments) ? Les réglages sont conservés.')) return;
    try { for (const k of await caches.keys()) if (k.startsWith(PREFIXE_CACHE)) await caches.delete(k); } catch (e) { journal.erreur('page', 'suppression des caches', e); }
    for (const n of stockage.noms()) if (n !== 'reglages' && n !== 'drapeaux') stockage.supprimer(n);
    note('Cache vidé : rechargez la page.');
  });
  $('verInfo').textContent = VERSION_V2;
  installerDiagnostic(c, { analyse: vis.analyse, calage });
  installerPhoto(c, calage);
  const gestes = installerGestes(c, calage);
  installerDeclencheur(c);

  // ---------- boucle d'affichage : 30 images/s au plus ----------
  let derniere = 0;
  if (direct) setInterval(() => { // trace du cap : un saut du cap AFFICHÉ de plus de 15° en 1 s sans geste de l'utilisateur est journalisé avec toutes les mesures
    const t = Date.now(), m = mesuresFusion(fusion, t), cap = pose().capDeg, avant = echantillons[echantillons.length - 1];
    echantillons.push({ t, cap, boussole: m.capBoussole, gyro: m.capGyroscope, repere: m.reperGyroscope, headOff: S.headOff, pitchOff: S.pitchOff });
    if (echantillons.length > 600) echantillons.shift();
    if (avant && !gestes.enGeste() && Math.abs(((cap - avant.cap + 540) % 360) - 180) > 15) journal.avert('cap', `saut du cap affiché : ${avant.cap.toFixed(0)}° → ${cap.toFixed(0)}° en ${Math.round((t - avant.t) / 1000)} s`, { avant, maintenant: echantillons[echantillons.length - 1], mesures: m });
  }, 1000);
  function image(/** @type {number} */ t) {
    requestAnimationFrame(image);
    if (t - derniere < 33) return;
    derniere = t;
    dessinerImage();
  }
  function dessinerImage() {
    if (S.photoVis === true && imageSource() && !document.hidden && Date.now() - vis.analyse.t > PERIODE_ANALYSE_MS) { vis.analyse.t = Date.now(); try { vis.analyserCiel(); } catch (e) { journal.erreur('vision', 'analyse du ciel', e); } }
    const d = app.donnees(), e = app.etat();
    oeil.synchroOeil();
    const po = pose(), maintenant = Date.now(), cam = entree ? entree.etat() : null;
    if (direct) app.actualiserMobiles(maintenant);
    const vue = { largeurPx: ps.W, hauteurPx: ps.H, capDeg: po.capDeg, inclinaisonDeg: po.inclinaisonDeg, roulisDeg: po.roulisDeg, champDeg: vFov() };
    const r = composerScene({ vue, reglages: S, donnees: d.pos ? d : null, memoires, maintenantMs: maintenant,
      ecran: { reservations: obstaclesInterface(), safeT, safeB: parseFloat(css.getPropertyValue('--safe-b')) || 0, mesurerTexte, familles },
      etat: { photo: !!ps.photoMode, utcMs: ps.photoMode ? ps.photoMode.photo.utc : direct ? maintenant : null, capteur: direct ? fusion.capteur : false, erreurCamera: cam ? cam.erreurCamera : '', precisionM: cam ? cam.precisionM : 0,
        chargement: e.chargementLieux, source: e.source, etatRelief: e.etatRelief, messageAir: e.messageAir, messageSea: e.messageSea } });
    ctx.setTransform(ps.dpr, 0, 0, ps.dpr, 0, 0); ctx.clearRect(0, 0, ps.W, ps.H);
    ctx.save(); avecRoulis(ctx, vue, () => dessiner(ctx, r.scene)); ctx.restore(); dessiner(ctx, r.ecran);
    ps.dernierBilan = r.bilan;
    $('status').textContent = ps.photoMode || direct ? (direct && cam && cam.gpsErreur && !d.pos ? cam.gpsErreur : r.bilan.statut) : 'Ouvrez une photo';
    if (direct) { const c = $('calib'); if (S.headOff || S.pitchOff) { c.style.display = 'block'; c.innerHTML = `cap ${S.headOff > 0 ? '+' : ''}${S.headOff.toFixed(0)}° · horizon ${S.pitchOff > 0 ? '+' : ''}${S.pitchOff.toFixed(0)}°<b>remettre</b>`; } else c.style.display = 'none'; }
    const b = $('eyeBadge'), n = r.bilan.badge; b.textContent = n ? '+' + n : ''; b.style.display = n ? 'block' : 'none';
    const pc = $('photoChip');
    if (ps.photoMode) { const dd = ((S.headOff - ps.photoMode.photo.capDeg + 540) % 360) - 180; pc.innerHTML = `📷 photo${ps.photoMode.photo.date ? ' du ' + ps.photoMode.photo.date.slice(0, 10).replace(/:/g, '-') : ''} · cap ${ps.photoMode.photo.direction} → <b>${Math.round(S.headOff)}°</b> (${dd >= 0 ? '+' : ''}${dd.toFixed(1)}°) · horizon ${S.pitchOff >= 0 ? '+' : ''}${S.pitchOff.toFixed(1)}° · champ ${S.camFov}° · <u>quitter</u>`; }
    const fc = $('filt'); if (S.filter) { fc.style.display = 'block'; fc.textContent = `filtre : ${S.filter.replace(/[<&]/g, '')}`; } else fc.style.display = 'none';
    $('btnFind').classList.toggle('on', !!S.filter);
  }

  redimensionner(); synchroniser(); $('photoBg').hidden = true; $('photoChip').hidden = true;
  if (!direct) { const simu = simulee() ? lirePositionTexte(S.simPos) : null; if (simu) app.definirPosition(simu); }
  journal.info('page', `page ${direct ? 'direct' : 'photo'} ouverte (${VERSION_V2})`);
  /** @type {any} */ (window).__vh2 = { S, app, memoires, photo: () => ps.photoMode, vFov, analyserCiel: vis.analyserCiel, analyse: vis.analyse, evaluerSoleil: calage.evaluerSoleil, evaluerAuto: calage.evaluerAuto, calerAuto: calage.calerAuto, evaluerPointage: calage.evaluerPointage, evaluerLune: calage.evaluerLune, toucherEchelle: calage.toucherEchelle, synchroOeil: oeil.synchroOeil, definirPermutation: calage.definirPermutation, definirOrdreAuto: calage.definirOrdreAuto, carnet, lancerBanc: calage.lancerBanc, fusion, entree, pose, rendreImage: dessinerImage, bilan: () => ps.dernierBilan, ctx };
  requestAnimationFrame(image);
}

