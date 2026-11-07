// @ts-check
/**
 * ENTRÉE « DIRECT » (partie navigateur) : caméra arrière, GPS et capteurs d'orientation. Toute la logique de cap est dans `capteurs.js` (pure) ; ici on branche les événements du navigateur
 * et on rattrape les pannes : la caméra est libérée quand la page passe en arrière-plan (le navigateur coupe le flux de toute façon) puis redemandée au retour, sinon l'image reste figée.
 * Entrées : élément `<video>`, fusion des capteurs, rappel de position. Sortie : contrôleur { demarrer, arreter, etat, flux }. Reprend `startCamera`, `#go` et les écouteurs de la v1.
 * Dépend de : entrees/capteurs.js.
 */
import { surOrientation, surQuaternion, mesuresFusion, signalerReouverture } from './capteurs.js';

/** Durée (ms) des mesures d'altitude GPS gardées. */
const HISTORIQUE_ALTITUDES_MS = 60000;

/**
 * @param {{
 *   video: HTMLVideoElement,
 *   fusion: import('./capteurs.js').Fusion,
 *   journal: {info: (m: string, msg: string, d?: unknown) => unknown, avert: (m: string, msg: string, d?: unknown) => unknown},
 *   surPosition: (p: {lat: number, lon: number, precisionM: number, altitudeM: number | null, precisionAltM: number | null}) => void,
 *   surRetourBoussole?: (mesures: ReturnType<typeof mesuresFusion>) => void,
 *   positionSimulee?: () => boolean,
 *   capteurRelatif?: () => boolean,
 *   maintenant?: () => number,
 *   fenetre?: Window,
 * }} o
 */
