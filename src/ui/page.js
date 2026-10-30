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
import { analyserPhoto, texteInfoPhoto, lirePositionTexte } from '../entrees/photo.js';
import { champAffiche } from '../rendu/projection.js';
import { avecRoulis, dessiner } from '../rendu/canvas.js';
import { RAD } from '../noyau/constantes.js';
import { creerFusion, poseCapteurs, noterCalage, etatFusion, mesuresFusion, gyroActif } from '../entrees/capteurs.js';
import { creerEntreeDirecte } from '../entrees/direct.js';
import { lirePixelsRecadres } from '../vision/lire-pixels.js';
import { observerCiel, PERIODE_ANALYSE_MS, LARGEUR_ANALYSE_PX } from '../vision/silhouette-ciel.js';
import { calerSurSoleil } from '../calage/soleil.js';
import { calerAutomatiquement } from '../calage/auto.js';
import { monumentsPourCalage, reperesPourCalage } from '../calage/reperes.js';
import { luminance } from '../calage/horizon.js';
import { villeDense } from '../scene/liste-affichage.js';
import { pointer } from '../calage/pointage.js';
import { positionSoleil, positionLune } from '../noyau/astro.js';
import { ecartAngle } from '../noyau/maths.js';
import { correctionDepuisGps } from '../scene/hauteur-oeil.js';
import { creerCarnet } from '../app/carnet.js';
import { creerMesure, ecartAppris, resumeCarnet, sourceAuto } from '../calage/carnet.js';
import { executerBanc, pourquoiIgnore, texteSynthese } from '../calage/banc.js';
import { nomMonument, nomsDeLieux } from '../calques/monuments.js';

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
  /** @type {null | {img: HTMLImageElement, w: number, h: number, url: string, backup: {headOff: number, pitchOff: number, camFov: number}, photo: import('../entrees/photo.js').ReglagesPhoto}} */
  let photoMode = null;
  const sauver = () => ecrireReglages(stockage, S, photoMode ? photoMode.backup : null);
  const relais = String((/** @type {any} */ (window).APP_CONFIG || {}).relay || '');
  const app = creerApplication({ reglages: () => S, journal, stockage, relais, urlWorkerMasque: new URL('../workers/masque-relief.js', import.meta.url), quandChange: () => {} });
  app.definirMode(mode);
  const fusion = creerFusion();
  const carnet = creerCarnet({ stockage, journal, relais, reseau: app.reseau }); carnet.demarrer();

  const video = /** @type {HTMLVideoElement | null} */ (document.getElementById('cam'));
  const simulee = () => S.simOn && !!lirePositionTexte(S.simPos);
  const entree = direct && video ? creerEntreeDirecte({ video, fusion, journal, positionSimulee: simulee, surPosition: (p) => app.definirPosition({ lat: p.lat, lon: p.lon }),
    surRetourBoussole: (m) => { dernierRetour = { t: Date.now(), m, headOff: S.headOff, pitchOff: S.pitchOff }; } }) : null;
  /** Dernier « retour à la boussole » : instant, mesures de la fusion et calage au moment du saut (diagnostic). @type {null | {t: number, m: ReturnType<typeof mesuresFusion>, headOff: number, pitchOff: number}} */
  let dernierRetour = null;
  /** Échantillons du cap (1 par seconde, 10 min) : cap affiché, boussole, gyroscope, repère, calage — pour comprendre un décrochage. @type {{t: number, cap: number, boussole: number | null, gyro: number | null, repere: number | null, headOff: number, pitchOff: number}[]} */
  const echantillons = [];
  const ov = /** @type {HTMLCanvasElement} */ ($('ov')), ctx = /** @type {CanvasRenderingContext2D} */ (ov.getContext('2d'));
  const css = getComputedStyle(document.body), familles = { affichage: css.getPropertyValue('--display'), mono: css.getPropertyValue('--mono') };
  let W = 0, H = 0, dpr = 1, safeT = 0;
  const memoires = { placement: new Map(), lignes: new Map(), choixBateaux: { ids: null }, calageMonuments: new Map(), analyseT: /** @type {number | null} */ (null) };
  const mesurerTexte = (/** @type {string} */ police, /** @type {string} */ t) => { ctx.font = police; return ctx.measureText(t).width; };

  function redimensionner() {
    dpr = Math.min(window.devicePixelRatio || 1, 3); W = window.innerWidth; H = window.innerHeight;
    ov.width = Math.round(W * dpr); ov.height = Math.round(H * dpr); safeT = $('safe').getBoundingClientRect().height || 0; obstaclesT = 0;
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
  const fluxImage = () => (photoMode ? { largeurPx: photoMode.w, hauteurPx: photoMode.h } : entree ? entree.flux() : null);
  const vFov = () => champAffiche(S.camFov, { largeurPx: W, hauteurPx: H }, fluxImage());
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
    ['sky', (s) => s.skyline, (s, v) => { s.skyline = v; }], ['crs', (s) => s.cross, (s, v) => { s.cross = v; }], ['rel', (s) => s.relief, (s, v) => { s.relief = v; if (v) s.calculRelief = true; }, 'terrain'], ['relc', (s) => s.calculRelief !== false, (s, v) => { s.calculRelief = v; if (!v) s.relief = false; }, 'terrain'],
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
  let minuteurOeil = 0;
  /** Corrige la hauteur d'œil (curseur des réglages ou de la puce) : libellés tout de suite, relief recalculé au relâchement (400 ms sans mouvement). @param {number} m */
  const regleOeil = (m) => { S.obsHeight = m; synchroniser(); clearTimeout(minuteurOeil); minuteurOeil = window.setTimeout(() => { sauver(); app.corrigerHauteurOeil(S.obsHeight); }, 400); };
  $('obsH').addEventListener('input', (/** @type {any} */ e) => regleOeil(+e.target.value));
  // puce « œil » : la correction appliquée à l'altitude estimée (« œil +2 m ») ; un toucher ouvre le détail (sol, source, altitude de l'œil) et le curseur de correction
  const fmtOeil = (/** @type {number} */ v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v) + ' m';
  let minuteurPopOeil = 0; const refermerPopOeil = () => { clearTimeout(minuteurPopOeil); minuteurPopOeil = window.setTimeout(() => { $('eyePop').hidden = true; }, 6000); };
  $('eyeChip').addEventListener('click', () => { const p = $('eyePop'); p.hidden = !p.hidden; if (!p.hidden) refermerPopOeil(); });
  $('eyeQ').addEventListener('input', (/** @type {any} */ e) => { regleOeil(+e.target.value); refermerPopOeil(); });
  // Réestimer : correction remise à zéro, sol relu dans le relief ; Altitude GPS (direct) : la correction qui amène l'œil à l'altitude GPS du téléphone, si elle est assez précise
  $('eyeRe').addEventListener('click', () => { regleOeil(0); app.recharger({ terrain: true }); note('Hauteur d’œil réestimée d’après le relief', 4000); refermerPopOeil(); });
  $('eyeGps').addEventListener('click', () => {
    const t = /** @type {any} */ (app.donnees().terrain), g = entree ? entree.etat() : null, c = t && g ? correctionDepuisGps(g.altitudeM, g.precisionAltM, t.solM) : null;
    if (c === null) { note('Altitude GPS absente ou trop imprécise', 4000); return; }
    regleOeil(c); note(`Hauteur d’œil recalée sur l’altitude GPS (${Math.round(/** @type {number} */ (g && g.altitudeM))} m) : correction ${fmtOeil(c)}`, 5000); refermerPopOeil();
  });
  let derniereOeil = '';
  /** Met à jour la puce « œil », son détail et la ligne du réglage d'après le relief calculé ; sans relief, la puce disparaît. */
  function synchroOeil() {
    const t = /** @type {any} */ (app.donnees().terrain), gps = entree ? entree.etat() : null, gpsM = gps && gps.altitudeM !== null && gps.altitudeM !== undefined ? Math.round(gps.altitudeM) : null;
    const sansRelief = S.calculRelief === false || !t || t.solM === undefined, etatRelief = app.etat().etatRelief;
    const vue = sansRelief ? `sans|${S.calculRelief === false}|${etatRelief}|${S.obsHeight}` : `${t.solM}|${t.origine}|${t.h0}|${S.obsHeight}|${gpsM}|${gps && gps.precisionAltM}`;
    if (vue === derniereOeil) return; derniereOeil = vue;
    const chip = $('eyeChip'); chip.hidden = false; // la puce est toujours là : sans relief elle l'explique, le curseur reste utilisable (la correction s'appliquera dès que le relief sera calculé)
    if (sansRelief) {
      const raisonOeil = S.calculRelief === false ? 'relief désactivé (Réglages › Calculer le relief)' : etatRelief === 'indispo' ? 'relief indisponible (réseau ?)' : 'relief en cours de calcul';
      const texte = `Sol inconnu : ${raisonOeil} · correction ${fmtOeil(S.obsHeight)} (appliquée dès que le relief est calculé)`;
      chip.textContent = `œil ${S.obsHeight ? fmtOeil(S.obsHeight) : '?'}`; $('eyePopT').textContent = texte; $('eyeQ').value = String(S.obsHeight); $('eyeGps').hidden = true; $('obsHInfo').textContent = texte; return;
    }
    const gpsOk = correctionDepuisGps(gps && gps.altitudeM, gps && gps.precisionAltM, t.solM) !== null;
    $('eyeGps').hidden = !gpsOk;
    const detail = `Sol estimé ${Math.round(t.solM)} m (${t.origine}) · correction ${fmtOeil(S.obsHeight)} → œil à ${Math.round(t.h0)} m${gpsM !== null ? ` · altitude GPS ${gpsM} m${gps && gps.precisionAltM ? ` (±${Math.round(gps.precisionAltM)})` : ''}${gpsOk ? '' : ' (trop imprécise)'}` : ''}`;
    chip.textContent = `œil ${fmtOeil(S.obsHeight)}`; $('eyePopT').textContent = detail; $('eyeQ').value = String(S.obsHeight); $('obsHInfo').textContent = detail;
  }
  $('floorN').addEventListener('change', (/** @type {any} */ e) => { const m = Math.round((+e.target.value || 0) * 3.2); S.obsHeight = Math.min(250, m); synchroniser(); sauver(); app.corrigerHauteurOeil(S.obsHeight); });
  $('flt').addEventListener('input', (/** @type {any} */ e) => { S.filter = e.target.value; });
  $('simPos').addEventListener('change', (/** @type {any} */ e) => { S.simPos = e.target.value; sauver(); });
  $('reset').addEventListener('click', () => { S.headOff = 0; S.pitchOff = 0; sauver(); note('Calage remis à zéro'); });
  $('btnReload').addEventListener('click', () => { memoires.placement.clear(); app.recharger({ lieux: true, terrain: true, monuments: true, telecom: true, reperes: true }); note('Rechargement des lieux et du relief…'); });
  $('btnSky').addEventListener('click', () => { app.recharger({ terrain: true }); note('Relief recalculé'); });
  /** Vue épurée : en photo rejouée, le plein écran masque bandeau de la photo, état, rayon, œil et aide ; leur place revient aux noms. Hors photo, rien ne change. */
  const syncEpure = () => document.body.classList.toggle('clean', !!photoMode && !!document.fullscreenElement);
  document.addEventListener('fullscreenchange', () => { syncEpure(); setTimeout(redimensionner, 120); });
  $('btnFs').addEventListener('click', () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => {}); });
  $('calib').addEventListener('click', () => { S.headOff = 0; S.pitchOff = 0; sauver(); note('Calage remis à zéro'); });
  // ---------- visibilité d'après la photo : silhouette du ciel lue sur l'image, rafraîchie toutes les 3 s ----------
  /** @type {{t: number, ms: number, derniere: null | {ok: boolean, skyFrac: number, cols: unknown[], t: number}}} */
  const analyse = { t: 0, ms: 0, derniere: null };
  /** Lit l'image, cherche la limite du ciel et la publie (datée, avec la pose du moment : l'analyse n'est valable que pour cette pose). */
  function analyserCiel() {
    const src = imageSource(); if (!src) return;
    const t0 = performance.now(), po = pose(), fh = (W / 2) / Math.tan(vFov() / 2 * RAD), px = lirePixelsRecadres(src, LARGEUR_ANALYSE_PX, { largeurPx: W, hauteurPx: H });
    if (!px) return;
    const r = observerCiel(px, { ecran: { largeurPx: W, hauteurPx: H }, pose: po, focalePx: fh });
    analyse.ms = performance.now() - t0;
    const a = { ...r, t: Date.now(), heading: po.capDeg, pitch: po.inclinaisonDeg, fh };
    analyse.derniere = a; app.definirAnalysePhoto(a);
  }
  // ---------- calage : sur le soleil (bouton cible) et par pointage (bouton réticule) ----------
  /** Image dont on lit les pixels : la photo, ou le flux de la caméra une fois prêt. */
  const imageSource = () => (photoMode ? photoMode.img : video && entree && entree.flux() ? video : null);
  /** Le soleil à l'instant de la prise de vue (photo) ou maintenant (direct). */
  const soleilMaintenant = () => { const d = app.donnees(), t = photoMode ? photoMode.photo.utc : Date.now(); return d.pos && t ? positionSoleil(t, d.pos.lat, d.pos.lon) : null; };
  /** Applique une correction de cap et d'horizon : la boussole est mise en pause (direct), le calage mémorisé. @param {number} dh @param {number} dp */
  function appliquerCalage(dh, dp) { S.headOff += dh; S.pitchOff += dp; if (direct) noterCalage(fusion, Date.now()); sauver(); }
  let calageEnCours = false, bancEnCours = false;
  /** Consigne un calage au carnet (rien pendant le banc d'essai, ni sans position) : cap brut contre cap juste. @param {string} src @param {{h: number, p: number} | null} avant @param {Record<string, unknown>} [extra] */
  function consigner(src, avant, extra) {
    const d = app.donnees(); if (bancEnCours || !d.pos) return;
    const po = pose(), maintenant = Date.now(), cam = entree ? entree.etat() : null, so = soleilMaintenant(), ph = photoMode, ex = ph ? ph.photo.exif : null;
    const m = creerMesure({ src, avant, extra, capDeg: po.capDeg, inclinaisonDeg: po.inclinaisonDeg, headOff: S.headOff, pitchOff: S.pitchOff, camFov: S.camFov, pos: d.pos, precisionM: cam ? cam.precisionM : null, soleil: so,
      utcPhotoMs: ph ? ph.photo.utc : null, maintenantMs: maintenant, appareil: carnet.appareil, modele: carnet.modele(), ua: navigator.userAgent || '', gyro: direct && gyroActif(fusion, S, maintenant),
      photo: ph ? { make: (ex && ex.make) || '', model: (ex && ex.model) || '', orient: ex ? ex.orient : null, dir: ex && ex.dir !== undefined ? ex.dir : null, dirRef: ex && ex.dirRef ? ex.dirRef : null, dirCorr: ph.photo.correctionDeg || 0, w: ph.w, h: ph.h } : null,
      secteursMag: fusion.magBins.filter(Boolean).map((q) => /** @type {{v: number}} */ (q).v), retoursBoussole: fusion.gyroResets });
    if (m) carnet.consigner(m);
  }
  /** Écart appris pour cet appareil, ici (calage/carnet.js). */
  const apprisIci = () => { const d = app.donnees(), po = pose(); return ecartAppris(carnet.lire().mesures, { pos: d.pos, capDeg: po.capDeg, headOff: S.headOff, appareil: carnet.appareil, maintenantMs: Date.now() }); };
  /** La lune à l'instant de la prise de vue (photo) ou maintenant (direct). */
  const luneMaintenant = () => { const d = app.donnees(), t = photoMode ? photoMode.photo.utc : Date.now(); return d.pos && t ? positionLune(t, d.pos.lat, d.pos.lon) : null; };
  /** Cherche la lune dans l'image SANS rien appliquer (de nuit : même détection que le soleil, autour de sa position calculée). */
  function evaluerLune() {
    const src = imageSource(), d = app.donnees();
    return calerSurSoleil({ pos: d.pos, soleil: luneMaintenant(), astre: 'lune', pose: pose(), champDeg: vFov(), ecran: { largeurPx: W, hauteurPx: H }, large: !!(photoMode && photoMode.photo.peuFiable),
      lirePixels: (cw) => lirePixelsRecadres(src, cw, { largeurPx: W, hauteurPx: H }) });
  }
  /** Cherche le disque du soleil dans l'image SANS rien appliquer (le calage et les tests de parité s'en servent). */
  function evaluerSoleil() {
    const src = imageSource(), d = app.donnees();
    return calerSurSoleil({ pos: d.pos, soleil: soleilMaintenant(), pose: pose(), champDeg: vFov(), ecran: { largeurPx: W, hauteurPx: H }, large: !!(photoMode && photoMode.photo.peuFiable),
      lirePixels: (cw) => lirePixelsRecadres(src, cw, { largeurPx: W, hauteurPx: H }) });
  }
  /** Dimensions de l'écran pour les lectures d'image. */
  const ecranPx = () => ({ largeurPx: W, hauteurPx: H });
  /** « Caler auto » SANS rien appliquer : soleil, puis relief, puis repères (calage/auto.js). Sert au calage et aux tests de parité. @returns {Promise<import('../calage/auto.js').ResultatAuto>} */
  /** Test de permutation des repères (défaut oui) ; les tests de parité avec la v1 (j), qui n'en a pas, l'éteignent. */
  let permutationReperes = true, ordreAuto = /** @type {'relief-soleil' | 'soleil-relief' | null} */ (null);
  function evaluerAuto(/** @type {{permutation?: boolean, ordre?: 'relief-soleil' | 'soleil-relief'}} */ opts = {}) {
    const src = imageSource(), d = app.donnees();
    return calerAutomatiquement({ pos: d.pos, pose: pose(), camFov: S.camFov, ecran: ecranPx(), champAffiche: (cam) => champAffiche(cam, ecranPx(), fluxImage()), photo: !!photoMode, permutation: opts.permutation ?? permutationReperes, ordre: opts.ordre ?? ordreAuto ?? (S.autoRelief ? 'relief-soleil' : 'soleil-relief'),
      villeDense: villeDense({ pos: d.pos, cities: /** @type {any} */ (d.lieux), monuments: /** @type {any} */ (d.monuments), batiments: /** @type {any} */ (d.reperes) }), avecRelief: S.relief && !!d.terrain, correctionOeilM: S.obsHeight || 0,
      attendreRelief: () => app.attendreRelief(8000), relief: () => { const t = app.donnees().terrain; return t ? t.pm : null; }, soleil: () => evaluerSoleil(), lune: () => evaluerLune(),
      lireLuminance: (cw) => { const px = lirePixelsRecadres(src, cw, ecranPx()); return px ? luminance(px) : null; },
      lireSilhouette: (po, fh) => { const px = lirePixelsRecadres(src, LARGEUR_ANALYSE_PX, ecranPx()); return px ? observerCiel(px, { ecran: ecranPx(), pose: po, focalePx: fh }) : null; },
      liste: d.pos ? monumentsPourCalage({ monuments: d.monuments, elements: (dernierBilan && dernierBilan.monuments) || [], pos: d.pos, terrain: d.terrain }) : [] }); // la v1 cherche ses repères dans tout `monumentSites`, pas dans la liste affichée
  }
  /** « Caler auto » : applique le résultat (cap, horizon, champ), met la boussole en pause (direct), mémorise. @returns {Promise<string>} le message */
  async function calerAuto() {
    if (calageEnCours) return 'calage deja en cours';
    if (!imageSource()) return 'caméra indisponible';
    if (!app.donnees().pos) return 'GPS indisponible';
    calageEnCours = true;
    try {
      const r = await evaluerAuto();
      if (r.applique) {
        const avant = { h: S.headOff, p: S.pitchOff };
        S.headOff += r.dh; S.pitchOff += r.dp; if (r.champ !== null) S.camFov = r.champ;
        if (direct) noterCalage(fusion, Date.now());
        sauver(); synchroniser(); journal.info('calage', r.message);
        consigner(sourceAuto(r.source), avant, { msg: r.message.slice(0, 120) });
      }
      return r.message;
    } finally { calageEnCours = false; }
  }
  $('btnAlign').addEventListener('click', async () => { const b = $('btnAlign'); b.classList.add('on'); note('Calage en cours…', 20000); const m = await calerAuto(); note(m, 6000); b.classList.remove('on'); });
  $('btnAutoAlign').addEventListener('click', async () => {
    const b = $('btnAutoAlign'), orig = b.textContent; b.disabled = true; b.textContent = 'Analyse…';
    const m = await calerAuto(); b.textContent = m.length > 34 ? m.slice(0, 32) + '…' : m; note(m);
    setTimeout(() => { b.disabled = false; b.textContent = orig; }, 3500);
  });
  /** Mode pointage : le prochain appui bref sur l'image est « voici, à cet endroit, un repère que je reconnais ». */
  let modePointage = false;
  const definirModePointage = (/** @type {boolean} */ v) => { modePointage = v; $('btnPoint').classList.toggle('on', v); if (v) note('Touchez un repère connu à l’écran (rocher, île, sommet…)', 8000); };
  $('btnPoint').addEventListener('click', () => definirModePointage(!modePointage));
  /** @param {number} x @param {number} y */
  function evaluerPointage(x, y) {
    const d = app.donnees(), lieux = nomsDeLieux(/** @type {any} */ (d.lieux));
    return pointer({ toucher: { x, y }, pose: pose(), champDeg: vFov(), ecran: { largeurPx: W, hauteurPx: H }, liste: /** @type {any} */ ((dernierBilan && dernierBilan.liste) || []), soleil: soleilMaintenant(), avecRelief: S.relief && !!d.terrain,
      correctionOeilM: S.obsHeight || 0, nomMonument: (c) => nomMonument(c, lieux) });
  }
  /** @param {number} x @param {number} y */
  function pointerSur(x, y) {
    const r = evaluerPointage(x, y);
    if (r.aucun) { note(r.note, 4500); return; }
    const avant = { h: S.headOff, p: S.pitchOff };
    appliquerCalage(r.correctionCapDeg, r.correctionHorizonDeg || 0);
    consigner(r.source === 'soleil' ? 'soleil touché' : r.source === 'repere' ? 'repère touché' : 'lieu touché', avant, { ref: r.nom, refDist: r.distKm, refHeight: r.hauteurConnueM !== null ? Math.round(r.hauteurConnueM) : null });
    journal.info('calage', r.note);
    note(r.note, 7000);
  }
  // ---------- écart appris et banc d'essai ----------
  $('btnLearned').addEventListener('click', () => {
    if (photoMode) { note('L’écart appris corrige les capteurs : il se reprend en direct (page « Réalité augmentée »).', 6000); return; }
    const L = apprisIci();
    if (!L) { note('pas encore d’écart appris : calez une première fois ici (soleil, repère, glisser)'); return; }
    S.headOff = L.off; sauver(); if (direct) noterCalage(fusion, Date.now());
    note(`écart appris repris : ${L.off >= 0 ? '+' : ''}${L.off.toFixed(1)}° (${L.comment})`, 6000);
  });
  const signe = (/** @type {number} */ v) => (v >= 0 ? '+' : '') + v.toFixed(1) + '°';
  /** Banc d'essai (photo rejouée) : dix départs décalés, « Caler auto » à chaque fois, verdict par départ ; le résultat s'affiche dans le diagnostic. */
  async function lancerBanc() {
    if (!photoMode || bancEnCours) return;
    const ph = photoMode, b = $f('btnBench'); b.disabled = true; bancEnCours = true;
    const reference = { h: S.headOff, p: S.pitchOff, c: S.camFov }, info = $f('photoInfo');
    try {
      const sol = evaluerSoleil(); // le soleil, s'il est visible, donne une référence indépendante du calage à la main
      const po = pose(), d = app.donnees(), fh0 = (W / 2) / Math.tan(vFov() / 2 * RAD), avecRelief = S.relief && !!d.terrain;
      const liste = d.pos ? monumentsPourCalage({ monuments: d.monuments, elements: (dernierBilan && dernierBilan.monuments) || [], pos: d.pos, terrain: d.terrain }) : [];
      const utilisables = reperesPourCalage(/** @type {any} */ ({ heading: po.capDeg, fh: fh0 }), liste, { largeurPx: W }, { avecRelief, correctionOeilM: S.obsHeight || 0 }).map((o) => o.c);
      const dansChamp = liste.filter((c) => c.cat !== 'equip' && c.dist !== null && c.dist !== undefined && Math.abs(ecartAngle(/** @type {number} */ (c.brg) - po.capDeg)) < vFov() / 2);
      const res = await executerBanc({ reference,
        appliquer: (h, p, c) => { S.headOff = h; S.pitchOff = p; S.camFov = c; synchroniser(); dessinerImage(); dessinerImage(); },
        calerAuto, lireEtat: () => ({ h: S.headOff, p: S.pitchOff, c: S.camFov }),
        surDepart: (dh, dc) => { info.textContent = `banc d'essai : départ ${dh >= 0 ? '+' : ''}${dh}° / champ ${dc >= 0 ? '+' : ''}${dc}°…`; } });
      const synth = texteSynthese(res.synthese, res.lignes.length), col = { 'réussi': '#6FCF97', 'refusé': '#F2C14E', 'faux': '#E85A5A' };
      info.textContent = 'banc d\'essai : ' + synth; journal[res.synthese.faux ? 'avert' : 'info']('banc', synth);
      const dKm = (/** @type {number} */ x) => (x < 10 ? x.toFixed(1) : String(Math.round(x)));
      $('dbgTitle').textContent = 'Banc d\'essai du calage';
      $('dbgBody').innerHTML = `<div class="dbgsec">Référence (calage à la main)</div><div class="dbgline">cap ${reference.h.toFixed(1)}° · horizon ${signe(reference.p)} · champ ${reference.c}° · direction de la photo ${echap(ph.photo.direction)} → écart ${signe(ecartAngle(reference.h - ph.photo.capDeg))}</div>`
        + `<div class="dbgsec">Soleil (référence indépendante)</div><div class="dbgline">${sol.ok ? `soleil calculé à ${sol.soleil.azDeg.toFixed(1)}° / ${sol.soleil.elDeg.toFixed(1)}° : d'après lui, votre calage à la main est décalé de <b>${signe(-sol.dh)}</b> en cap et de <b>${signe(-sol.dp)}</b> en horizon` : 'non utilisable : ' + echap(sol.message)}</div>`
        + `<div class="dbgsec">Résultat : ${synth}</div><table style="width:100%;border-collapse:collapse;font:12px/1.4 var(--mono)"><tr style="color:#E0A526"><td>départ</td><td>reste</td><td>résultat</td></tr>`
        + res.lignes.map((r) => `<tr style="border-top:1px solid rgba(243,233,210,.15)"><td>cap ${signe(r.dh)}<br>champ ${signe(r.dc)}</td><td>cap ${signe(r.eh)}<br>champ ${signe(r.ec)}</td><td><b style="color:${col[r.verdict]}">${r.verdict}</b><br><span style="opacity:.7">${echap(r.message)}</span></td></tr>`).join('') + '</table>'
        + `<div class="dbgsec">Repères utilisables par le calage sur cette vue (${utilisables.length})</div><div class="dbgline">${utilisables.map((c) => `${echap(c.name)} (${dKm(/** @type {number} */ (c.dist))} km)`).join(' · ') || 'aucun'}</div>`
        + `<div class="dbgsec">Monuments dans le champ ignorés par le calage</div><div class="dbgline">${dansChamp.filter((c) => !utilisables.includes(c)).map((c) => `${echap(c.name)} : ${pourquoiIgnore(/** @type {any} */ (c), avecRelief) || '—'}`).join('<br>') || 'aucun'}</div>`;
      $('dbg').classList.add('open');
      banc.dernier = { ...res, soleil: sol.ok ? { dh: sol.dh, dp: sol.dp } : null, utilisables: utilisables.map((c) => c.name), ignores: dansChamp.filter((c) => !utilisables.includes(c)).map((c) => [c.name, pourquoiIgnore(/** @type {any} */ (c), avecRelief)]) };
    } finally { bancEnCours = false; $('fov').value = String(S.camFov); synchroniser(); b.disabled = !photoMode; }
  }
  /** @type {{dernier: any}} */
  const banc = { dernier: null };
  $f('btnBench').addEventListener('click', () => { $('sheet').classList.remove('open'); lancerBanc(); });
  const bascule = (/** @type {string} */ id) => $(id).classList.toggle('open');
  $('btnLayers').addEventListener('click', () => { bascule('layers'); $('btnLayers').setAttribute('aria-expanded', String($('layers').classList.contains('open'))); });
  $('btnSet').addEventListener('click', () => $('sheet').classList.add('open')); $('btnClose').addEventListener('click', () => $('sheet').classList.remove('open'));
  $('btnFind').addEventListener('click', () => { $('sheet').classList.add('open'); setTimeout(() => $('flt').focus(), 300); });
  for (const id of ['btnZoneDL', 'btnZoneDel']) { const b = $(id); b.disabled = true; b.classList.add('etape10'); }
  $('phv').checked = S.photoVis === true;
  $('phv').addEventListener('change', (/** @type {any} */ e) => { S.photoVis = e.target.checked; app.definirAnalysePhoto(null); analyse.derniere = null; sauver(); });
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

  // ---------- diagnostic ----------
  const echap = (/** @type {string} */ t) => String(t).replace(/[<&>]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] || c));
  /** La raison d'un échec, quand le journal l'a gardée : « — HTTP 429 », « — échec réseau : Failed to fetch »… @param {unknown} d */
  const raison = (d) => {
    if (!d) return '';
    const o = /** @type {any} */ (d), t = typeof d === 'string' ? d : o.message || o.nom || JSON.stringify(d);
    return ` <span style="color:var(--ochre)">— ${echap(String(t).slice(0, 200))}</span>`;
  };
  $('btnDbg').addEventListener('click', () => {
    $('sheet').classList.remove('open');
    const e = app.etat(), d = app.donnees();
    const lignes = [`version ${VERSION_V2}`, `réglages d'affichage : ${reglagesRepris ? 'repris de la v1 au premier lancement' : 'propres à la v2'} · ligne de relief ${S.skyline ? 'affichée' : 'éteinte (Réglages › Ligne d\'horizon du relief)'}`, `position ${d.pos ? d.pos.lat.toFixed(5) + ', ' + d.pos.lon.toFixed(5) : '—'}`, `lieux : ${e.lieux} (${echap(e.source)}) — ${e.chargementLieux ? 'chargement en cours depuis ' + Math.round(e.depuisLieuxMs / 1000) + ' s' : 'chargement terminé'} · rayon ${S.radius} km`,
      ...e.sourcesLieux.map((s) => `&nbsp;&nbsp;${echap(s.nom)} : ${echap(s.etat)}${s.n !== undefined ? ' · ' + s.n + ' lieux' : ''}${s.raison ? ' · ' + echap(s.raison.slice(0, 140)) : ''}`),
      `relief : ${S.calculRelief !== false ? echap(e.etatRelief || 'pas encore calculé') : 'désactivé (Réglages › Calculer le relief)'} · masquage par le relief ${S.relief ? 'actif' : 'éteint'}`,
      `visibilité d'après la photo : ${(() => {
        const a = analyse.derniere, liste = /** @type {any[]} */ ((dernierBilan && dernierBilan.liste) || []);
        if (S.photoVis !== true) return 'désactivée (Réglages)';
        if (!imageSource()) return 'caméra indisponible : règles estimées seulement';
        if (!a) return 'en attente de la première image';
        if (!a.ok) return `ciel illisible (${Math.round((a.skyFrac || 0) * 100)} % du haut de l'image) : règles estimées seulement · analyse ${analyse.ms.toFixed(1)} ms`;
        return `silhouette lue il y a ${Math.round((Date.now() - a.t) / 1000)} s sur ${a.cols.length} colonnes (ciel ${Math.round(a.skyFrac * 100)} % du haut de l'image) · ${liste.filter((m) => m.kind === 'monument' && m.photo === true).length} monument(s) vus, ${liste.filter((m) => m.photoHid).length} cachés · analyse ${analyse.ms.toFixed(1)} ms`;
      })()}`, `monuments ${d.monuments.length} · ${echap(e.monuments)}`,
      `pylônes ${echap(e.telecom)} · repères hauts ${echap(e.reperes)}`, `relais ${relais || 'non configuré'}`, ...(direct ? [`capteurs : ${echap(etatFusion(fusion, S, Date.now()))}`, `mesures : ${(() => { const m = mesuresFusion(fusion, Date.now()), f = (/** @type {number | null} */ v) => (v === null ? '—' : v.toFixed(1) + '°'); return `boussole ${f(m.capBoussole)} · gyroscope ${f(m.capGyroscope)} · repère ${f(m.reperGyroscope)} · âge gyroscope ${m.ageGyroscopeMs === null ? '—' : Math.round(m.ageGyroscopeMs) + ' ms'} · désaccord depuis ${Math.round(m.desaccordDepuisMs)} ms${m.boussoleEnPause ? ' · boussole en pause' : ''}`; })()}`, `cap affiché ${pose().capDeg.toFixed(1)}° · calage ${S.headOff.toFixed(1)}° / ${S.pitchOff.toFixed(1)}°`,
        ...(dernierRetour ? [`dernier retour à la boussole : il y a ${Math.round((Date.now() - dernierRetour.t) / 1000)} s · boussole ${dernierRetour.m.capBoussole?.toFixed(0)}° · gyroscope ${dernierRetour.m.capGyroscope?.toFixed(0)}° · calage ${dernierRetour.headOff.toFixed(1)}°`] : []),
        `trace du cap (10 dernières secondes) : ${echantillons.slice(-10).map((x) => x.cap.toFixed(0)).join(' ')}`,
        `caméra ${entree && entree.etat().cameraOk ? 'active' : 'inactive'}${entree && entree.etat().erreurCamera ? ' · ' + echap(entree.etat().erreurCamera) : ''}`, `avions : ${echap(e.messageAir || '—')} · bateaux : ${echap(e.messageSea || '—')}`] : [])];
    $('dbgTitle').textContent = 'Diagnostic';
    const cr = resumeCarnet(carnet.lire(), { appareil: carnet.appareil, modele: carnet.modele(), appris: apprisIci() }), fd = (/** @type {number | null} */ v) => (v === null ? '—' : signe(v));
    const carnetHtml = `<div class="dbgsec">Carnet de calage</div><div class="dbgline">appareil ${echap(cr.appareil)} · ${echap(cr.modele)} · ${cr.nb} mesure(s) sur l'appareil${cr.enAttente ? ` · ${cr.enAttente} en attente d'envoi` : ''}${relais ? '' : ' · relais absent : pas d\'envoi'}</div>`
      + `<div class="dbgline">${cr.parSource.map((x) => `${echap(x.source)} : écart médian <b>${fd(x.medianeDeg)}</b> (${x.n})`).join('<br>') || 'aucune mesure : calez (glisser, toucher un repère ou le soleil, Caler auto)'}</div>`
      + `<div class="dbgline">écart appris ici : ${cr.appris ? `<b>${fd(cr.appris.off)}</b> (${echap(cr.appris.comment)})` : 'pas encore'}</div>`
      + `<div class="dbgline">${cr.dernieres.map((m) => `${new Date(m.rec).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · ${echap(m.src)} · brut ${(+m.raw).toFixed(0)}° → ${(+m.hdg).toFixed(0)}° (${fd(m.off)})${m.sun ? ` · soleil ${m.sun.az}°/${m.sun.el}°` : ''}`).join('<br>')}</div>`
      + (relais ? `<div class="dbgline"><a style="color:#F2C14E" target="_blank" rel="noopener" href="${echap(relais)}/calib.csv?dev=${echap(cr.appareil)}">mes mesures (CSV)</a> · <a style="color:#F2C14E" target="_blank" rel="noopener" href="${echap(relais)}/calib.csv">tous les appareils (CSV)</a></div>` : '');
    $('dbgBody').innerHTML = `<div class="dbgsec">État</div>${lignes.map((l) => `<div class="dbgline">${l}</div>`).join('')}${carnetHtml}<div class="dbgsec">Journal</div>`
      + `<div class="dbgsec">Mémoire de l'appareil (hit = relue, net = téléchargée, stale = périmée par défaut de réseau, fail = échec)</div>`
      + Object.entries(app.compteursCache()).map(([genre, c]) => `<div class="dbgline">${echap(genre)} : ${c.hit} hit · ${c.net} net · ${c.stale} stale · ${c.fail} fail</div>`).join('')
      + `<div class="dbgsec">Journal (le plus récent en premier)</div>`
      + journal.entrees(80).reverse().map((x) => `<div class="dbgline">${new Date(x.t).toLocaleTimeString('fr-FR')} · ${x.niveau} · ${echap(x.module)} · ${echap(x.message)}${raison(x.donnees)}</div>`).join('');
    $('dbg').classList.add('open');
  });
  $('dbgClose').addEventListener('click', () => $('dbg').classList.remove('open'));

  // ---------- photo ----------
  async function ouvrirPhoto(/** @type {File} */ f) {
    const info = $f('photoInfo'), octets = await f.arrayBuffer(), img = $('photoBg'), url = URL.createObjectURL(f);
    try { await new Promise((ok, ko) => { img.onload = ok; img.onerror = ko; img.src = url; }); } catch { URL.revokeObjectURL(url); info.textContent = 'Image illisible (format non pris en charge par le navigateur ?)'; return; }
    const w = img.naturalWidth, h = img.naturalHeight, r = analyserPhoto(octets, { largeurPx: w, hauteurPx: h, positionSimulee: S.simOn ? S.simPos : S.simPos });
    if (!r.ok) { URL.revokeObjectURL(url); info.textContent = r.raison; $('sheet').classList.add('open'); return; }
    const p = r.photo, backup = photoMode ? photoMode.backup : { headOff: S.headOff, pitchOff: S.pitchOff, camFov: S.camFov };
    if (photoMode) URL.revokeObjectURL(photoMode.url);
    photoMode = { img, w, h, url, backup, photo: p }; $f('btnBench').disabled = bancEnCours; syncEpure();
    if (p.champDeg !== null) S.camFov = p.champDeg;
    S.headOff = p.capDeg; S.pitchOff = 0; img.hidden = false; $('photoChip').hidden = false;
    memoires.placement.clear(); memoires.lignes.clear(); memoires.choixBateaux = { ids: null }; memoires.calageMonuments.clear(); memoires.analyseT = null;
    synchroniser(); $('start').style.display = 'none';
    info.textContent = texteInfoPhoto(p, S.camFov);
    journal.info('photo', `photo rejouée : ${info.textContent}`);
    app.definirPosition(p.pos, { force: true });
    note('Photo rejouée. Glissez pour corriger le cap et l’horizon, pincez pour le champ. Touchez le bandeau 📷 pour quitter.', 7000);
  }
  function quitterPhoto() {
    if (!photoMode) return;
    Object.assign(S, photoMode.backup); URL.revokeObjectURL(photoMode.url); photoMode = null; $f('btnBench').disabled = true; syncEpure();
    const img = $('photoBg'); img.hidden = true; img.removeAttribute('src'); $('photoChip').hidden = true; $f('photoInfo').textContent = '';
    synchroniser(); sauver(); $('start').style.display = '';
  }
  const choisir = () => $f('photoFile').click();
  if (direct) {
    $('go').addEventListener('click', async () => {
      $('start').style.display = 'none';
      if (entree) await entree.demarrer();
      redimensionner();
      const simu = simulee() ? lirePositionTexte(S.simPos) : null; if (simu) app.definirPosition(simu);
    });
  } else $('go').addEventListener('click', choisir);
  $f('btnPhoto').addEventListener('click', choisir); $('photoChip').addEventListener('click', quitterPhoto);
  /** Position simulée : le GPS est ignoré tant que la case est cochée ; décochée, la position revient à la prochaine mesure. */
  const appliquerSimulee = () => { const p = simulee() ? lirePositionTexte(S.simPos) : null; if (p && !photoMode) { app.definirPosition(p); note(`Position simulée : ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`); } };
  $('simOn').addEventListener('change', appliquerSimulee); $('simPos').addEventListener('change', appliquerSimulee);
  $f('photoFile').addEventListener('change', (/** @type {any} */ e) => { const f = e.target.files[0]; e.target.value = ''; if (f) ouvrirPhoto(f); });

  // ---------- glisser (cap, horizon) et pincer (champ) ----------
  /** @type {null | {x: number, y: number, h: number, p: number, moved: boolean, t: number}} */
  let drag = null;
  const ptrs = new Map();
  /** @type {null | {d0: number, t0: number}} */
  let pinch = null;
  ov.addEventListener('pointerdown', (e) => {
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); ov.setPointerCapture(e.pointerId);
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, t0: Math.tan(S.camFov / 2 * RAD) }; drag = null; return; }
    if (ptrs.size > 2) return;
    drag = { x: e.clientX, y: e.clientY, t: Date.now(), h: S.headOff, p: S.pitchOff, moved: false };
  });
  ov.addEventListener('pointermove', (e) => {
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()], r = (Math.hypot(a.x - b.x, a.y - b.y) || 1) / pinch.d0;
      S.camFov = Math.round(Math.max(20, Math.min(110, 2 * Math.atan(pinch.t0 / r) / RAD)) * 2) / 2; synchroniser(); note(`Champ de vision ${S.camFov}° (affiché ${Math.round(vFov())}°)`, 1200); return;
    }
    if (!drag) return;
    const fh = (W / 2) / Math.tan(vFov() / 2 * RAD);
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 8) drag.moved = true;
    const dh = Math.atan((e.clientX - drag.x) / fh) / RAD;
    S.headOff = direct ? drag.h - dh : (drag.h - dh + 360) % 360; S.pitchOff = drag.p + Math.atan((e.clientY - drag.y) / fh) / RAD;
  });
  ov.addEventListener('pointerup', (e) => {
    const etaitPincement = !!pinch; ptrs.delete(e.pointerId);
    if (etaitPincement) { if (ptrs.size < 2) { pinch = null; sauver(); } drag = null; return; }
    if (drag && !drag.moved && Date.now() - drag.t < 450) { S.headOff = drag.h; S.pitchOff = drag.p; if (modePointage) { definirModePointage(false); pointerSur(e.clientX, e.clientY); } } else { sauver(); if (direct && drag && drag.moved) noterCalage(fusion, Date.now()); if (drag && drag.moved && ((direct && fusion.capteur) || photoMode)) consigner('glisser', { h: drag.h, p: drag.p }); } // calage récent : la boussole ne le défait pas
    drag = null;
  });
  ov.addEventListener('pointercancel', (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; drag = null; });

  // ---------- déclencheur ----------
  /** @type {Blob | null} */ let shotBlob = null; let shotURL = '';
  $('shutter').addEventListener('click', () => {
    const fl = $('flash'); fl.style.opacity = '.9'; setTimeout(() => { fl.style.opacity = '0'; }, 60);
    const BAND = 48, c = document.createElement('canvas'); c.width = Math.round(W * dpr); c.height = Math.round((H + BAND) * dpr);
    const x = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d')); x.scale(dpr, dpr);
    if (photoMode) { const s = Math.max(W / photoMode.w, H / photoMode.h), dw = photoMode.w * s, dh = photoMode.h * s; x.save(); x.beginPath(); x.rect(0, 0, W, H); x.clip(); x.drawImage(photoMode.img, (W - dw) / 2, (H - dh) / 2, dw, dh); x.restore(); } else if (video && entree && entree.flux()) { const f = /** @type {{largeurPx: number, hauteurPx: number}} */ (entree.flux()), s = Math.max(W / f.largeurPx, H / f.hauteurPx), dw = f.largeurPx * s, dh = f.hauteurPx * s; x.save(); x.beginPath(); x.rect(0, 0, W, H); x.clip(); x.drawImage(video, (W - dw) / 2, (H - dh) / 2, dw, dh); x.restore(); } else { x.fillStyle = '#000'; x.fillRect(0, 0, W, H); }
    x.drawImage(ov, 0, 0, W, H);
    x.fillStyle = '#0E1A2B'; x.fillRect(0, H, W, BAND); x.textAlign = 'left';
    x.font = `500 11px ${familles.mono}`; x.fillStyle = 'rgba(224,165,38,.95)'; x.fillText(`${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} · cap ${Math.round(pose().capDeg)}° · Villes à l'horizon`, 12, H + 29);
    c.toBlob((b) => { shotBlob = b; if (shotURL) URL.revokeObjectURL(shotURL); if (!b) return; shotURL = URL.createObjectURL(b); $('shotImg').src = shotURL; $('shot').classList.add('open'); }, 'image/jpeg', .92);
  });
  const nomPhoto = () => 'horizon-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.jpg';
  $('shotClose').addEventListener('click', () => $('shot').classList.remove('open'));
  $('shotSave').addEventListener('click', () => { if (!shotBlob) return; const a = document.createElement('a'); a.href = shotURL; a.download = nomPhoto(); document.body.appendChild(a); a.click(); a.remove(); });
  $('shotShare').addEventListener('click', async () => { if (!shotBlob) return; const fichier = new File([shotBlob], nomPhoto(), { type: 'image/jpeg' }); try { if (navigator.canShare?.({ files: [fichier] })) await navigator.share({ files: [fichier] }); } catch { /* partage annulé */ } });

  // ---------- boucle d'affichage : 30 images/s au plus ----------
  let derniere = 0, dernierBilan = /** @type {any} */ (null);
  if (direct) setInterval(() => { // trace du cap : un saut du cap AFFICHÉ de plus de 15° en 1 s sans geste de l'utilisateur est journalisé avec toutes les mesures
    const t = Date.now(), m = mesuresFusion(fusion, t), cap = pose().capDeg, avant = echantillons[echantillons.length - 1];
    echantillons.push({ t, cap, boussole: m.capBoussole, gyro: m.capGyroscope, repere: m.reperGyroscope, headOff: S.headOff, pitchOff: S.pitchOff });
    if (echantillons.length > 600) echantillons.shift();
    if (avant && !drag && Math.abs(((cap - avant.cap + 540) % 360) - 180) > 15) journal.avert('cap', `saut du cap affiché : ${avant.cap.toFixed(0)}° → ${cap.toFixed(0)}° en ${Math.round((t - avant.t) / 1000)} s`, { avant, maintenant: echantillons[echantillons.length - 1], mesures: m });
  }, 1000);
  function image(/** @type {number} */ t) {
    requestAnimationFrame(image);
    if (t - derniere < 33) return;
    derniere = t;
    dessinerImage();
  }
  function dessinerImage() {
    if (S.photoVis === true && imageSource() && !document.hidden && Date.now() - analyse.t > PERIODE_ANALYSE_MS) { analyse.t = Date.now(); try { analyserCiel(); } catch (e) { journal.erreur('vision', 'analyse du ciel', e); } }
    const d = app.donnees(), e = app.etat();
    synchroOeil();
    const po = pose(), maintenant = Date.now(), cam = entree ? entree.etat() : null;
    if (direct) app.actualiserMobiles(maintenant);
    const vue = { largeurPx: W, hauteurPx: H, capDeg: po.capDeg, inclinaisonDeg: po.inclinaisonDeg, roulisDeg: po.roulisDeg, champDeg: vFov() };
    const r = composerScene({ vue, reglages: S, donnees: d.pos ? d : null, memoires, maintenantMs: maintenant,
      ecran: { reservations: obstaclesInterface(), safeT, safeB: parseFloat(css.getPropertyValue('--safe-b')) || 0, mesurerTexte, familles },
      etat: { photo: !!photoMode, utcMs: photoMode ? photoMode.photo.utc : direct ? maintenant : null, capteur: direct ? fusion.capteur : false, erreurCamera: cam ? cam.erreurCamera : '', precisionM: cam ? cam.precisionM : 0,
        chargement: e.chargementLieux, source: e.source, etatRelief: e.etatRelief, messageAir: e.messageAir, messageSea: e.messageSea } });
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    ctx.save(); avecRoulis(ctx, vue, () => dessiner(ctx, r.scene)); ctx.restore(); dessiner(ctx, r.ecran);
    dernierBilan = r.bilan;
    $('status').textContent = photoMode || direct ? (direct && cam && cam.gpsErreur && !d.pos ? cam.gpsErreur : r.bilan.statut) : 'Ouvrez une photo';
    if (direct) { const c = $('calib'); if (S.headOff || S.pitchOff) { c.style.display = 'block'; c.innerHTML = `cap ${S.headOff > 0 ? '+' : ''}${S.headOff.toFixed(0)}° · horizon ${S.pitchOff > 0 ? '+' : ''}${S.pitchOff.toFixed(0)}°<b>remettre</b>`; } else c.style.display = 'none'; }
    const b = $('eyeBadge'), n = r.bilan.badge; b.textContent = n ? '+' + n : ''; b.style.display = n ? 'block' : 'none';
    const pc = $('photoChip');
    if (photoMode) { const dd = ((S.headOff - photoMode.photo.capDeg + 540) % 360) - 180; pc.innerHTML = `📷 photo${photoMode.photo.date ? ' du ' + photoMode.photo.date.slice(0, 10).replace(/:/g, '-') : ''} · cap ${photoMode.photo.direction} → <b>${Math.round(S.headOff)}°</b> (${dd >= 0 ? '+' : ''}${dd.toFixed(1)}°) · horizon ${S.pitchOff >= 0 ? '+' : ''}${S.pitchOff.toFixed(1)}° · champ ${S.camFov}° · <u>quitter</u>`; }
    const fc = $('filt'); if (S.filter) { fc.style.display = 'block'; fc.textContent = `filtre : ${S.filter.replace(/[<&]/g, '')}`; } else fc.style.display = 'none';
    $('btnFind').classList.toggle('on', !!S.filter);
  }

  redimensionner(); synchroniser(); $('photoBg').hidden = true; $('photoChip').hidden = true;
  if (!direct) { const simu = simulee() ? lirePositionTexte(S.simPos) : null; if (simu) app.definirPosition(simu); }
  journal.info('page', `page ${direct ? 'direct' : 'photo'} ouverte (${VERSION_V2})`);
  /** @type {any} */ (window).__vh2 = { S, app, ouvrirPhoto, quitterPhoto, memoires, photo: () => photoMode, vFov, analyserCiel, analyse, evaluerSoleil, evaluerAuto, calerAuto, evaluerPointage, evaluerLune, synchroOeil, definirPermutation: (/** @type {boolean} */ v) => { permutationReperes = v; }, definirOrdreAuto: (/** @type {'relief-soleil' | 'soleil-relief' | null} */ v) => { ordreAuto = v; }, carnet, consigner, apprisIci, lancerBanc, banc, fusion, entree, pose, rendreImage: dessinerImage, bilan: () => dernierBilan, ctx, obstacles: obstaclesInterface };
  requestAnimationFrame(image);
}

