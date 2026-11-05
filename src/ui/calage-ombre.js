// @ts-check
/**
 * Calage sur une ombre : le bouton « Ombre » arme le geste, l'utilisateur trace au doigt l'ombre d'un poteau ou d'une arête verticale, du pied vers le bout ; le cap est corrigé d'après la direction du soleil (calage/ombre.js).
 * Le trait tracé reste visible pendant le geste. Reçoit le contexte de la page (`c`) et le calage ; ne lit ni n'écrit rien d'autre que ce contexte et le DOM.
 */
import { capDepuisOmbre } from '../calage/ombre.js';

/** @param {import('./contexte.js').Contexte} c @param {ReturnType<typeof import('./calage.js').installerCalage>} calage */
export function installerCalageOmbre(c, calage) {
  const { S, journal, pose, vFov, ps, $, note } = c;
  let actif = false;
  /** @type {null | {x: number, y: number}} */
  let pied = null;
  const armer = (/** @type {boolean} */ v) => { actif = v; pied = null; ps.traitOmbre = null; $('btnShadow').classList.toggle('on', v); if (v) note('Tracez au doigt l\'ombre d\'un poteau ou d\'une arête verticale, du pied vers le bout (soleil à plus de 10°, ciel dégagé)', 9000); };
  /** Applique le calage (message de refus sinon). @param {{x: number, y: number}} p @param {{x: number, y: number}} b */
  function caler(p, b) {
    const r = capDepuisOmbre({ trait: { pied: p, bout: b }, pose: pose(), champDeg: vFov(), ecran: { largeurPx: ps.W, hauteurPx: ps.H }, oeilM: 1.6 + (S.obsHeight || 0), soleil: calage.soleilMaintenant() });
    if (!r.ok) { note('Ombre : ' + r.message, 7000); return; }
    const avant = { h: S.headOff, p: S.pitchOff };
    calage.appliquerCalage(r.dh, 0); c.synchroniser();
    calage.consigner('ombre', avant, { azOmbre: Math.round(r.azOmbreDeg), longueurM: +r.longueurM.toFixed(1) });
    journal.info('calage', r.message); note(r.message, 7000);
  }
  /** Un geste sur l'image pendant que le mode est armé. @param {'down' | 'move' | 'up'} phase @param {number} x @param {number} y */
  function surPointeur(phase, x, y) {
    if (phase === 'down') { pied = { x, y }; ps.traitOmbre = { x0: x, y0: y, x1: x, y1: y }; return; }
    if (!pied) return;
    ps.traitOmbre = { x0: pied.x, y0: pied.y, x1: x, y1: y };
    if (phase === 'up') { const p = pied; armer(false); caler(p, { x, y }); }
  }
  $('btnShadow').addEventListener('click', () => armer(!actif));
  return { actif: () => actif, surPointeur };
}
