// @ts-check
/**
 * Banc d'essai du calage automatique (v1 : `photoBench`, photo rejouée seulement). Référence = le calage actuel, fait à la main ; dix départs décalés ; « Caler auto » à chaque fois.
 * Réussi : cap à moins de 1,5° et champ à moins de 3° de la référence. Refusé : le calage n'a pas bougé (prudent). Faux : corrigé, mais à côté.
 * Asynchrone, sans DOM : tout ce qui touche la page passe par des fonctions fournies. Ne consigne rien dans le carnet (l'appelant coupe l'enregistrement pendant le banc) et rétablit la référence.
 */
import { ecartAngle } from '../noyau/maths.js';
import { RAD } from '../noyau/constantes.js';
import { LARGEUR_TYPE_M } from '../calques/monuments.js';

/** Départs de la v1 : [décalage de cap (°), décalage de champ (°)]. */
export const DEPARTS = Object.freeze(/** @type {[number, number][]} */ ([[-12, 0], [-8, 0], [-4, 0], [4, 0], [8, 0], [12, 0], [0, -6], [0, 6], [-6, -6], [6, 6]]));
/** Seuils du verdict, pause entre deux départs (laisse la scène se recalculer). */
export const REUSSI_CAP_DEG = 1.5, REUSSI_CHAMP_DEG = 3, BOUGE_DEG = 0.2, PAUSE_MS = 80, CHAMP_MIN_DEG = 20, CHAMP_MAX_DEG = 110;

/** @typedef {{h: number, p: number, c: number}} EtatCalage cap, horizon et champ du capteur */
/** @typedef {{dh: number, dc: number, eh: number, ec: number, message: string, verdict: 'réussi' | 'refusé' | 'faux'}} LigneBanc */

/**
 * Pourquoi le calage ignore un monument du champ (v1 : `why`). Chaîne vide : rien à reprocher.
 * @param {{dist: number, hidden?: boolean, htWd?: number | null, htOsm?: number | null, type?: string, far?: boolean}} c @param {boolean} reliefActif relief actif ET disponible
 */
export function pourquoiIgnore(c, reliefActif) {
  return c.dist < 0.15 ? 'trop proche (< 150 m : position trop imprécise)' : c.dist > 20 ? 'trop loin' : reliefActif && c.hidden ? 'caché par le relief'
    : !(c.htWd || c.htOsm || /^(tour|clocher|dome)$/.test(c.type || '')) ? 'ni tour, ni clocher, ni dôme, hauteur inconnue'
      : Math.atan2((LARGEUR_TYPE_M[c.type || ''] || 20) / 2, c.dist * 1000) / RAD >= 1.5 ? 'trop large vu d\'ici (pas une pointe)' : c.far ? 'hors de portée' : '';
}

/**
 * @template R
 * @param {object} e
 * @param {EtatCalage} e.reference calage actuel à la main
 * @param {readonly (readonly [number, number])[]} [e.departs]
 * @param {(h: number, p: number, c: number) => void} e.appliquer pose cap, horizon et champ du capteur (et laisse la scène se recalculer)
 * @param {() => Promise<string>} e.calerAuto « Caler auto » : applique le résultat et renvoie le message
 * @param {() => EtatCalage} e.lireEtat calage après « Caler auto »
 * @param {(dh: number, dc: number) => void} [e.surDepart] avant chaque départ (texte d'avancement)
 * @param {(ms: number) => Promise<void>} [e.pause]
 * @returns {Promise<{lignes: LigneBanc[], synthese: {reussis: number, refuses: number, faux: number}, reference: EtatCalage}>}
 */
export async function executerBanc({ reference, departs = DEPARTS, appliquer, calerAuto, lireEtat, surDepart = () => {}, pause = (ms) => new Promise((ok) => setTimeout(ok, ms)) }) {
  const ref = { ...reference }, lignes = /** @type {LigneBanc[]} */ ([]);
  try {
    for (const [dh, dc] of departs) {
      surDepart(dh, dc);
      appliquer(ref.h + dh, ref.p, Math.max(CHAMP_MIN_DEG, Math.min(CHAMP_MAX_DEG, ref.c + dc)));
      await pause(PAUSE_MS);
      const message = await calerAuto(), e = lireEtat(), eh = ecartAngle(e.h - ref.h), ec = e.c - ref.c, bouge = Math.abs(eh - dh) > BOUGE_DEG || Math.abs(ec - dc) > BOUGE_DEG;
      lignes.push({ dh, dc, eh, ec, message, verdict: Math.abs(eh) < REUSSI_CAP_DEG && Math.abs(ec) < REUSSI_CHAMP_DEG ? 'réussi' : !bouge ? 'refusé' : 'faux' });
    }
  } finally { appliquer(ref.h, ref.p, ref.c); }
  const n = (/** @type {string} */ v) => lignes.filter((l) => l.verdict === v).length;
  return { lignes, synthese: { reussis: n('réussi'), refuses: n('refusé'), faux: n('faux') }, reference: ref };
}

/** Phrase de synthèse (v1 : « 6 réussi(s), 3 refusé(s), 1 faux sur 10 »). @param {{reussis: number, refuses: number, faux: number}} s @param {number} total */
export const texteSynthese = (s, total) => `${s.reussis} réussi(s), ${s.refuses} refusé(s), ${s.faux} faux sur ${total}`;
