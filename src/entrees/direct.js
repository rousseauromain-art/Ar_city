// @ts-check
/**
 * ENTRÉE « DIRECT » (partie navigateur) : caméra arrière, GPS et capteurs d'orientation. Toute la logique de cap est dans `capteurs.js` (pure) ; ici on branche les événements du navigateur
 * et on rattrape les pannes : la caméra est libérée quand la page passe en arrière-plan (le navigateur coupe le flux de toute façon) puis redemandée au retour, sinon l'image reste figée.
 * Entrées : élément `<video>`, fusion des capteurs, rappel de position. Sortie : contrôleur { demarrer, arreter, etat, flux }. Reprend `startCamera`, `#go` et les écouteurs de la v1.
 * Dépend de : entrees/capteurs.js.
 */
import { surOrientation } from './capteurs.js';

/**
 * @param {{
 *   video: HTMLVideoElement,
 *   fusion: import('./capteurs.js').Fusion,
 *   journal: {info: (m: string, msg: string, d?: unknown) => unknown, avert: (m: string, msg: string, d?: unknown) => unknown},
 *   surPosition: (p: {lat: number, lon: number, precisionM: number}) => void,
 *   positionSimulee?: () => boolean,
 *   maintenant?: () => number,
 *   fenetre?: Window,
 * }} o
 */
export function creerEntreeDirecte({ video, fusion, journal, surPosition, positionSimulee = () => false, maintenant = Date.now, fenetre = window }) {
  /** @type {MediaStream | null} */
  let flux = null;
  let demarre = false, enCours = false, erreurCamera = '', gpsErreur = '', precisionM = 0;
  /** @type {[number, number, number] | null} */
  let derniereGps = null;
  const doc = fenetre.document;

  function arreterCamera() {
    if (flux) { flux.getTracks().forEach((t) => { try { t.stop(); } catch { /* piste déjà arrêtée */ } }); flux = null; }
    video.srcObject = null;
  }
  const cameraVivante = () => { const t = flux && flux.getVideoTracks()[0]; return !!(t && t.readyState === 'live' && !video.paused); };

  async function demarrerCamera() {
    if (enCours) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { erreurCamera = 'Caméra indisponible : ouvrez la page en HTTPS'; return; }
    enCours = true;
    try {
      arreterCamera();
      const st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      flux = st; video.srcObject = st; await video.play(); erreurCamera = '';
      const piste = st.getVideoTracks()[0];
      if (piste) piste.addEventListener('ended', () => { if (demarre && !doc.hidden && flux === st) demarrerCamera(); });
    } catch (e) { erreurCamera = 'Caméra refusée ou indisponible'; journal.avert('direct', erreurCamera, e); }
    enCours = false;
  }

  /** @param {DeviceOrientationEvent} e @param {boolean} absolu */
  function surMesure(e, absolu) {
    const angle = (fenetre.screen.orientation && fenetre.screen.orientation.angle) ?? /** @type {any} */ (fenetre).orientation ?? 0;
    const r = surOrientation(fusion, { alpha: e.alpha, beta: e.beta, gamma: e.gamma, webkitCompassHeading: /** @type {any} */ (e).webkitCompassHeading, angleEcran: angle }, absolu, maintenant());
    if (r.reinitialise) journal.avert('cap', 'gyroscope et boussole en désaccord de plus de 40° : repère du gyroscope réinitialisé, retour à la boussole');
  }

  return {
    /** À appeler depuis un geste de l'utilisateur (permission d'orientation d'iOS, caméra, position). */
    async demarrer() {
      try { const D = /** @type {any} */ (fenetre).DeviceOrientationEvent; if (D && typeof D.requestPermission === 'function') await D.requestPermission(); } catch { /* permission refusée : la boussole manquera */ }
      demarre = true;
      await demarrerCamera();
      if (navigator.geolocation) {
        navigator.geolocation.watchPosition((p) => {
          derniereGps = [p.coords.latitude, p.coords.longitude, p.coords.accuracy]; precisionM = p.coords.accuracy;
          if (positionSimulee()) return;
          surPosition({ lat: p.coords.latitude, lon: p.coords.longitude, precisionM: p.coords.accuracy });
        }, (err) => { erreurCamera = erreurCamera || ''; journal.avert('direct', 'GPS refusé : ' + err.message); gpsErreur = 'GPS refusé : ' + err.message; }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
      } else gpsErreur = 'GPS indisponible';
      fenetre.addEventListener('deviceorientationabsolute', (e) => surMesure(/** @type {DeviceOrientationEvent} */ (e), true));
      fenetre.addEventListener('deviceorientation', (e) => surMesure(/** @type {DeviceOrientationEvent} */ (e), /** @type {DeviceOrientationEvent} */ (e).absolute === true));
      doc.addEventListener('visibilitychange', () => { if (!demarre) return; if (doc.hidden) arreterCamera(); else if (!cameraVivante()) demarrerCamera(); });
      fenetre.addEventListener('pageshow', (e) => { if (demarre && /** @type {PageTransitionEvent} */ (e).persisted && !cameraVivante()) demarrerCamera(); });
      fenetre.addEventListener('focus', () => { if (demarre && !doc.hidden && !cameraVivante()) demarrerCamera(); });
    },
    arreter: arreterCamera,
    /** Dernière position GPS brute (pour revenir de la position simulée). */
    derniereGps: () => derniereGps,
    etat: () => ({ demarre, cameraOk: cameraVivante(), erreurCamera, gpsErreur, precisionM }),
    /** Dimensions de l'image de la caméra, ou null tant qu'elle n'est pas prête. @returns {{largeurPx: number, hauteurPx: number} | null} */
    flux: () => (video.videoWidth ? { largeurPx: video.videoWidth, hauteurPx: video.videoHeight } : null),
  };
}
