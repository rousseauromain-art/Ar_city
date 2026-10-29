// @ts-check
/**
 * Page « Photo » de la v2 (v2/photo.html) : même interface que la v1, branchée sur la racine de composition (app/application.js) et le moteur de scène (moteur/scene.js).
 * DOM uniquement : la logique est dans src/. Entrées : le document, config.js (APP_CONFIG.relay), le fichier choisi. Sortie : le canvas à 30 images/s, les réglages mémorisés (`vh2:reglages`).
 * Pas encore branchés (étape 10) : calage automatique, calage appris, viser un repère, banc d'essai, visibilité d'après la photo, soleil.
 */
import { journal } from '../outils/journal.js';
import { etat } from '../outils/etat.js';
import { creerStockage, adaptateurNavigateur, PREFIXE_CACHE } from '../outils/stockage.js';
import { lireDrapeaux } from '../outils/drapeaux.js';
import { chargerEruda } from '../outils/debug.js';
import { VERSION_V2 } from '../outils/version.js';
import { lireReglages, ecrireReglages } from '../moteur/reglages.js';
import { composerScene } from '../moteur/scene.js';
import { creerApplication } from '../app/application.js';
import { analyserPhoto, texteInfoPhoto, lirePositionTexte } from '../entrees/photo.js';
import { champAffiche } from '../rendu/projection.js';
import { avecRoulis, dessiner } from '../rendu/canvas.js';
import { RAD } from '../noyau/constantes.js';

/** @param {string} id @returns {any} */
const $ = (id) => { const e = document.getElementById(id); if (!e) throw new Error(`élément #${id} introuvable`); return e; };

