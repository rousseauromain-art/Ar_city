// @ts-check
/**
 * Calage guidé en un seul bouton (« visez le soleil / la lune / ce repère ») : choisit la MEILLEURE cible pour caler ici et maintenant, et dit comment la viser. Pur : positions de l'astre, repères utilisables et pose sont fournis.
 * Ordre de préférence : le soleil (direction exacte), la lune (de nuit), un repère net (tour, clocher, dôme de hauteur connue, à moins de 20 km), sinon l'horizon (le relief). Les repères viennent de `pourquoiIgnore` (calage/banc.js) : ceux que « Caler auto » accepterait.
 */
import { ecartAngle } from '../noyau/maths.js';

/** Hauteur minimale (°) d'un astre pour le viser sans gêne. */
export const ASTRE_MIN_DEG = 3;
/** Marge (°) laissée au bord du champ pour dire « dans le champ ». */
export const MARGE_CHAMP_DEG = 5;

/** @typedef {{type: 'soleil' | 'lune' | 'repere' | 'relief', nom: string, azDeg: number, elDeg: number, distKm?: number}} Cible */
/** @typedef {{dansLeChamp: boolean, dCapDeg: number, dSiteDeg: number, texte: string}} Consigne */

/**
 * @param {{soleil: {azDeg: number, elDeg: number} | null, lune: {azDeg: number, elDeg: number} | null, repere: {nom: string, brg: number, dist: number} | null, capDeg: number}} e
 * `repere` : le repère utilisable le plus proche du cap actuel (déjà filtré), ou null. @returns {Cible}
 */
export function choisirCible({ soleil, lune, repere, capDeg }) {
  if (soleil && soleil.elDeg > ASTRE_MIN_DEG) return { type: 'soleil', nom: 'le soleil', azDeg: soleil.azDeg, elDeg: soleil.elDeg };
  if (lune && lune.elDeg > ASTRE_MIN_DEG) return { type: 'lune', nom: 'la lune', azDeg: lune.azDeg, elDeg: lune.elDeg };
  if (repere) return { type: 'repere', nom: repere.nom, azDeg: repere.brg, elDeg: 0, distKm: repere.dist };
  return { type: 'relief', nom: 'l\'horizon (mer ou ligne de crêtes)', azDeg: capDeg, elDeg: 0 };
}

/**
 * Le meilleur repère parmi les utilisables : le plus proche du cap actuel (on tourne le moins possible), puis le plus proche. @template {{brg: number, dist: number}} R @param {R[]} utilisables @param {number} capDeg @returns {R | null}
 */
export function meilleurRepere(utilisables, capDeg) {
  let meilleur = /** @type {R | null} */ (null), score = Infinity;
  for (const r of utilisables) { const s = Math.abs(ecartAngle(r.brg - capDeg)) + r.dist * 0.5; if (s < score) { score = s; meilleur = r; } }
  return meilleur;
}

/**
 * Comment viser la cible : écart de cap et de hauteur, « dans le champ » quand elle est à plus de 5° du bord, et la phrase à afficher.
 * @param {Cible} cible @param {{capDeg: number, inclinaisonDeg: number}} pose @param {{champHDeg: number, champVDeg: number}} champ @returns {Consigne}
 */
export function consigne(cible, pose, champ) {
  const dCapDeg = ecartAngle(cible.azDeg - pose.capDeg), dSiteDeg = cible.elDeg - pose.inclinaisonDeg;
  const dansLeChamp = Math.abs(dCapDeg) < champ.champHDeg / 2 - MARGE_CHAMP_DEG && Math.abs(dSiteDeg) < champ.champVDeg / 2 - MARGE_CHAMP_DEG;
  const etapes = [];
  if (Math.abs(dCapDeg) >= champ.champHDeg / 2 - MARGE_CHAMP_DEG) etapes.push(`tournez de ${Math.round(Math.abs(dCapDeg))}° vers la ${dCapDeg > 0 ? 'droite' : 'gauche'}`);
  if (Math.abs(dSiteDeg) >= champ.champVDeg / 2 - MARGE_CHAMP_DEG) etapes.push(`${dSiteDeg > 0 ? 'montez' : 'baissez'} de ${Math.round(Math.abs(dSiteDeg))}°`);
  const lieu = cible.type === 'repere' && cible.distKm !== undefined ? ` (à ${cible.distKm < 10 ? cible.distKm.toFixed(1) : Math.round(cible.distKm)} km)` : '';
  const texte = dansLeChamp ? `${majuscule(cible.nom)}${lieu} est dans le champ : ne bougez plus…` : `Visez ${cible.nom}${lieu} : ${etapes.join(' et ')}`;
  return { dansLeChamp, dCapDeg, dSiteDeg, texte };
}

/** @param {string} t */
const majuscule = (t) => t.charAt(0).toUpperCase() + t.slice(1);
