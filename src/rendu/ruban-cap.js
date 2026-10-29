// @ts-check
/**
 * Ruban de cap (repère écran, posé APRÈS la scène, jamais pivoté par le roulis) : bandeau sombre sous la zone de sécurité, graduations tous les 5° (plus longues tous les 15°, 45°, 90°),
 * lettres cardinales, valeur du cap au centre. Fonction pure (v1 : `draw`, « ruban de cap »). Entrées : vue, hauteur de la zone de sécurité, polices. Sortie : commandes de dessin.
 */
import { trait, remplissage, texte } from './commandes.js';

/** Hauteur du bandeau sous la zone de sécurité (px). */
export const HAUTEUR_RUBAN_PX = 24;
const CARDINAUX = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];

/** @param {import('./projection.js').VueRendu} vue @param {{safeT: number, familles: {affichage: string, mono: string}}} o @returns {import('./commandes.js').Commande[]} */
export function commandesRuban(vue, { safeT, familles }) {
  const W = vue.largeurPx, rh = HAUTEUR_RUBAN_PX, top = safeT, ppd = W / vue.champDeg, cap = vue.capDeg, base = Math.round(cap);
  /** @type {import('./commandes.js').Commande[]} */
  const out = [remplissage([['RC', 0, 0, W, top + rh]], 'rgba(14,26,43,.78)'), remplissage([['RC', 0, top + rh, W, 1]], 'rgba(243,233,210,.25)')];
  for (let dd = -Math.ceil(vue.champDeg / 2) - 6; dd <= Math.ceil(vue.champDeg / 2) + 6; dd++) {
    const deg = base + dd, n = ((deg % 360) + 360) % 360;
    if (n % 5) continue;
    const x = W / 2 + (deg - cap) * ppd, carte = n % 45 === 0, len = n % 90 === 0 ? 11 : carte ? 9 : n % 15 === 0 ? 6 : 3;
    out.push(trait([['M', x, top + rh], ['L', x, top + rh - len]], carte ? 'rgba(243,233,210,.95)' : 'rgba(243,233,210,.5)', carte ? 1.5 : 1));
    if (carte) out.push(texte(CARDINAUX[n / 45], x, top + rh - len - 4, `700 11px ${familles.affichage}`, '#F3E9D2', { alignement: 'center' }));
  }
  out.push(remplissage([['RC', W / 2 - 1, top + rh - 14, 2, 14]], '#E0A526'), texte(`${Math.round(cap)}°`, W / 2, top + 16, `500 11px ${familles.mono}`, '#E0A526', { alignement: 'center' }));
  return out;
}
