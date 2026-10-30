// @ts-check
/**
 * CALAGE SUR LE SOLEIL : gratuit, sans IA, au degré près. La date, l'heure et la position donnent la direction exacte du soleil ; s'il est dans l'image (disque saturé, compact), le cap ET
 * l'horizon s'en déduisent d'un coup. En direct : heure du téléphone ; photo rejouée : heure de la prise de vue. Les messages de refus sont ceux de la v1.
 * Entrées : position, soleil calculé, pose, champ affiché, taille de l'écran, lecteur de pixels. Sortie : correction {dh, dp} ou refus. Reprend `sunAlign` de la v1. Dépend de : vision/soleil.js.
 */
import { RAD, SOLEIL_COUCHE_DEG } from '../noyau/constantes.js';
import { ecartAngle } from '../noyau/maths.js';
import { MARGE_SOLEIL_DEG, detecterTaches, candidatsSoleil, meilleurCandidat } from '../vision/soleil.js';

/** @typedef {import('../vision/soleil.js').Pixels} Pixels */
/** @typedef {{ok: true, dh: number, dp: number, soleil: {azDeg: number, elDeg: number}, n: number} | {ok: false, message: string}} ResultatSoleil */

/**
 * @param {{
 *   pos: {lat: number, lon: number} | null,
 *   soleil: {azDeg: number, elDeg: number} | null,
 *   pose: {capDeg: number, inclinaisonDeg: number, roulisDeg: number},
 *   champDeg: number,
 *   ecran: {largeurPx: number, hauteurPx: number},
 *   large?: boolean, astre?: 'soleil' | 'lune',
 *   lirePixels: (largeurPx: number) => Pixels | null,
 * }} e `large` : direction peu fiable (photo en portrait) ; `lirePixels(480)` n'est appelé qu'une fois les gardes passées
 * @returns {{ok: true, dh: number, dp: number, soleil: {azDeg: number, elDeg: number}, n: number} | {ok: false, message: string}}
 */
export function calerSurSoleil({ pos, soleil, pose, champDeg, ecran, large = false, astre = 'soleil', lirePixels }) {
  const lune = astre === 'lune';
  if (!pos) return { ok: false, message: 'position inconnue' };
  if (!soleil) return { ok: false, message: 'heure de la photo inconnue' };
  const fh = ecran.largeurPx / 2 / Math.tan((champDeg / 2) * RAD), demiChamp = Math.atan(ecran.largeurPx / 2 / fh) / RAD, demiHauteur = Math.atan(ecran.hauteurPx / 2 / fh) / RAD;
  if (soleil.elDeg < SOLEIL_COUCHE_DEG) return { ok: false, message: lune ? 'lune couchée' : 'soleil couché' };
  if (!large && (Math.abs(ecartAngle(soleil.azDeg - pose.capDeg)) > demiChamp + MARGE_SOLEIL_DEG || Math.abs(soleil.elDeg - pose.inclinaisonDeg) > demiHauteur + MARGE_SOLEIL_DEG)) return { ok: false, message: lune ? 'lune hors du champ' : 'soleil hors du champ' };
  const pixels = lirePixels(480);
  if (!pixels) return { ok: false, message: 'image illisible' };
  const taches = detecterTaches(pixels), candidats = candidatsSoleil(taches, { pixels, ecran, focalePx: fh, pose, soleil, large });
  const b = meilleurCandidat(candidats, large);
  if (!b) return { ok: false, message: lune ? 'pas de disque lunaire net sur l’image (nuages, lune trop pâle ?)' : taches.length ? 'pas de disque solaire net (halo trop étalé ou seulement des reflets)' : "pas de disque solaire net sur l'image (voilé, nuages ?)" };
  return { ok: true, dh: ecartAngle(soleil.azDeg - b.capDeg), dp: soleil.elDeg - b.siteDeg, soleil, n: candidats.length };
}
