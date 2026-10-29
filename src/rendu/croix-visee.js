// @ts-check
/**
 * Croix de visée (réglage « croix » de la v1) : grande croix au centre de l'écran (l'axe de la caméra), graduée au degré (trait long tous les 5°), avec la lecture azimut / site.
 * On amène le site visé dans la croix : l'azimut et le site lus sont ceux à donner pour un pointage. Fonction pure (v1 : `draw`). Entrées : vue, polices, mesure de texte. Sortie : commandes.
 */
import { RAD } from '../noyau/constantes.js';
import { trait, remplissage, texte } from './commandes.js';
import { focalePx } from './projection.js';

/** @param {import('./projection.js').VueRendu} vue @param {{mesurerTexte: (police: string, texte: string) => number, familles: {mono: string}}} o @returns {import('./commandes.js').Commande[]} */
export function commandesCroix(vue, { mesurerTexte, familles }) {
  const W = vue.largeurPx, H = vue.hauteurPx, cx = W / 2, cy = H / 2, ppd = focalePx(vue) * Math.tan(1 * RAD), arm = Math.min(W, H) * 0.42, gap = 10;
  /** @type {import('./commandes.js').OperationChemin[]} */
  const croix = [['M', cx - arm, cy], ['L', cx - gap, cy], ['M', cx + gap, cy], ['L', cx + arm, cy], ['M', cx, cy - arm], ['L', cx, cy - gap], ['M', cx, cy + gap], ['L', cx, cy + arm]];
  for (let k = 1; k * ppd <= arm; k++) {
    const t = k % 5 ? 4 : 9, o = k * ppd;
    if (o < gap) continue;
    croix.push(['M', cx - o, cy - t], ['L', cx - o, cy + t], ['M', cx + o, cy - t], ['L', cx + o, cy + t], ['M', cx - t, cy - o], ['L', cx + t, cy - o], ['M', cx - t, cy + o], ['L', cx + t, cy + o]);
  }
  const az = ((vue.capDeg % 360) + 360) % 360, txt = `az ${az.toFixed(1)}° · site ${vue.inclinaisonDeg >= 0 ? '+' : ''}${vue.inclinaisonDeg.toFixed(1)}°`;
  const police = `600 12px ${familles.mono}`, tw = mesurerTexte(police, txt), tx = cx + gap + 4, ty = cy + gap + 16;
  const pastille = /** @type {import('./commandes.js').OperationChemin[]} */ ([['R', tx - 5, ty - 13, tw + 10, 18, 5]]);
  return [trait(croix, 'rgba(14,26,43,.75)', 4), trait(croix, '#FFD23F', 1.3), remplissage([['A', cx, cy, 2]], '#FFD23F'),
    remplissage(pastille, 'rgba(14,26,43,.88)'), trait(pastille, 'rgba(255,210,63,.7)', 1), texte(txt, tx, ty, police, '#FFF3C4')];
}