function demarrer() {
  const stockage = creerStockage({ adaptateur: adaptateurNavigateur(journal), journal });
  etat.definirVersion(VERSION_V2);
  etat.remplacerDrapeaux(lireDrapeaux({ recherche: location.search, stockage, journal }));
  window.addEventListener('error', (ev) => journal.erreur('page', ev.message, { fichier: ev.filename, ligne: ev.lineno }));
  window.addEventListener('unhandledrejection', (ev) => journal.erreur('page', 'promesse rejetée', ev.reason));
  chargerEruda({ recherche: location.search, journal });

  const S = lireReglages(stockage);
  /** @type {null | {img: HTMLImageElement, w: number, h: number, url: string, backup: {headOff: number, pitchOff: number, camFov: number}, photo: import('../entrees/photo.js').ReglagesPhoto}} */
  let photoMode = null;
  const sauver = () => ecrireReglages(stockage, S, photoMode ? photoMode.backup : null);
  const relais = String((/** @type {any} */ (window).APP_CONFIG || {}).relay || '');
  const app = creerApplication({ reglages: () => S, journal, stockage, relais, urlWorkerMasque: new URL('../workers/masque-relief.js', import.meta.url), quandChange: () => {} });

  const ov = /** @type {HTMLCanvasElement} */ ($('ov')), ctx = /** @type {CanvasRenderingContext2D} */ (ov.getContext('2d'));
  const css = getComputedStyle(document.body), familles = { affichage: css.getPropertyValue('--display'), mono: css.getPropertyValue('--mono') };
  let W = 0, H = 0, dpr = 1, safeT = 0;
  const memoires = { placement: new Map(), lignes: new Map(), choixBateaux: { ids: null }, calageMonuments: new Map() };
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
  const vFov = () => champAffiche(S.camFov, { largeurPx: W, hauteurPx: H }, photoMode ? { largeurPx: photoMode.w, hauteurPx: photoMode.h } : null);
  const montrerChamp = () => { $('fovV').textContent = `${S.camFov}° · affiché ${Math.round(vFov())}°`; };

  // ---------- réglages <-> commandes ----------
  /** @type {[string, (s: any) => boolean, (s: any, v: boolean) => void, string?][]} */
  const cases = [
    ['lyPlaces', (s) => s.layers.places, (s, v) => { s.layers.places = v; }], ['lyMon', (s) => s.layers.monuments, (s, v) => { s.layers.monuments = v; }, 'monuments'],
    ['lyEq', (s) => s.layers.equip !== false, (s, v) => { s.layers.equip = v; }], ['lyTel', (s) => s.telecom, (s, v) => { s.telecom = v; }, 'telecom'],
    ['lyBld', (s) => s.buildings, (s, v) => { s.buildings = v; }, 'reperes'], ['lySea', (s) => s.sea, (s, v) => { s.sea = v; }], ['lyAir', (s) => s.air, (s, v) => { s.air = v; }],
    ['air', (s) => s.air, (s, v) => { s.air = v; }], ['sea', (s) => s.sea, (s, v) => { s.sea = v; }], ['tel', (s) => s.telecom, (s, v) => { s.telecom = v; }, 'telecom'], ['bld', (s) => s.buildings, (s, v) => { s.buildings = v; }, 'reperes'],
    ['dst', (s) => s.showDist, (s, v) => { s.showDist = v; }], ['vil', (s) => s.hamlets, (s, v) => { s.hamlets = v; }, 'lieux'], ['rdg', (s) => s.ridges !== false, (s, v) => { s.ridges = v; }],
    ['sky', (s) => s.skyline, (s, v) => { s.skyline = v; }], ['crs', (s) => s.cross, (s, v) => { s.cross = v; }], ['rel', (s) => s.relief, (s, v) => { s.relief = v; }, 'terrain'],
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
    if (id === 'simOn' || id === 'rel') memoires.placement.clear();
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
  $('obsH').addEventListener('input', (/** @type {any} */ e) => { S.obsHeight = +e.target.value; synchroniser(); clearTimeout(minuteurOeil); minuteurOeil = window.setTimeout(() => { sauver(); app.corrigerHauteurOeil(S.obsHeight); }, 400); });
  $('floorN').addEventListener('change', (/** @type {any} */ e) => { const m = Math.round((+e.target.value || 0) * 3.2); S.obsHeight = Math.min(250, m); synchroniser(); sauver(); app.corrigerHauteurOeil(S.obsHeight); });
  $('flt').addEventListener('input', (/** @type {any} */ e) => { S.filter = e.target.value; });
  $('simPos').addEventListener('change', (/** @type {any} */ e) => { S.simPos = e.target.value; sauver(); });
  $('reset').addEventListener('click', () => { S.headOff = 0; S.pitchOff = 0; sauver(); note('Calage remis à zéro'); });
  $('btnReload').addEventListener('click', () => { memoires.placement.clear(); app.recharger({ lieux: true, terrain: true, monuments: true, telecom: true, reperes: true }); note('Rechargement des lieux et du relief…'); });
  $('btnSky').addEventListener('click', () => { app.recharger({ terrain: true }); note('Relief recalculé'); });
  $('btnFs').addEventListener('click', () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => {}); });
  const bascule = (/** @type {string} */ id) => $(id).classList.toggle('open');
  $('btnLayers').addEventListener('click', () => { bascule('layers'); $('btnLayers').setAttribute('aria-expanded', String($('layers').classList.contains('open'))); });
  $('btnSet').addEventListener('click', () => $('sheet').classList.add('open')); $('btnClose').addEventListener('click', () => $('sheet').classList.remove('open'));
  $('btnFind').addEventListener('click', () => { $('sheet').classList.add('open'); setTimeout(() => $('flt').focus(), 300); });
  for (const id of ['btnZoneDL', 'btnZoneDel']) { const b = $(id); b.disabled = true; b.classList.add('etape10'); }
  for (const id of ['phv', 'gyr']) { const b = $(id); b.disabled = true; b.checked = id === 'gyr' ? S.gyro : false; }
  $('btnCacheClr').addEventListener('click', async () => {
    if (!confirm('Supprimer les données mémorisées de la v2 (relief, lieux, monuments) ? Les réglages sont conservés.')) return;
    try { for (const k of await caches.keys()) if (k.startsWith(PREFIXE_CACHE)) await caches.delete(k); } catch (e) { journal.erreur('page', 'suppression des caches', e); }
    for (const n of stockage.noms()) if (n !== 'reglages' && n !== 'drapeaux') stockage.supprimer(n);
    note('Cache vidé : rechargez la page.');
  });
  $('verInfo').textContent = VERSION_V2;

  // ---------- diagnostic ----------
  const echap = (/** @type {string} */ t) => String(t).replace(/[<&>]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] || c));
  $('btnDbg').addEventListener('click', () => {
    $('sheet').classList.remove('open');
    const e = app.etat(), d = app.donnees();
    const lignes = [`version ${VERSION_V2}`, `position ${d.pos ? d.pos.lat.toFixed(5) + ', ' + d.pos.lon.toFixed(5) : '—'}`, `lieux ${e.lieux} (${echap(e.source)})`, `relief ${e.etatRelief || '—'}`, `monuments ${d.monuments.length} · ${echap(e.monuments)}`,
      `pylônes ${echap(e.telecom)} · repères hauts ${echap(e.reperes)}`, `relais ${relais || 'non configuré'}`];
    $('dbgTitle').textContent = 'Diagnostic';
    $('dbgBody').innerHTML = `<div class="dbgsec">État</div>${lignes.map((l) => `<div class="dbgline">${l}</div>`).join('')}<div class="dbgsec">Journal</div>`
      + journal.entrees(60).reverse().map((x) => `<div class="dbgline">${new Date(x.t).toLocaleTimeString('fr-FR')} · ${x.niveau} · ${echap(x.module)} · ${echap(x.message)}</div>`).join('');
    $('dbg').classList.add('open');
  });
  $('dbgClose').addEventListener('click', () => $('dbg').classList.remove('open'));

  // ---------- photo ----------
  async function ouvrirPhoto(/** @type {File} */ f) {
    const info = $('photoInfo'), octets = await f.arrayBuffer(), img = $('photoBg'), url = URL.createObjectURL(f);
    try { await new Promise((ok, ko) => { img.onload = ok; img.onerror = ko; img.src = url; }); } catch { URL.revokeObjectURL(url); info.textContent = 'Image illisible (format non pris en charge par le navigateur ?)'; return; }
    const w = img.naturalWidth, h = img.naturalHeight, r = analyserPhoto(octets, { largeurPx: w, hauteurPx: h, positionSimulee: S.simOn ? S.simPos : S.simPos });
    if (!r.ok) { URL.revokeObjectURL(url); info.textContent = r.raison; $('sheet').classList.add('open'); return; }
    const p = r.photo, backup = photoMode ? photoMode.backup : { headOff: S.headOff, pitchOff: S.pitchOff, camFov: S.camFov };
    if (photoMode) URL.revokeObjectURL(photoMode.url);
    photoMode = { img, w, h, url, backup, photo: p };
    if (p.champDeg !== null) S.camFov = p.champDeg;
    S.headOff = p.capDeg; S.pitchOff = 0; img.hidden = false; $('photoChip').hidden = false;
    memoires.placement.clear(); memoires.lignes.clear(); memoires.choixBateaux = { ids: null }; memoires.calageMonuments.clear();
    synchroniser(); $('start').style.display = 'none';
    info.textContent = texteInfoPhoto(p, S.camFov);
    journal.info('photo', `photo rejouée : ${info.textContent}`);
    app.definirPosition(p.pos, { force: true });
    note('Photo rejouée. Glissez pour corriger le cap et l’horizon, pincez pour le champ. Touchez le bandeau 📷 pour quitter.', 7000);
  }
  function quitterPhoto() {
    if (!photoMode) return;
    Object.assign(S, photoMode.backup); URL.revokeObjectURL(photoMode.url); photoMode = null;
    const img = $('photoBg'); img.hidden = true; img.removeAttribute('src'); $('photoChip').hidden = true; $('photoInfo').textContent = '';
    synchroniser(); sauver(); $('start').style.display = '';
  }
  const choisir = () => $('photoFile').click();
  $('go').addEventListener('click', choisir); $('btnPhoto').addEventListener('click', choisir); $('photoChip').addEventListener('click', quitterPhoto);
  $('photoFile').addEventListener('change', (/** @type {any} */ e) => { const f = e.target.files[0]; e.target.value = ''; if (f) ouvrirPhoto(f); });

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
    S.headOff = (drag.h - Math.atan((e.clientX - drag.x) / fh) / RAD + 360) % 360; S.pitchOff = drag.p + Math.atan((e.clientY - drag.y) / fh) / RAD;
  });
  ov.addEventListener('pointerup', (e) => {
    const etaitPincement = !!pinch; ptrs.delete(e.pointerId);
    if (etaitPincement) { if (ptrs.size < 2) { pinch = null; sauver(); } drag = null; return; }
    if (drag && !drag.moved && Date.now() - drag.t < 450) { S.headOff = drag.h; S.pitchOff = drag.p; } else sauver();
    drag = null;
  });
  ov.addEventListener('pointercancel', (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; drag = null; });

  // ---------- déclencheur ----------
  /** @type {Blob | null} */ let shotBlob = null; let shotURL = '';
  $('shutter').addEventListener('click', () => {
    const fl = $('flash'); fl.style.opacity = '.9'; setTimeout(() => { fl.style.opacity = '0'; }, 60);
    const BAND = 48, c = document.createElement('canvas'); c.width = Math.round(W * dpr); c.height = Math.round((H + BAND) * dpr);
    const x = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d')); x.scale(dpr, dpr);
    if (photoMode) { const s = Math.max(W / photoMode.w, H / photoMode.h), dw = photoMode.w * s, dh = photoMode.h * s; x.save(); x.beginPath(); x.rect(0, 0, W, H); x.clip(); x.drawImage(photoMode.img, (W - dw) / 2, (H - dh) / 2, dw, dh); x.restore(); } else { x.fillStyle = '#000'; x.fillRect(0, 0, W, H); }
    x.drawImage(ov, 0, 0, W, H);
    x.fillStyle = '#0E1A2B'; x.fillRect(0, H, W, BAND); x.textAlign = 'left';
    x.font = `500 11px ${familles.mono}`; x.fillStyle = 'rgba(224,165,38,.95)'; x.fillText(`${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} · cap ${Math.round(S.headOff)}° · Villes à l'horizon`, 12, H + 29);
    c.toBlob((b) => { shotBlob = b; if (shotURL) URL.revokeObjectURL(shotURL); if (!b) return; shotURL = URL.createObjectURL(b); $('shotImg').src = shotURL; $('shot').classList.add('open'); }, 'image/jpeg', .92);
  });
  const nomPhoto = () => 'horizon-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.jpg';
  $('shotClose').addEventListener('click', () => $('shot').classList.remove('open'));
  $('shotSave').addEventListener('click', () => { if (!shotBlob) return; const a = document.createElement('a'); a.href = shotURL; a.download = nomPhoto(); document.body.appendChild(a); a.click(); a.remove(); });
  $('shotShare').addEventListener('click', async () => { if (!shotBlob) return; const fichier = new File([shotBlob], nomPhoto(), { type: 'image/jpeg' }); try { if (navigator.canShare?.({ files: [fichier] })) await navigator.share({ files: [fichier] }); } catch { /* partage annulé */ } });

  // ---------- boucle d'affichage : 30 images/s au plus ----------
  let derniere = 0, dernierBilan = /** @type {any} */ (null);
  function image(/** @type {number} */ t) {
    requestAnimationFrame(image);
    if (t - derniere < 33) return;
    derniere = t;
    dessinerImage();
  }
  function dessinerImage() {
    const d = app.donnees(), e = app.etat();
    const vue = { largeurPx: W, hauteurPx: H, capDeg: S.headOff, inclinaisonDeg: S.pitchOff, roulisDeg: 0, champDeg: vFov() };
    const r = composerScene({ vue, reglages: S, donnees: d.pos ? d : null, memoires, maintenantMs: Date.now(),
      ecran: { reservations: obstaclesInterface(), safeT, safeB: parseFloat(css.getPropertyValue('--safe-b')) || 0, mesurerTexte, familles },
      etat: { photo: !!photoMode, capteur: false, erreurCamera: '', precisionM: 0, chargement: e.chargementLieux, source: e.source, etatRelief: e.etatRelief, messageAir: '', messageSea: '' } });
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    ctx.save(); avecRoulis(ctx, vue, () => dessiner(ctx, r.scene)); ctx.restore(); dessiner(ctx, r.ecran);
    dernierBilan = r.bilan;
    $('status').textContent = photoMode ? r.bilan.statut : 'Ouvrez une photo';
    const b = $('eyeBadge'), n = r.bilan.badge; b.textContent = n ? '+' + n : ''; b.style.display = n ? 'block' : 'none';
    const pc = $('photoChip');
    if (photoMode) { const dd = ((S.headOff - photoMode.photo.capDeg + 540) % 360) - 180; pc.innerHTML = `📷 photo${photoMode.photo.date ? ' du ' + photoMode.photo.date.slice(0, 10).replace(/:/g, '-') : ''} · cap ${photoMode.photo.direction} → <b>${Math.round(S.headOff)}°</b> (${dd >= 0 ? '+' : ''}${dd.toFixed(1)}°) · horizon ${S.pitchOff >= 0 ? '+' : ''}${S.pitchOff.toFixed(1)}° · champ ${S.camFov}° · <u>quitter</u>`; }
    const fc = $('filt'); if (S.filter) { fc.style.display = 'block'; fc.textContent = `filtre : ${S.filter.replace(/[<&]/g, '')}`; } else fc.style.display = 'none';
    $('btnFind').classList.toggle('on', !!S.filter);
  }

  redimensionner(); synchroniser(); $('photoBg').hidden = true; $('photoChip').hidden = true;
  const simu = S.simOn ? lirePositionTexte(S.simPos) : null;
  if (simu) app.definirPosition(simu);
  journal.info('page', `page photo ouverte (${VERSION_V2})`);
  /** @type {any} */ (window).__vh2 = { S, app, ouvrirPhoto, quitterPhoto, memoires, photo: () => photoMode, rendreImage: dessinerImage, bilan: () => dernierBilan, ctx, obstacles: obstaclesInterface };
  requestAnimationFrame(image);
}

demarrer();
