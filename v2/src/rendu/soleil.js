// @ts-check
/**
 * Symbole du soleil : cercle et huit rayons (halo sombre puis or) et son relèvement, posés sur la position CALCULÉE du soleil (date, heure et position). En photo rejouée c'est
 * la réponse de référence, indépendante de la boussole : on voit tout de suite si le cap est juste. Absent sous l'horizon (−1°), hors du champ et hors de l'écran.
 * Entrées : vue, position du soleil. Sortie : commandes de dessin. Reprend le dernier bloc de `draw()` de la v1. Dépend de : projection.js, commandes.js.
 */
import { trait, texte } from '../noyau/commandes.js';
import { focalePx } from '../noyau/projection.js';
import { RAD } from '../noyau/constantes.js';
import { ecartAngle } from '../noyau/maths.js';

/**
 * @param {import('../noyau/projection.js').VueRendu} vue @param {{azDeg: number, elDeg: number} | null} soleil
 * @param {{familles: {mono: string}, jointure?: 'miter' | 'round' | 'bevel', extremite?: 'butt' | 'round' | 'square'}} o jointure et extrémité héritées du contexte de la v1 à cet endroit de l'image
 * @returns {import('../noyau/commandes.js').Commande[]}
 */
export function commandesSoleil(vue, soleil, { familles, jointure, extremite }) {
  if (!soleil || soleil.elDeg <= -1) return [];
  const dB = ecartAngle(soleil.azDeg - vue.capDeg);
  if (Math.abs(dB) >= Math.min(80, vue.champDeg * 0.8)) return [];
  const fh = focalePx(vue), x = vue.largeurPx / 2 + fh * Math.tan(dB * RAD), y = vue.hauteurPx / 2 + fh * Math.tan((vue.inclinaisonDeg - soleil.elDeg) * RAD);
  if (!(x > -30 && x < vue.largeurPx + 30 && y > -30 && y < vue.hauteurPx + 30)) return [];
  /** @type {import('../noyau/commandes.js').OperationChemin[]} */
  const chemin = [['A', x, y, 9]];
  for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4; chemin.push(['M', x + Math.cos(a) * 13, y + Math.sin(a) * 13], ['L', x + Math.cos(a) * 18, y + Math.sin(a) * 18]); }
  const style = { jointure, extremite };
  const t = `soleil ${soleil.azDeg.toFixed(1)}° · ${soleil.elDeg.toFixed(1)}°`;
  return [trait(chemin, 'rgba(14,26,43,.85)', 4, style), trait(chemin, '#FFD23F', 1.8, style),
    texte(t, x + 22, y + 4, `600 11px ${familles.mono}`, '#FFD23F', { contour: { couleur: 'rgba(14,26,43,.9)', largeur: 3, jointure, extremite } })];
}
