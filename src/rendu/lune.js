// @ts-check
/**
 * Symbole de la lune : disque argenté et son relèvement (« lune az° · site° · NN % »), posés sur la position CALCULÉE de la lune (date, heure, position, parallaxe comprise), comme le soleil.
 * On voit tout de suite si le cap est juste, de jour comme de nuit. Absent sous l'horizon (−1°), hors du champ et hors de l'écran. Le pourcentage est la fraction éclairée du disque.
 * Entrées : vue, position de la lune, fraction éclairée. Sortie : commandes de dessin. Dépend de : projection.js, commandes.js.
 */
import { trait, remplissage, texte } from './commandes.js';
import { focalePx } from './projection.js';
import { RAD } from '../noyau/constantes.js';
import { ecartAngle } from '../noyau/maths.js';

/**
 * @param {import('./projection.js').VueRendu} vue @param {{azDeg: number, elDeg: number} | null} lune @param {number} fractionEclairee 0 à 1
 * @param {{familles: {mono: string}, jointure?: 'miter' | 'round' | 'bevel', extremite?: 'butt' | 'round' | 'square'}} o
 * @returns {import('./commandes.js').Commande[]}
 */
export function commandesLune(vue, lune, fractionEclairee, { familles, jointure, extremite }) {
  if (!lune || lune.elDeg <= -1) return [];
  const dB = ecartAngle(lune.azDeg - vue.capDeg);
  if (Math.abs(dB) >= Math.min(80, vue.champDeg * 0.8)) return [];
  const fh = focalePx(vue), x = vue.largeurPx / 2 + fh * Math.tan(dB * RAD), y = vue.hauteurPx / 2 + fh * Math.tan((vue.inclinaisonDeg - lune.elDeg) * RAD);
  if (!(x > -30 && x < vue.largeurPx + 30 && y > -30 && y < vue.hauteurPx + 30)) return [];
  /** @type {import('./commandes.js').OperationChemin[]} */
  const disque = [['A', x, y, 9]];
  const style = { jointure, extremite }, pct = Math.round(fractionEclairee * 100);
  const t = `lune ${lune.azDeg.toFixed(1)}° · ${lune.elDeg.toFixed(1)}° · ${pct} %`;
  return [remplissage(disque, `rgba(205,220,240,${(0.25 + 0.6 * fractionEclairee).toFixed(2)})`), trait(disque, 'rgba(14,26,43,.85)', 4, style), trait(disque, '#CFE0F5', 1.8, style),
    texte(t, x + 16, y + 4, `600 11px ${familles.mono}`, '#CFE0F5', { contour: { couleur: 'rgba(14,26,43,.9)', largeur: 3, jointure, extremite } })];
}
