// @ts-check
/**
 * Position par les toits (essai, direct) : après un calage du cap sur les toits, la position est corrigée (grille de ±20 m autour de la position nettoyée, calage/position-toits.js, dans un Worker). Réglage `positionToits`
 * (décoché par défaut). Jamais en photo rejouée. La position corrigée est gardée en marchant (scene/pas.js) ; le GPS ne reprend la main que s'il s'en écarte durablement.
 * Reçoit le contexte de la page (`c`) ; ne lit ni n'écrit rien d'autre que ce contexte et le DOM.
 */
import { tableRelief } from '../calage/horizon.js';
import { RAD } from '../noyau/constantes.js';

/** @param {import('./contexte.js').Contexte} c @returns {(r: {ptsToits?: import('../calage/horizon.js').PointHorizon[]}) => Promise<string>} renvoie le complément du message de calage (vide si rien n'est corrigé) */
export function installerPositionToits(c) {
  const { S, app, direct, pose, vFov, ps, positionPropre, calculerPositionToits, journal } = c;
  return async (r) => {
    const d = app.donnees();
    if (!direct || S.positionToits !== true || !r.ptsToits || !d.pos || !(d.batiments || []).length) return '';
    try {
      const po = pose(), fh = (ps.W / 2) / Math.tan((vFov() / 2) * RAD), terrain = d.terrain;
      const res = await calculerPositionToits({ pos: d.pos, batiments: d.batiments || [], oeilRelM: 1.6 + (S.obsHeight || 0), h0: terrain ? terrain.h0 : null, pts: r.ptsToits, pose: po, ecran: { largeurPx: ps.W, hauteurPx: ps.H }, fh, reliefTab: terrain ? tableRelief(terrain.pm) : null });
      if (!res.ok) { journal.info('calage', 'position par les toits : ' + res.raison); return ` · position inchangée (${res.raison})`; }
      positionPropre.imposer(res.pos, 'toits');
      return ` · position corrigée par les toits (${Math.round(res.ecartM)} m)`;
    } catch (e) { journal.avert('calage', 'position par les toits impossible', e); return ''; }
  };
}
