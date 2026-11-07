// @ts-check
/**
 * Déclencheur : capture de l'image (photo ou caméra) avec les noms, aperçu, enregistrement et partage.
 * Reçoit le contexte de la page (`c` : réglages, application, aides d'affichage, état partagé `ps`) ; ne lit ni n'écrit rien d'autre que ce contexte et le DOM.
 */

/** @param {import('./contexte.js').Contexte} c */
export function installerDeclencheur(c) {
  const { entree, video, ov, familles, $, pose, ps } = c;
  // ---------- déclencheur ----------
  /** @type {Blob | null} */ let shotBlob = null; let shotURL = '';
  $('shutter').addEventListener('click', () => {
    const fl = $('flash'); fl.style.opacity = '.9'; setTimeout(() => { fl.style.opacity = '0'; }, 60);
    const BAND = 48, c = document.createElement('canvas'); c.width = Math.round(ps.W * ps.dpr); c.height = Math.round((ps.H + BAND) * ps.dpr);
    const x = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d')); x.scale(ps.dpr, ps.dpr);
    if (ps.photoMode) { const s = Math.max(ps.W / ps.photoMode.w, ps.H / ps.photoMode.h), dw = ps.photoMode.w * s, dh = ps.photoMode.h * s; x.save(); x.beginPath(); x.rect(0, 0, ps.W, ps.H); x.clip(); x.drawImage(ps.photoMode.img, (ps.W - dw) / 2, (ps.H - dh) / 2, dw, dh); x.restore(); } else if (video && entree && entree.flux()) { const f = /** @type {{largeurPx: number, hauteurPx: number}} */ (entree.flux()), s = Math.max(ps.W / f.largeurPx, ps.H / f.hauteurPx), dw = f.largeurPx * s, dh = f.hauteurPx * s; x.save(); x.beginPath(); x.rect(0, 0, ps.W, ps.H); x.clip(); x.drawImage(video, (ps.W - dw) / 2, (ps.H - dh) / 2, dw, dh); x.restore(); } else { x.fillStyle = '#000'; x.fillRect(0, 0, ps.W, ps.H); }
    x.drawImage(ov, 0, 0, ps.W, ps.H);
    x.fillStyle = '#0E1A2B'; x.fillRect(0, ps.H, ps.W, BAND); x.textAlign = 'left';
    x.font = `500 11px ${familles.mono}`; x.fillStyle = 'rgba(224,165,38,.95)'; x.fillText(`${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} · cap ${Math.round(pose().capDeg)}° · Villes à l'horizon`, 12, ps.H + 29);
    c.toBlob((b) => { shotBlob = b; if (shotURL) URL.revokeObjectURL(shotURL); if (!b) return; shotURL = URL.createObjectURL(b); $('shotImg').src = shotURL; $('shot').classList.add('open'); }, 'image/jpeg', .92);
  });
  const nomPhoto = () => 'horizon-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.jpg';
  $('shotClose').addEventListener('click', () => $('shot').classList.remove('open'));
  $('shotSave').addEventListener('click', () => { if (!shotBlob) return; const a = document.createElement('a'); a.href = shotURL; a.download = nomPhoto(); document.body.appendChild(a); a.click(); a.remove(); });
  $('shotShare').addEventListener('click', async () => { if (!shotBlob) return; const fichier = new File([shotBlob], nomPhoto(), { type: 'image/jpeg' }); try { if (navigator.canShare?.({ files: [fichier] })) await navigator.share({ files: [fichier] }); } catch { /* partage annulé */ } });
  return undefined;
}
