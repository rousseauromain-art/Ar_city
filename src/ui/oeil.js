// @ts-check
/**
 * Puce « œil » (hauteur de prise de vue) : correction, détail au toucher, Réestimer, altitude GPS.
 * Reçoit le contexte de la page (`c` : réglages, application, aides d'affichage, état partagé `ps`) ; ne lit ni n'écrit rien d'autre que ce contexte et le DOM.
 */
import { distanceEtCap } from '../noyau/geo.js';
import { ondulationGeoide } from '../noyau/geoide.js';
import { correctionDepuisGps, decisionOeilAuto } from '../scene/hauteur-oeil.js';

/** Au-delà de cette distance (km), un réglage à la main de la hauteur d'œil n'empêche plus le recalage automatique. */
const SAUT_KM = 3;

/** @param {import('./contexte.js').Contexte} c */
export function installerOeil(c) {
  const { S, app, entree, direct, $, note, sauver, synchroniser } = c;
  let minuteurOeil = 0;
  /** Android donne l'altitude GPS au-dessus de l'ellipsoïde WGS84 (49 m de trop en Bretagne) ; iOS, au niveau de la mer. On retranche donc l'ondulation du géoïde sur Android. */
  const ellipsoidal = /Android/i.test(typeof navigator === 'undefined' ? '' : navigator.userAgent || '');
  const ondulation = () => { const p = app.donnees().pos; return ellipsoidal && p ? ondulationGeoide(p.lat, p.lon) : 0; };
  /** Recalage automatique sur l'altitude GPS : suspendu dès qu'on règle la hauteur à la main, repris à « Altitude GPS », au changement de la case ou après un saut de position. */
  let manuel = false, derniereAutoMs = 0, correctionAuto = false, posManuel = /** @type {null | {lat: number, lon: number}} */ (null);
  /** Corrige la hauteur d'œil (curseur des réglages ou de la puce) : libellés tout de suite, relief recalculé au relâchement (400 ms sans mouvement). @param {number} m */
  const regleOeil = (/** @type {number} */ m, auto = false) => { if (!auto) { manuel = true; posManuel = app.donnees().pos; } correctionAuto = auto; S.obsHeight = m; synchroniser(); clearTimeout(minuteurOeil); minuteurOeil = window.setTimeout(() => { sauver(); app.corrigerHauteurOeil(S.obsHeight); }, 400); };
  $('obsH').addEventListener('input', (/** @type {any} */ e) => { regleOeil(+e.target.value); });
  // puce « œil » : la correction appliquée à l'altitude estimée (« œil +2 m ») ; un toucher ouvre le détail (sol, source, altitude de l'œil) et le curseur de correction
  const fmtOeil = (/** @type {number} */ v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v) + ' m';
  let minuteurPopOeil = 0; const refermerPopOeil = () => { clearTimeout(minuteurPopOeil); minuteurPopOeil = window.setTimeout(() => { $('eyePop').hidden = true; }, 6000); };
  $('eyeChip').addEventListener('click', () => { const p = $('eyePop'); p.hidden = !p.hidden; if (!p.hidden) refermerPopOeil(); });
  $('eyeQ').addEventListener('input', (/** @type {any} */ e) => { regleOeil(+e.target.value); refermerPopOeil(); });
  // Réestimer : correction remise à zéro, sol relu dans le relief ; Altitude GPS (direct) : la correction qui amène l'œil à l'altitude GPS du téléphone, si elle est assez précise
  $('eyeRe').addEventListener('click', () => { regleOeil(0); app.recharger({ terrain: true }); note('Hauteur d’œil réestimée d’après le relief', 4000); refermerPopOeil(); });
  $('eyeGps').addEventListener('click', () => {
    const t = /** @type {any} */ (app.donnees().terrain), g = entree ? entree.etat() : null, c = t && g ? correctionDepuisGps(g.altitudeM, g.precisionAltM, t.solM, ondulation()) : null;
    if (c === null) { note('Altitude GPS absente ou trop imprécise', 4000); return; }
    regleOeil(c); manuel = false; note(`Hauteur d’œil recalée sur l’altitude GPS (${Math.round(/** @type {number} */ (g && g.altitudeM))} m) : correction ${fmtOeil(c)}`, 5000); refermerPopOeil();
  });
  /** Recalage automatique (direct) : voir `decisionOeilAuto` (précision, hystérésis, délai). */
  function oeilAuto(/** @type {any} */ t, /** @type {any} */ gps) {
    if (!direct || S.oeilGps === false || !t || !gps) return;
    const pos = app.donnees().pos;
    if (manuel && pos && posManuel && distanceEtCap(posManuel, pos).distKm > SAUT_KM) manuel = false; // déplacement : l'ancien réglage à la main ne vaut plus
    const maintenant = Date.now(), c = decisionOeilAuto({ altitudeM: gps.altitudeM, precisionAltM: gps.precisionAltM, solM: t.solM, ondulationM: ondulation(), obsHeight: S.obsHeight, derniereMs: derniereAutoMs, maintenantMs: maintenant, manuel });
    if (c === null) return;
    derniereAutoMs = maintenant; regleOeil(c, true);
  }
  /** Reprend le recalage automatique (case recochée, saut de position). */
  const reprendreAuto = () => { manuel = false; derniereAutoMs = 0; };
  let derniereOeil = '';
  /** Met à jour la puce « œil », son détail et la ligne du réglage d'après le relief calculé ; sans relief, la puce disparaît. */
  function synchroOeil() {
    const t = /** @type {any} */ (app.donnees().terrain), gps = entree ? entree.etat() : null, gpsM = gps && gps.altitudeM !== null && gps.altitudeM !== undefined ? Math.round(gps.altitudeM) : null;
    oeilAuto(t, gps);
    const sansRelief = S.calculRelief === false || !t || t.solM === undefined, etatRelief = app.etat().etatRelief;
    const vue = sansRelief ? `sans|${S.calculRelief === false}|${etatRelief}|${S.obsHeight}` : `${t.solM}|${t.origine}|${t.h0}|${S.obsHeight}|${gpsM}|${gps && gps.precisionAltM}`;
    if (vue === derniereOeil) return; derniereOeil = vue;
    const chip = $('eyeChip'); chip.hidden = false; // la puce est toujours là : sans relief elle l'explique, le curseur reste utilisable (la correction s'appliquera dès que le relief sera calculé)
    if (sansRelief) {
      const raisonOeil = S.calculRelief === false ? 'relief désactivé (Réglages › Calculer le relief)' : etatRelief === 'indispo' ? 'relief indisponible (réseau ?)' : 'relief en cours de calcul';
      const texte = `Sol inconnu : ${raisonOeil} · correction ${fmtOeil(S.obsHeight)} (appliquée dès que le relief est calculé)`;
      chip.textContent = `œil ${S.obsHeight ? fmtOeil(S.obsHeight) : '?'}`; $('eyePopT').textContent = texte; $('eyeQ').value = String(S.obsHeight); $('eyeGps').hidden = true; $('obsHInfo').textContent = texte; return;
    }
    const gpsOk = correctionDepuisGps(gps && gps.altitudeM, gps && gps.precisionAltM, t.solM, ondulation()) !== null;
    $('eyeGps').hidden = !gpsOk;
    const detail = `Sol estimé ${Math.round(t.solM)} m (${t.origine}) · correction ${fmtOeil(S.obsHeight)} → œil à ${Math.round(t.h0)} m${gpsM !== null ? ` · altitude GPS ${gpsM} m${ondulation() ? ` − géoïde ${Math.round(ondulation())} m = ${gpsM - Math.round(ondulation())} m` : ''}${gps && gps.precisionAltM ? ` (±${Math.round(gps.precisionAltM)})` : ''}${gpsOk ? '' : ' (trop imprécise)'}` : ''}`;
    chip.textContent = `œil ${correctionAuto ? 'GPS ' : ''}${fmtOeil(S.obsHeight)}`; $('eyePopT').textContent = detail; $('eyeQ').value = String(S.obsHeight); $('obsHInfo').textContent = detail;
  }
  return { synchroOeil, regleOeil, reprendreAuto };
}
