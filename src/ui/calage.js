// @ts-check
/**
 * Calage : soleil, lune, « Caler auto », pointage au doigt, échelle du champ, carnet, écart appris et banc d'essai.
 * Reçoit le contexte de la page (`c` : réglages, application, aides d'affichage, état partagé `ps`) ; ne lit ni n'écrit rien d'autre que ce contexte et le DOM.
 */
import { calerAutomatiquement } from '../calage/auto.js';
import { executerBanc, pourquoiIgnore, texteSynthese } from '../calage/banc.js';
import { creerMesure, ecartAppris, sourceAuto } from '../calage/carnet.js';
import { calerEchelle } from '../calage/echelle.js';
import { luminance } from '../calage/horizon.js';
import { pointer } from '../calage/pointage.js';
import { monumentsPourCalage, reperesPourCalage } from '../calage/reperes.js';
import { calerSurSoleil } from '../calage/soleil.js';
import { nomMonument, nomsDeLieux } from '../calques/monuments.js';
import { gyroActif, noterCalage } from '../entrees/capteurs.js';
import { positionLune, positionSoleil } from '../noyau/astro.js';
import { RAD } from '../noyau/constantes.js';
import { ecartAngle } from '../noyau/maths.js';
import { champAffiche } from '../rendu/projection.js';
import { villeDense } from '../scene/liste-affichage.js';
import { lirePixelsRecadres } from '../vision/lire-pixels.js';
import { LARGEUR_ANALYSE_PX, observerCiel } from '../vision/silhouette-ciel.js';
import { echap, signe } from './html.js';

/** Vitesse (m/s) au-delà de laquelle on est jugé en véhicule. */
const VITESSE_VEHICULE_MS = 3;

