// @ts-check
/**
 * Visibilité d'après la photo : silhouette du ciel lue sur l'image, rafraîchie toutes les 3 s.
 * Reçoit le contexte de la page (`c` : réglages, application, aides d'affichage, état partagé `ps`) ; ne lit ni n'écrit rien d'autre que ce contexte et le DOM.
 */
import { RAD } from '../noyau/constantes.js';
import { lirePixelsRecadres } from '../vision/lire-pixels.js';
import { LARGEUR_ANALYSE_PX, observerCiel } from '../vision/silhouette-ciel.js';

/** @param {import('./contexte.js').Contexte} c */
export function installerVisibilitePhoto(c) {
  const { app, pose, vFov, imageSource, ps } = c;
  /** @type {{t: number, ms: number, derniere: null | {ok: boolean, skyFrac: number, cols: unknown[], t: number}}} */
  const analyse = { t: 0, ms: 0, derniere: null };
  /** Lit l'image, cherche la limite du ciel et la publie (datée, avec la pose du moment : l'analyse n'est valable que pour cette pose). */
  function analyserCiel() {
    const src = imageSource(); if (!src) return;
    const t0 = performance.now(), po = pose(), fh = (ps.W / 2) / Math.tan(vFov() / 2 * RAD), px = lirePixelsRecadres(src, LARGEUR_ANALYSE_PX, { largeurPx: ps.W, hauteurPx: ps.H });
    if (!px) return;
    const r = observerCiel(px, { ecran: { largeurPx: ps.W, hauteurPx: ps.H }, pose: po, focalePx: fh });
    analyse.ms = performance.now() - t0;
    const a = { ...r, t: Date.now(), heading: po.capDeg, pitch: po.inclinaisonDeg, fh };
    analyse.derniere = a; app.definirAnalysePhoto(a);
  }
  return { analyse, analyserCiel };
}
