// @ts-check
/**
 * Suivi visuel WebXR (VEILLE-ANCRAGE.md, action E, ESSAI) : session `immersive-ar` (ARCore sur Chrome Android) avec superposition HTML (DOM overlay). La pose de la caméra vient du suivi visuel (image par image : les rotations
 * ne dérivent presque pas et les objets restent collés au décor) ; la boussole, le soleil, la lune et le recalage continu ne servent qu'à poser le nord UNE fois (le repère WebXR a un nord arbitraire). La pose passe par la même
 * fusion que le capteur relatif (quaternion → axes) : tout le calage existant s'applique tel quel. Périphérie : dépend de `navigator.xr` ; la conversion de repère est pure et testée.
 */
import { surQuaternion, signalerReouverture } from './capteurs.js';

/** Quaternion [x, y, z, w] de la rotation de +90° autour de X : passe du repère WebXR (x droite, y haut, −z devant) au repère Est / Nord / Haut (E = x, N = −z, Haut = y). */
const Q_XR_VERS_ENU = Object.freeze([Math.SQRT1_2, 0, 0, Math.SQRT1_2]);

/** Produit de deux quaternions [x, y, z, w] (a puis b appliqué en premier : a ⊗ b). @param {readonly number[]} a @param {readonly number[]} b @returns {number[]} */
const multiplier = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];

/**
 * Orientation de la caméra dans le repère Est / Nord / Haut, depuis le quaternion d'un `XRViewerPose` (repère « local » : y vers le haut, nord arbitraire).
 * @param {readonly number[]} qXr quaternion [x, y, z, w] @returns {number[]}
 */
export const quaternionXrVersEnu = (qXr) => multiplier(Q_XR_VERS_ENU, qXr);

/**
 * @param {{
 *   fenetre?: Window, fusion: import('./capteurs.js').Fusion,
 *   journal: {info: (m: string, msg: string, d?: unknown) => unknown, avert: (m: string, msg: string, d?: unknown) => unknown},
 *   racine: () => HTMLElement, surImage: (tMs: number) => void, surFin?: () => void, maintenant?: () => number,
 * }} o
 */
export function creerSuiviXr({ fenetre = window, fusion, journal, racine, surImage, surFin = () => {}, maintenant = Date.now }) {
  const xr = /** @type {any} */ (fenetre.navigator).xr;
  const etat = { actif: false, erreur: '', images: 0, depuis: 0, hz: 0, suivi: false };
  /** @type {any} */
  let session = null;
  /** Le navigateur propose-t-il une session de réalité augmentée ? @returns {Promise<boolean>} */
  async function disponible() {
    try { return !!xr && !!xr.isSessionSupported && (await xr.isSessionSupported('immersive-ar')); } catch { return false; }
  }
  /** Démarre la session (à appeler depuis un geste de l'utilisateur). Les erreurs sont gardées dans `etat.erreur`, jamais levées. */
  async function demarrer() {
    if (session) return;
    etat.erreur = '';
    try {
      if (!(await disponible())) throw new Error('réalité augmentée WebXR indisponible (Services Google Play pour la RA requis, page en HTTPS)');
      const s = await xr.requestSession('immersive-ar', { requiredFeatures: ['local'], optionalFeatures: ['dom-overlay'], domOverlay: { root: racine() } });
      const canevas = fenetre.document.createElement('canvas'), gl = /** @type {any} */ (canevas.getContext('webgl', { xrCompatible: true, alpha: true }));
      if (!gl) throw new Error('WebGL indisponible');
      if (gl.makeXRCompatible) await gl.makeXRCompatible();
      const Couche = /** @type {any} */ (fenetre).XRWebGLLayer;
      await s.updateRenderState({ baseLayer: new Couche(s, gl) });
      const reference = await s.requestReferenceSpace('local');
      session = s; etat.actif = true; etat.images = 0; etat.depuis = 0; fusion.suiviExterne = true; signalerReouverture(fusion); // le repère du suivi visuel est nouveau : le nord est refait d'après la boussole, une fois
      s.addEventListener('end', () => { session = null; etat.actif = false; etat.suivi = false; fusion.suiviExterne = false; signalerReouverture(fusion); journal.info('webxr', 'session terminée'); surFin(); });
      const image = (/** @type {number} */ t, /** @type {any} */ cadre) => {
        if (!session) return;
        session.requestAnimationFrame(image);
        const base = session.renderState.baseLayer;
        if (base) { gl.bindFramebuffer(gl.FRAMEBUFFER, base.framebuffer); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); } // le navigateur compose l'image de la caméra derrière : on ne dessine rien ici
        const pose = cadre.getViewerPose(reference);
        etat.suivi = !!pose;
        if (pose) { const o = pose.transform.orientation; surQuaternion(fusion, quaternionXrVersEnu([o.x, o.y, o.z, o.w]), 0, maintenant()); }
        mesurer(maintenant());
        surImage(t);
      };
      s.requestAnimationFrame(image);
      journal.info('webxr', 'session immersive-ar démarrée (suivi visuel)');
    } catch (e) { etat.erreur = e instanceof Error ? e.message : String(e); journal.avert('webxr', 'démarrage impossible : ' + etat.erreur); session = null; etat.actif = false; fusion.suiviExterne = false; }
  }
  /** Fréquence des images (Hz). @param {number} t */
  function mesurer(t) { etat.images++; if (!etat.depuis) etat.depuis = t; else if (t - etat.depuis >= 1000) { etat.hz = Math.round((etat.images * 1000) / (t - etat.depuis)); etat.images = 0; etat.depuis = t; } }
  async function arreter() { try { if (session) await session.end(); } catch { /* déjà terminée */ } }
  return { disponible, demarrer, arreter, etat: () => ({ ...etat }) };
}
