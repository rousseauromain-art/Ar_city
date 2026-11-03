// @ts-check
/**
 * Recalage continu sur le soleil et la lune (direct, case « Recalage continu » cochée) : toutes les 3 s, le disque de l'astre est cherché dans l'image ; quand deux détections concordent (calage/continu.js), le cap et l'horizon sont corrigés
 * d'un demi-pas, sans rien toucher. L'horloge de cadence est `performance.now()` (insensible à l'heure simulée des tests). Reçoit le contexte de la page (`c`), le calage (détection d'un astre) et les gestes (pas pendant un glisser).
 */
import { noterCalage } from '../entrees/capteurs.js';
import { decisionCalageContinu, HISTORIQUE_MAX } from '../calage/continu.js';
import { ecartAngle } from '../noyau/maths.js';

/** Cherche l'astre dans l'image : le soleil de jour, la lune quand le soleil est couché. @param {ReturnType<typeof import('./calage.js').installerCalage>} calage */
function detecterAstre(calage) {
  const sol = calage.evaluerSoleil();
  if (!sol.ok && sol.message === 'soleil couché') return { r: calage.evaluerLune(), nom: 'lune' };
  return { r: sol, nom: 'soleil' };
}

/** Période (ms) des détections. */
const PERIODE_MS = 3000;

/** @param {import('./contexte.js').Contexte} c @param {ReturnType<typeof import('./calage.js').installerCalage>} calage @param {ReturnType<typeof import('./gestes.js').installerGestes>} gestes */
export function installerCalageContinu(c, calage, gestes) {
  const { S, fusion, direct, ps, pose, imageSource, sauver, synchroniser, note, journal } = c;
  /** @type {import('../calage/continu.js').Detection[]} */
  let historique = [];
  let derniereMs = -Infinity, dernierTick = -Infinity, capPrecedent = /** @type {number | null} */ (null), tPrecedent = 0, cumulDeg = 0, astre = '';
  /** Vitesse de rotation du téléphone depuis le dernier tick (°/s). @param {number} maintenant */
  function rotationDegS(maintenant) {
    const cap = pose().capDeg, v = capPrecedent === null || maintenant <= tPrecedent ? 0 : Math.abs(ecartAngle(cap - capPrecedent)) / ((maintenant - tPrecedent) / 1000);
    capPrecedent = cap; tPrecedent = maintenant; return v;
  }
  /** À appeler à chaque image ; ne fait quelque chose que toutes les 3 s. */
  function surImage() {
    if (!direct || S.calageContinu !== true) { if (historique.length) historique = []; ps.continu.etat = S.calageContinu === true ? 'photo : sans objet' : 'éteint'; return; }
    const maintenant = performance.now();
    if (maintenant - dernierTick < PERIODE_MS) return;
    dernierTick = maintenant;
    const rot = rotationDegS(maintenant);
    if (document.hidden || !imageSource() || gestes.enGeste()) { ps.continu.etat = 'en attente (page cachée, pas d\'image ou geste en cours)'; return; }
    const { r, nom } = detecterAstre(calage);
    astre = nom;
    if (!r.ok) { historique = []; ps.continu.etat = `${nom} : ${r.message}`; return; }
    historique.push({ t: maintenant, dh: r.dh, dp: r.dp }); if (historique.length > HISTORIQUE_MAX) historique.shift();
    const d = decisionCalageContinu({ historique, derniereMs, maintenantMs: maintenant, cumulDeg, rotationDegS: rot });
    ps.continu.etat = d.pas ? `${nom} : pas appliqué` : `${nom} : ${d.raison}`;
    if (d.pas) appliquer(d.pas, maintenant);
  }
  /** @param {{dh: number, dp: number}} pas @param {number} maintenant */
  function appliquer(pas, maintenant) {
    const avant = { h: S.headOff, p: S.pitchOff };
    S.headOff += pas.dh; S.pitchOff += pas.dp; cumulDeg += pas.dh; derniereMs = maintenant; historique = [];
    noterCalage(fusion, Date.now()); sauver(); synchroniser();
    ps.continu.pas++; ps.continu.cumulDeg = cumulDeg; ps.continu.dernier = { dh: pas.dh, dp: pas.dp, astre, t: Date.now() };
    calage.consigner(astre === 'lune' ? 'auto continu lune' : 'auto continu soleil', avant);
    journal.info('calage', `recalage continu sur la ${astre === 'lune' ? 'lune' : 'soleil'} : cap ${pas.dh >= 0 ? '+' : ''}${pas.dh.toFixed(1)}°, horizon ${pas.dp >= 0 ? '+' : ''}${pas.dp.toFixed(1)}° (cumul ${cumulDeg.toFixed(1)}°)`);
    note(`Cap recalé sur ${astre === 'lune' ? 'la lune' : 'le soleil'} (${pas.dh >= 0 ? '+' : ''}${pas.dh.toFixed(1)}°)`, 2000);
  }
  /** Repart de zéro (case recochée). */
  const reinitialiser = () => { historique = []; derniereMs = -Infinity; cumulDeg = 0; ps.continu = etatContinuInitial(); };
  return { surImage, reinitialiser };
}

/** État du recalage continu pour le Diagnostic. */
export const etatContinuInitial = () => ({ etat: 'éteint', pas: 0, cumulDeg: 0, dernier: /** @type {null | {dh: number, dp: number, astre: string, t: number}} */ (null) });
