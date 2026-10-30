// @ts-check
/**
 * Photo rejouée : ouvrir et quitter une photo, plein écran épuré, démarrage, position simulée.
 * Reçoit le contexte de la page (`c` : réglages, application, aides d'affichage, état partagé `ps`) ; ne lit ni n'écrit rien d'autre que ce contexte et le DOM.
 */
import { analyserPhoto, lirePositionTexte, texteInfoPhoto } from '../entrees/photo.js';

/** @param {import('./contexte.js').Contexte} c @param {ReturnType<typeof import('./calage.js').installerCalage>} calage */
export function installerPhoto(c, calage) {
  const { S, app, journal, entree, memoires, direct, $, $f, note, sauver, synchroniser, redimensionner, ps, simulee } = c;
  /** Vue épurée : en photo rejouée, le plein écran masque bandeau de la photo, état, rayon, œil et aide ; leur place revient aux noms. Hors photo, rien ne change. */
  const syncEpure = () => document.body.classList.toggle('clean', !!ps.photoMode && !!document.fullscreenElement);
  document.addEventListener('fullscreenchange', () => { syncEpure(); setTimeout(redimensionner, 120); });
  // ---------- photo ----------
  async function ouvrirPhoto(/** @type {File} */ f) {
    const info = $f('photoInfo'), octets = await f.arrayBuffer(), img = $('photoBg'), url = URL.createObjectURL(f);
    try { await new Promise((ok, ko) => { img.onload = ok; img.onerror = ko; img.src = url; }); } catch { URL.revokeObjectURL(url); info.textContent = 'Image illisible (format non pris en charge par le navigateur ?)'; return; }
    const w = img.naturalWidth, h = img.naturalHeight, r = analyserPhoto(octets, { largeurPx: w, hauteurPx: h, positionSimulee: S.simOn ? S.simPos : S.simPos });
    if (!r.ok) { URL.revokeObjectURL(url); info.textContent = r.raison; $('sheet').classList.add('open'); return; }
    const p = r.photo, backup = ps.photoMode ? ps.photoMode.backup : { headOff: S.headOff, pitchOff: S.pitchOff, camFov: S.camFov };
    if (ps.photoMode) URL.revokeObjectURL(ps.photoMode.url);
    ps.photoMode = { img, w, h, url, backup, photo: p }; $f('btnBench').disabled = calage.bancEnCours(); syncEpure();
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
    if (!ps.photoMode) return;
    Object.assign(S, ps.photoMode.backup); URL.revokeObjectURL(ps.photoMode.url); ps.photoMode = null; $f('btnBench').disabled = true; syncEpure();
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
  const appliquerSimulee = () => { const p = simulee() ? lirePositionTexte(S.simPos) : null; if (p && !ps.photoMode) { app.definirPosition(p); note(`Position simulée : ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`); } };
  $('simOn').addEventListener('change', appliquerSimulee); $('simPos').addEventListener('change', appliquerSimulee);
  $f('photoFile').addEventListener('change', (/** @type {any} */ e) => { const f = e.target.files[0]; e.target.value = ''; if (f) ouvrirPhoto(f); });
  return { ouvrirPhoto, quitterPhoto, syncEpure };
}