export function creerEntreeDirecte({ video, fusion, journal, surPosition, surRetourBoussole, positionSimulee = () => false, capteurRelatif = () => false, maintenant = Date.now, fenetre = window }) {
  /** @type {MediaStream | null} */
  let flux = null;
  let demarre = false, suspendu = false, enCours = false, erreurCamera = '', gpsErreur = '', precisionM = 0;
  /** @type {{altitudeM: number | null, precisionAltM: number | null}} */
  let altitudeGps = { altitudeM: null, precisionAltM: null };
  /** Mesures d'altitude GPS des 60 dernières secondes (la hauteur d'œil n'en tire une proposition qu'avec la médiane d'au moins 10 mesures). @type {{t: number, altitudeM: number, precisionAltM: number | null}[]} */
  const altitudes = [];
  /** Vitesse du GPS (m/s, null si inconnue) : en voiture, la boussole est faussée par la carrosserie. */
  let vitesseMs = /** @type {number | null} */ (null);
  /** @type {[number, number, number] | null} */
  let derniereGps = null;
  const doc = fenetre.document;

  function arreterCamera() {
    if (flux) { flux.getTracks().forEach((t) => { try { t.stop(); } catch { /* piste déjà arrêtée */ } }); flux = null; }
    video.srcObject = null;
  }
  const cameraVivante = () => { const t = flux && flux.getVideoTracks()[0]; return !!(t && t.readyState === 'live' && !video.paused); };

  /** Appli ou caméra rouverte : le repère du gyroscope a pu être réinitialisé (retour à la boussole, une fois), puis la caméra repart. */
  function rouvrir() { signalerReouverture(fusion); journal.info('direct', 'réouverture de la caméra : repère du gyroscope à vérifier'); demarrerCamera(); }
  async function demarrerCamera() {
    if (enCours) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { erreurCamera = 'Caméra indisponible : ouvrez la page en HTTPS'; return; }
    enCours = true;
    try {
      arreterCamera();
      const st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      flux = st; video.srcObject = st; await video.play(); erreurCamera = '';
      const piste = st.getVideoTracks()[0];
      if (piste) piste.addEventListener('ended', () => { if (demarre && !suspendu && !doc.hidden && flux === st) rouvrir(); });
    } catch (e) { erreurCamera = 'Caméra refusée ou indisponible'; journal.avert('direct', erreurCamera, e); }
    enCours = false;
  }

  /** Capteur d'orientation relatif (quaternion, 60 Hz) : actif quand la case « essai » est cochée et que le navigateur le propose ; sinon `deviceorientation` (angles). */
  const capteur = { sonde: /** @type {any} */ (null), actif: false, erreur: '', lectures: 0, depuis: 0, hz: 0 };
  const angleEcran = () => (fenetre.screen.orientation && fenetre.screen.orientation.angle) ?? /** @type {any} */ (fenetre).orientation ?? 0;
  function arreterCapteurRelatif() { try { if (capteur.sonde) capteur.sonde.stop(); } catch { /* déjà arrêté */ } capteur.sonde = null; capteur.actif = false; }
  /** @param {ReturnType<typeof surOrientation>} r */
  function traiter(r) {
    if (r.reinitialise) {
      const m = mesuresFusion(fusion, maintenant());
      journal.avert('cap', r.cause === 'reouverture' ? 'appli ou caméra rouverte : repère du gyroscope réinitialisé, retour à la boussole' : 'saut instantané du gyroscope (plus de 40° en une mesure) : repère réinitialisé, retour à la boussole', m);
      if (surRetourBoussole) surRetourBoussole(m);
    }
    if (r.perturbation === 'debut') journal.avert('cap', 'boussole perturbée (plus de 40° d\'écart avec le gyroscope) : ignorée, le cap suit le gyroscope et le calage tient', mesuresFusion(fusion, maintenant()));
    else if (r.perturbation === 'fin') journal.info('cap', 'boussole de nouveau d\'accord avec le gyroscope');
  }
  /** Une lecture du capteur relatif : fréquence mesurée, puis la fusion. @param {any} s */
  function lecture(s) {
    const t = maintenant();
    if (!capteur.actif) { capteur.actif = true; capteur.erreur = ''; signalerReouverture(fusion); journal.info('direct', 'capteur d\'orientation relatif actif (quaternion, 60 Hz)'); }
    capteur.lectures++;
    if (!capteur.depuis) capteur.depuis = t; else if (t - capteur.depuis >= 1000) { capteur.hz = Math.round((capteur.lectures * 1000) / (t - capteur.depuis)); capteur.lectures = 0; capteur.depuis = t; }
    if (s.quaternion) traiter(surQuaternion(fusion, s.quaternion, angleEcran(), t));
  }
  /** Démarre ou arrête le capteur relatif selon la case ; repli propre sur `deviceorientation` en cas d'absence ou d'erreur (permission, capteur manquant). */
  function synchroniserCapteurRelatif() {
    if (!capteurRelatif()) { if (capteur.sonde) { arreterCapteurRelatif(); signalerReouverture(fusion); journal.info('direct', 'capteur relatif arrêté : retour à deviceorientation'); } capteur.erreur = ''; return; }
    if (capteur.sonde) return;
    const Classe = /** @type {any} */ (fenetre).RelativeOrientationSensor;
    if (!Classe) { capteur.erreur = 'RelativeOrientationSensor indisponible (navigateur ou page non HTTPS) : deviceorientation'; journal.avert('direct', capteur.erreur); return; }
    try {
      const s = new Classe({ frequency: 60, referenceFrame: 'device' });
      s.addEventListener('reading', () => lecture(s));
      s.addEventListener('error', (/** @type {any} */ ev) => { capteur.erreur = `capteur relatif refusé ou absent (${(ev.error && ev.error.name) || 'erreur'}) : deviceorientation`; journal.avert('direct', capteur.erreur); arreterCapteurRelatif(); });
      capteur.sonde = s; s.start();
    } catch (e) { capteur.erreur = 'capteur relatif impossible : ' + (e instanceof Error ? e.message : String(e)); journal.avert('direct', capteur.erreur); capteur.sonde = null; }
  }

  /** @param {DeviceOrientationEvent} e @param {boolean} absolu */
  function surMesure(e, absolu) {
    if (!absolu && capteur.actif) return; // le capteur relatif (quaternion) remplace les mesures relatives de deviceorientation
    traiter(surOrientation(fusion, { alpha: e.alpha, beta: e.beta, gamma: e.gamma, webkitCompassHeading: /** @type {any} */ (e).webkitCompassHeading, angleEcran: angleEcran() }, absolu, maintenant()));
  }

  let capteursBranches = false;
  /** Écouteurs d'orientation (une seule fois), branchés dès la création comme dans la v1 : quand on touche « Ouvrir la caméra », le gyroscope est chaud et la boussole apprise. */
  function brancherCapteurs() {
    if (capteursBranches) return;
    capteursBranches = true;
    fenetre.addEventListener('deviceorientationabsolute', (e) => surMesure(/** @type {DeviceOrientationEvent} */ (e), true));
    fenetre.addEventListener('deviceorientation', (e) => surMesure(/** @type {DeviceOrientationEvent} */ (e), /** @type {DeviceOrientationEvent} */ (e).absolute === true));
  }
  brancherCapteurs(); // toujours, comme la v1 : sans permission accordée les événements ne viennent simplement pas (iOS), et Chrome expose lui aussi `requestPermission`

  return {
    /** À appeler depuis un geste de l'utilisateur (permission d'orientation d'iOS, caméra, position). */
    async demarrer() {
      try { const D = /** @type {any} */ (fenetre).DeviceOrientationEvent; if (D && typeof D.requestPermission === 'function') await D.requestPermission(); } catch { /* permission refusée : la boussole manquera */ }
      demarre = true;
      await demarrerCamera();
      if (navigator.geolocation) {
        navigator.geolocation.watchPosition((p) => {
          derniereGps = [p.coords.latitude, p.coords.longitude, p.coords.accuracy]; precisionM = p.coords.accuracy;
          altitudeGps = { altitudeM: p.coords.altitude, precisionAltM: p.coords.altitudeAccuracy };
          if (typeof p.coords.altitude === 'number' && Number.isFinite(p.coords.altitude)) { const t = maintenant(); altitudes.push({ t, altitudeM: p.coords.altitude, precisionAltM: typeof p.coords.altitudeAccuracy === 'number' ? p.coords.altitudeAccuracy : null }); while (altitudes.length && t - altitudes[0].t > HISTORIQUE_ALTITUDES_MS) altitudes.shift(); } vitesseMs = typeof p.coords.speed === 'number' && Number.isFinite(p.coords.speed) ? p.coords.speed : null;
          if (positionSimulee()) return;
          surPosition({ lat: p.coords.latitude, lon: p.coords.longitude, precisionM: p.coords.accuracy, ...altitudeGps });
        }, (err) => { erreurCamera = erreurCamera || ''; journal.avert('direct', 'GPS refusé : ' + err.message); gpsErreur = 'GPS refusé : ' + err.message; }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
      } else gpsErreur = 'GPS indisponible';
      doc.addEventListener('visibilitychange', () => { if (!demarre || suspendu) return; if (doc.hidden) arreterCamera(); else { signalerReouverture(fusion); if (!cameraVivante()) demarrerCamera(); } }); // retour au premier plan : le repère du gyroscope a pu être réinitialisé
      fenetre.addEventListener('pageshow', (e) => { if (demarre && !suspendu && /** @type {PageTransitionEvent} */ (e).persisted) { signalerReouverture(fusion); if (!cameraVivante()) demarrerCamera(); } });
      fenetre.addEventListener('focus', () => { if (demarre && !suspendu && !doc.hidden && !cameraVivante()) rouvrir(); });
    },
    arreter: arreterCamera,
    /** Libère la caméra pour une session WebXR (le navigateur la veut pour lui) : aucune relance automatique tant que la reprise n'est pas demandée. */
    suspendreCamera() { suspendu = true; arreterCamera(); journal.info('direct', 'caméra libérée pour la session WebXR'); },
    /** Fin de la session WebXR : la caméra repart (le repère du gyroscope est refait par la fin de session). */
    async reprendreCamera() { suspendu = false; if (demarre) await demarrerCamera(); },
    /** Dernière position GPS brute (pour revenir de la position simulée). */
    derniereGps: () => derniereGps,
    /** Active ou coupe le capteur relatif selon la case « capteur relatif (essai) ». */
    synchroniserCapteurRelatif,
    etat: () => ({ demarre, cameraOk: cameraVivante(), erreurCamera, gpsErreur, precisionM, vitesseMs, ...altitudeGps, altitudes: altitudes.slice(), sourceRelative: capteur.actif ? 'quaternion 60 Hz' : 'deviceorientation', hzRelatif: capteur.actif ? capteur.hz : 0, erreurCapteurRelatif: capteur.erreur }),
    /** Dimensions de l'image de la caméra, ou null tant qu'elle n'est pas prête. @returns {{largeurPx: number, hauteurPx: number} | null} */
    flux: () => (video.videoWidth ? { largeurPx: video.videoWidth, hauteurPx: video.videoHeight } : null),
  };
}
