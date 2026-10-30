// @ts-check
/**
 * Règle de la photo : d'après la silhouette RÉELLE lue sur l'image (limite ciel / non-ciel), un élément est « vu », « caché » ou « indéterminé ».
 * Entrées : colonnes lues { brg, a }, relèvement et angle du sommet de l'élément. Sortie : verdict. Fonction pure (v1 : `photoCheck`).
 * Réutilisée par tous les calques qui posent des noms (lieux, monuments). Dépend de : noyau/maths.js.
 */
import { ecartAngle } from '../noyau/maths.js';

/** @typedef {{brg: number, a: number}} ColonneCiel */
/** @typedef {{vis: boolean, state: 'vis' | 'hid' | 'unk', snap: number | null, sky: number}} VerdictPhoto */

/** Tolérance (°) : le sommet compte comme visible s'il dépasse la silhouette lue à ce point près. */
const PHOTO_TOL_DEG = 0.5;
/** Demi-fenêtre (°) autour de l'élément où l'on lit la silhouette. */
const PHOTO_FENETRE_DEG = 0.7;
/** Demi-fenêtre (°) où l'on cherche une pointe sur laquelle se caler. */
const PHOTO_CALAGE_DEG = 1.2;
/** Une silhouette qui dépasse le relief calculé de plus de ce nombre de degrés est formée par un objet PROCHE (bâtiment, arbre, mur). */
const PHOTO_ECART_OBJET_DEG = 0.5;

/**
 * 'vis' : le sommet dépasse la silhouette lue. 'hid' : il est sous une silhouette formée par un objet PROCHE. 'unk' : il est sous une silhouette
 * qui est le relief lointain (l'objet peut être visible devant les montagnes : la photo ne permet pas de trancher). null : hors de l'image lue.
 * @param {ColonneCiel[]} cols @param {number} relevementDeg @param {number} sommetDeg angle du sommet de l'élément
 * @param {((relevementDeg: number) => number | null) | null} angleRelief silhouette du relief calculé (null : relief désactivé ou absent)
 * @returns {VerdictPhoto | null}
 */
export function verifierSurPhoto(cols, relevementDeg, sommetDeg, angleRelief) {
  let mn = Infinity, dansFenetre = 0, toutEstObjet = true;
  /** @type {{dd: number, a: number} | null} */
  let best = null;
  /** @type {{dd: number, a: number}[]} */
  const proches = [];
  for (const col of cols) {
    const dd = ecartAngle(col.brg - relevementDeg);
    if (Math.abs(dd) <= PHOTO_FENETRE_DEG) {
      dansFenetre++;
      if (col.a < mn) mn = col.a;
      if (angleRelief) { const t = angleRelief(col.brg); if (t !== null && t !== undefined && col.a <= t + PHOTO_ECART_OBJET_DEG) toutEstObjet = false; }
    }
    if (Math.abs(dd) <= PHOTO_CALAGE_DEG) proches.push({ dd, a: col.a });
  }
  if (!dansFenetre) return null;
  const vis = sommetDeg >= mn - PHOTO_TOL_DEG, state = vis ? 'vis' : toutEstObjet ? 'hid' : 'unk';
  /** @type {number | null} */
  let snap = null;
  if (vis && proches.length >= 5) {
    for (const w of proches) if (!best || w.a > best.a) best = w;
    const max = /** @type {{dd: number, a: number}} */ (best).a;
    // pointe = colonnes au plus près du maximum ; on se cale sur son centre si elle est nettement plus haute que ses voisines
    const top = proches.filter((w) => w.a >= max - 0.3), low = proches.filter((w) => w.a < max - 1);
    if (top.length <= proches.length * 0.7 && low.length >= 2 && Math.abs(max - sommetDeg) < 2) snap = top.reduce((s, w) => s + w.dd, 0) / top.length;
  }
  return { vis, state, snap, sky: mn };
}
