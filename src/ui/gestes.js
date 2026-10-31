// @ts-check
/**
 * Gestes sur l'image : glisser (cap, horizon), pincer (champ), toucher bref (pointage ou échelle).
 * Reçoit le contexte de la page (`c` : réglages, application, aides d'affichage, état partagé `ps`) ; ne lit ni n'écrit rien d'autre que ce contexte et le DOM.
 */
import { noterCalage } from '../entrees/capteurs.js';
import { RAD } from '../noyau/constantes.js';

/** @param {import('./contexte.js').Contexte} c @param {ReturnType<typeof import('./calage.js').installerCalage>} calage @param {ReturnType<typeof import('./fiches.js').installerFiches>} fiches */
export function installerGestes(c, calage, fiches) {
  const { S, fusion, ov, direct, note, sauver, synchroniser, vFov, ps } = c;
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
    const fh = (ps.W / 2) / Math.tan(vFov() / 2 * RAD);
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 8) drag.moved = true;
    const dh = Math.atan((e.clientX - drag.x) / fh) / RAD;
    S.headOff = direct ? drag.h - dh : (drag.h - dh + 360) % 360; S.pitchOff = drag.p + Math.atan((e.clientY - drag.y) / fh) / RAD;
  });
  ov.addEventListener('pointerup', (e) => {
    const etaitPincement = !!pinch; ptrs.delete(e.pointerId);
    if (etaitPincement) { if (ptrs.size < 2) { pinch = null; sauver(); } drag = null; return; }
    if (drag && !drag.moved && Date.now() - drag.t < 450) { S.headOff = drag.h; S.pitchOff = drag.p; if (calage.echelleActive()) calage.toucherEchelle(e.clientX, e.clientY); else if (calage.pointageActif()) { calage.definirModePointage(false); calage.pointerSur(e.clientX, e.clientY); } else { const r = ov.getBoundingClientRect(); fiches.ouvrirEn(e.clientX - r.left, e.clientY - r.top); } } else { sauver(); if (direct && drag && drag.moved) noterCalage(fusion, Date.now()); if (drag && drag.moved && ((direct && fusion.capteur) || ps.photoMode)) calage.consigner('glisser', { h: drag.h, p: drag.p }); } // calage récent : la boussole ne le défait pas
    drag = null;
  });
  ov.addEventListener('pointercancel', (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; drag = null; });
  return { enGeste: () => drag !== null };
}