/** @param {import('./contexte.js').Contexte} c */
export function installerCalage(c) {
  const { S, app, journal, stockage, carnet, fusion, entree, direct, $, $f, note, sauver, synchroniser, pose, vFov, fluxImage, ecranPx, imageSource, dessinerImage, ps } = c;
  /** Le soleil à l'instant de la prise de vue (photo) ou maintenant (direct). */
  const soleilMaintenant = () => { const d = app.donnees(), t = ps.photoMode ? ps.photoMode.photo.utc : Date.now(); return d.pos && t ? positionSoleil(t, d.pos.lat, d.pos.lon) : null; };
  /** Applique une correction de cap et d'horizon : la boussole est mise en pause (direct), le calage mémorisé. @param {number} dh @param {number} dp */
  function appliquerCalage(dh, dp) { S.headOff += dh; S.pitchOff += dp; if (direct) noterCalage(fusion, Date.now()); sauver(); }
  let calageEnCours = false, bancEnCours = false;
  /** Consigne un calage au carnet (rien pendant le banc d'essai, ni sans position) : cap brut contre cap juste. @param {string} src @param {{h: number, p: number} | null} avant @param {Record<string, unknown>} [extra] */
  function consigner(src, avant, extra) {
    const d = app.donnees(); if (bancEnCours || !d.pos) return;
    const po = pose(), maintenant = Date.now(), cam = entree ? entree.etat() : null, so = soleilMaintenant(), ph = ps.photoMode, ex = ph ? ph.photo.exif : null;
    const m = creerMesure({ src, avant, extra, capDeg: po.capDeg, inclinaisonDeg: po.inclinaisonDeg, headOff: S.headOff, pitchOff: S.pitchOff, camFov: S.camFov, pos: d.pos, precisionM: cam ? cam.precisionM : null, soleil: so,
      utcPhotoMs: ph ? ph.photo.utc : null, maintenantMs: maintenant, appareil: carnet.appareil, modele: carnet.modele(), ua: navigator.userAgent || '', gyro: direct && gyroActif(fusion, S, maintenant),
      photo: ph ? { make: (ex && ex.make) || '', model: (ex && ex.model) || '', orient: ex ? ex.orient : null, dir: ex && ex.dir !== undefined ? ex.dir : null, dirRef: ex && ex.dirRef ? ex.dirRef : null, dirCorr: ph.photo.correctionDeg || 0, w: ph.w, h: ph.h } : null,
      secteursMag: fusion.magBins.filter(Boolean).map((q) => /** @type {{v: number}} */ (q).v), retoursBoussole: fusion.gyroResets });
    if (m) carnet.consigner(m);
  }
  /** Écart appris pour cet appareil, ici (calage/carnet.js). */
  const apprisIci = () => { const d = app.donnees(), po = pose(); return ecartAppris(carnet.lire().mesures, { pos: d.pos, capDeg: po.capDeg, headOff: S.headOff, appareil: carnet.appareil, maintenantMs: Date.now() }); };
  /** La lune à l'instant de la prise de vue (photo) ou maintenant (direct). */
  const luneMaintenant = () => { const d = app.donnees(), t = ps.photoMode ? ps.photoMode.photo.utc : Date.now(); return d.pos && t ? positionLune(t, d.pos.lat, d.pos.lon) : null; };
  /** Cherche la lune dans l'image SANS rien appliquer (de nuit : même détection que le soleil, autour de sa position calculée). */
  function evaluerLune() {
    const src = imageSource(), d = app.donnees();
    return calerSurSoleil({ pos: d.pos, soleil: luneMaintenant(), astre: 'lune', pose: pose(), champDeg: vFov(), ecran: { largeurPx: ps.W, hauteurPx: ps.H }, large: !!(ps.photoMode && ps.photoMode.photo.peuFiable),
      lirePixels: (cw) => lirePixelsRecadres(src, cw, { largeurPx: ps.W, hauteurPx: ps.H }) });
  }
  /** En roulant (plus de 3 m/s, soit 11 km/h) la carrosserie fausse la boussole de 30° ou plus : le soleil n'est plus cherché dans une fenêtre autour de sa direction calculée mais dans toute l'image (mode « large »). */
  const enVehicule = () => !!entree && (entree.etat().vitesseMs ?? 0) > VITESSE_VEHICULE_MS;
  /** Cherche le disque du soleil dans l'image SANS rien appliquer (le calage et les tests de parité s'en servent). */
  function evaluerSoleil() {
    const src = imageSource(), d = app.donnees();
    return calerSurSoleil({ pos: d.pos, soleil: soleilMaintenant(), pose: pose(), champDeg: vFov(), ecran: { largeurPx: ps.W, hauteurPx: ps.H }, large: !!(ps.photoMode && ps.photoMode.photo.peuFiable) || enVehicule(),
      lirePixels: (cw) => lirePixelsRecadres(src, cw, { largeurPx: ps.W, hauteurPx: ps.H }) });
  }
  /** « Caler auto » SANS rien appliquer : soleil, puis relief, puis repères (calage/auto.js). Sert au calage et aux tests de parité. @returns {Promise<import('../calage/auto.js').ResultatAuto>} */
  /** Test de permutation des repères (défaut oui) ; les tests de parité avec la v1 (j), qui n'en a pas, l'éteignent. */
  let permutationReperes = true, ordreAuto = /** @type {'relief-soleil' | 'soleil-relief' | null} */ (null);
  function evaluerAuto(/** @type {{permutation?: boolean, ordre?: 'relief-soleil' | 'soleil-relief'}} */ opts = {}) {
    const src = imageSource(), d = app.donnees();
    return calerAutomatiquement({ pos: d.pos, pose: pose(), camFov: S.camFov, ecran: ecranPx(), champAffiche: (cam) => champAffiche(cam, ecranPx(), fluxImage()), photo: !!ps.photoMode, permutation: opts.permutation ?? permutationReperes, ordre: opts.ordre ?? ordreAuto ?? (S.autoRelief ? 'relief-soleil' : 'soleil-relief'),
      villeDense: villeDense({ pos: d.pos, cities: /** @type {any} */ (d.lieux), monuments: /** @type {any} */ (d.monuments), batiments: /** @type {any} */ (d.reperes) }), avecRelief: S.relief && !!d.terrain, correctionOeilM: S.obsHeight || 0,
      attendreRelief: () => app.attendreRelief(8000), relief: () => { const t = app.donnees().terrain; return t ? t.pm : null; }, soleil: () => evaluerSoleil(), lune: () => evaluerLune(),
      lireLuminance: (cw) => { const px = lirePixelsRecadres(src, cw, ecranPx()); return px ? luminance(px) : null; },
      lireSilhouette: (po, fh) => { const px = lirePixelsRecadres(src, LARGEUR_ANALYSE_PX, ecranPx()); return px ? observerCiel(px, { ecran: ecranPx(), pose: po, focalePx: fh }) : null; },
      liste: d.pos ? monumentsPourCalage({ monuments: d.monuments, elements: (ps.dernierBilan && ps.dernierBilan.monuments) || [], pos: d.pos, terrain: d.terrain }) : [] }); // la v1 cherche ses repères dans tout `monumentSites`, pas dans la liste affichée
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
  // ---------- échelle du champ : deux repères touchés ----------
  /** 0 : éteint ; 1 : premier repère attendu ; 2 : second attendu. @type {0 | 1 | 2} */
  let etapeEchelle = 0;
  /** @type {null | {x: number, y: number, relevementDeg: number, nom: string}} */
  let premierEchelle = null;
  $('btnScale').addEventListener('click', () => {
    if (ps.photoMode) { note('Le champ se cale en direct (page « Réalité augmentée ») : une photo a sa propre focale.', 6000); return; }
    etapeEchelle = 1; premierEchelle = null; $('sheet').classList.remove('open'); note('Touchez un premier repère connu (monument, lieu ou soleil)', 8000);
  });
  /** Un toucher bref en mode échelle : identifie le repère, puis calcule au second. @param {number} x @param {number} y @param {ReturnType<typeof evaluerPointage>} [r] repère identifié (les tests le fournissent) */
  function toucherEchelle(x, y, r = evaluerPointage(x, y)) {
    if (r.aucun) { note(r.note, 4500); return; }
    if (etapeEchelle === 1) { premierEchelle = { x, y, relevementDeg: r.relevementDeg, nom: r.nom }; etapeEchelle = 2; note(`Premier repère : « ${r.nom} ». Touchez un second repère, à plus de 10° du premier`, 8000); return; }
    const p1 = /** @type {NonNullable<typeof premierEchelle>} */ (premierEchelle);
    etapeEchelle = 0; premierEchelle = null;
    const e = calerEchelle({ ecran: ecranPx(), roulisDeg: pose().roulisDeg, capDeg: pose().capDeg, champAffiche: (cam) => champAffiche(cam, ecranPx(), fluxImage()), points: [p1, { x, y, relevementDeg: r.relevementDeg }] });
    if (!e.ok) { note('Champ non calé : ' + e.message, 7000); return; }
    const ancien = S.camFov; S.camFov = e.camFov; S.headOff += e.correctionCapDeg; if (direct) noterCalage(fusion, Date.now()); sauver(); synchroniser();
    stockage.ecrire('echelle', { camFov: e.camFov, t: Date.now(), reperes: [p1.nom, r.nom] });
    journal.info('calage', `échelle du champ : ${ancien}° → ${e.camFov}° (affiché ${e.champAfficheDeg.toFixed(0)}°), cap ${e.correctionCapDeg >= 0 ? '+' : ''}${e.correctionCapDeg.toFixed(1)}°, repères ${p1.nom} / ${r.nom}`);
    note(`Champ calé : ${ancien}° → ${e.camFov}° (affiché ${e.champAfficheDeg.toFixed(0)}°) · cap ${e.correctionCapDeg >= 0 ? '+' : ''}${e.correctionCapDeg.toFixed(1)}° · avec « ${p1.nom} » et « ${r.nom} »`, 9000);
  }
  /** @param {number} x @param {number} y */
  function evaluerPointage(x, y) {
    const d = app.donnees(), lieux = nomsDeLieux(/** @type {any} */ (d.lieux));
    return pointer({ toucher: { x, y }, pose: pose(), champDeg: vFov(), ecran: { largeurPx: ps.W, hauteurPx: ps.H }, liste: /** @type {any} */ ((ps.dernierBilan && ps.dernierBilan.liste) || []), soleil: soleilMaintenant(), avecRelief: S.relief && !!d.terrain,
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
    if (ps.photoMode) { note('L’écart appris corrige les capteurs : il se reprend en direct (page « Réalité augmentée »).', 6000); return; }
    const L = apprisIci();
    if (!L) { note('pas encore d’écart appris : calez une première fois ici (soleil, repère, glisser)'); return; }
    S.headOff = L.off; sauver(); if (direct) noterCalage(fusion, Date.now());
    note(`écart appris repris : ${L.off >= 0 ? '+' : ''}${L.off.toFixed(1)}° (${L.comment})`, 6000);
  });
  /** Banc d'essai (photo rejouée) : dix départs décalés, « Caler auto » à chaque fois, verdict par départ ; le résultat s'affiche dans le diagnostic. */
  async function lancerBanc() {
    if (!ps.photoMode || bancEnCours) return;
    const ph = ps.photoMode, b = $f('btnBench'); b.disabled = true; bancEnCours = true;
    const reference = { h: S.headOff, p: S.pitchOff, c: S.camFov }, info = $f('photoInfo');
    try {
      const sol = evaluerSoleil(); // le soleil, s'il est visible, donne une référence indépendante du calage à la main
      const po = pose(), d = app.donnees(), fh0 = (ps.W / 2) / Math.tan(vFov() / 2 * RAD), avecRelief = S.relief && !!d.terrain;
      const liste = d.pos ? monumentsPourCalage({ monuments: d.monuments, elements: (ps.dernierBilan && ps.dernierBilan.monuments) || [], pos: d.pos, terrain: d.terrain }) : [];
      const utilisables = reperesPourCalage(/** @type {any} */ ({ heading: po.capDeg, fh: fh0 }), liste, { largeurPx: ps.W }, { avecRelief, correctionOeilM: S.obsHeight || 0 }).map((o) => o.c);
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
    } finally { bancEnCours = false; $('fov').value = String(S.camFov); synchroniser(); b.disabled = !ps.photoMode; }
  }
  /** @type {{dernier: any}} */
  const banc = { dernier: null };
  $f('btnBench').addEventListener('click', () => { $('sheet').classList.remove('open'); lancerBanc(); });
  return { consigner, evaluerSoleil, evaluerLune, evaluerAuto, calerAuto, evaluerPointage, toucherEchelle, pointerSur, definirModePointage, apprisIci, lancerBanc, banc, echelleActive: () => etapeEchelle !== 0, pointageActif: () => modePointage, bancEnCours: () => bancEnCours,
    definirPermutation: (/** @type {boolean} */ v) => { permutationReperes = v; }, definirOrdreAuto: (/** @type {'relief-soleil' | 'soleil-relief' | null} */ v) => { ordreAuto = v; } };
}
