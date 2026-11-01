// @ts-check
/**
 * Puce « œil » (hauteur de prise de vue). Par défaut, comme dans la v1, l'œil est au sol du relief fin + 1,6 m + la correction réglée à la main. Le GPS PROPOSE (fenêtre de la puce : « GPS : +X m (±Y m) » et « Appliquer »)
 * quand la médiane de ses mesures s'écarte du sol d'au moins 10 m avec une précision de 10 m au plus (scene/oeil-gps.js) ; la case « Hauteur d'œil d'après l'altitude GPS » applique la même proposition toute seule (au plus toutes les 2 min).
 * Reçoit le contexte de la page (`c`) ; ne lit ni n'écrit rien d'autre que ce contexte et le DOM.
 */
import { distanceEtCap } from '../noyau/geo.js';
import { ondulationGeoide } from '../noyau/geoide.js';
import { proposerCorrectionGps, decisionAuto, PRECISION_MAX_M, ECART_PROPOSITION_M } from '../scene/oeil-gps.js';
import { echap } from './html.js';

/** Au-delà de cette distance (km), un réglage à la main de la hauteur d'œil n'empêche plus le recalage automatique. */
const SAUT_KM = 3;

/** @param {import('./contexte.js').Contexte} c */
export function installerOeil(c) {
  const { S, app, entree, direct, $, note, sauver, synchroniser } = c;
  let minuteurOeil = 0;
  /** Android donne l'altitude GPS au-dessus de l'ellipsoïde WGS84 (49 m de trop en Bretagne) ; iOS, au niveau de la mer. On retranche donc l'ondulation du géoïde sur Android. */
  const ellipsoidal = /Android/i.test(typeof navigator === 'undefined' ? '' : navigator.userAgent || '');
  const ondulation = () => { const p = app.donnees().pos; return ellipsoidal && p ? ondulationGeoide(p.lat, p.lon) : 0; };
  /** Recalage automatique : suspendu dès qu'on règle la hauteur à la main, repris au changement de la case ou après un déplacement de 3 km. */
  let manuel = false, derniereAutoMs = -Infinity, posManuel = /** @type {null | {lat: number, lon: number}} */ (null);
  /** Corrige la hauteur d'œil et en mémorise l'origine (`main` : réglage à la main, qui fige le recalage automatique ; `gps` : proposition appliquée ou recalage) : libellés tout de suite, relief recalculé au relâchement (400 ms sans mouvement).
   * @param {number} m @param {'main' | 'gps'} [origine] */
  const regleOeil = (m, origine = 'main') => {
    if (origine === 'main') { manuel = true; posManuel = app.donnees().pos; }
    S.obsHeight = m; S.obsHeightSrc = m === 0 ? '' : origine; synchroniser();
    clearTimeout(minuteurOeil); minuteurOeil = window.setTimeout(() => { sauver(); app.corrigerHauteurOeil(S.obsHeight); }, 400);
  };
  $('obsH').addEventListener('input', (/** @type {any} */ e) => { regleOeil(+e.target.value); });
  const fmtOeil = (/** @type {number} */ v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v) + ' m';
  let minuteurPopOeil = 0; const refermerPopOeil = () => { clearTimeout(minuteurPopOeil); minuteurPopOeil = window.setTimeout(() => { $('eyePop').hidden = true; }, 6000); };
  $('eyeChip').addEventListener('click', () => { const p = $('eyePop'); p.hidden = !p.hidden; if (!p.hidden) refermerPopOeil(); });
  $('eyeQ').addEventListener('input', (/** @type {any} */ e) => { regleOeil(+e.target.value); refermerPopOeil(); });
  // Réestimer : correction remise à zéro, sol relu dans le relief ; Appliquer : la proposition du GPS (visible seulement quand il y en a une)
  $('eyeRe').addEventListener('click', () => { regleOeil(0); app.recharger({ terrain: true }); note('Hauteur d’œil réestimée d’après le relief', 4000); refermerPopOeil(); });
  /** Proposition du GPS pour la position et le sol d'ici ; null hors direct ou sans relief. @param {any} t */
  const proposition = (t) => { const g = direct && entree && t && t.solM !== undefined ? entree.etat() : null; return g ? proposerCorrectionGps({ mesures: g.altitudes || [], solM: t.solM, ondulationM: ondulation() }) : null; };
  $('eyeGps').addEventListener('click', () => {
    const p = proposition(app.donnees().terrain);
    if (!p || !p.proposee) { note('Aucune proposition du GPS pour l’instant', 4000); return; }
    regleOeil(/** @type {number} */ (p.correctionM), 'gps'); manuel = false;
    note(`Hauteur d’œil recalée sur le GPS : correction ${fmtOeil(/** @type {number} */ (p.correctionM))} (±${Math.round(/** @type {number} */ (p.precisionM))} m)`, 5000); refermerPopOeil();
  });
  /** Recalage automatique (case cochée, direct) : la même proposition, au plus toutes les 2 min, jamais sur le relief fin sous 15 m d'écart (scene/oeil-gps.js). @param {any} t @param {ReturnType<typeof proposerCorrectionGps> | null} p */
  function oeilAuto(t, p) {
    if (!direct || S.oeilGps !== true || !p) return;
    const pos = app.donnees().pos;
    if (manuel && pos && posManuel && distanceEtCap(posManuel, pos).distKm > SAUT_KM) manuel = false; // déplacement : l'ancien réglage à la main ne vaut plus
    const maintenant = Date.now(), corr = decisionAuto({ proposition: p, origineSol: t.origine, derniereMs: derniereAutoMs, maintenantMs: maintenant, manuel, obsHeight: S.obsHeight });
    if (corr === null) return;
    derniereAutoMs = maintenant; regleOeil(corr, 'gps');
  }
  /** Reprend le recalage automatique (case recochée). */
  const reprendreAuto = () => { manuel = false; derniereAutoMs = -Infinity; };
  /** Lignes du Diagnostic : altitude GPS, géoïde, sol et origine, dispersion, proposition ou raison du refus. @returns {string[]} lignes HTML (déjà échappées) */
  function lignesDiagnostic() {
    const t = /** @type {any} */ (app.donnees().terrain), g = direct && entree ? entree.etat() : null;
    const mode = `mode : ${S.oeilGps === true ? 'automatique (case cochée : recale seul, au plus toutes les 2 min)' : 'le GPS propose, vous appliquez'} · origine de la correction : ${S.obsHeightSrc || 'aucune'}`;
    if (!direct) return [`hauteur d'œil : ${mode}`];
    const p = proposition(t), r = p, brute = g && g.altitudeM !== null && g.altitudeM !== undefined ? Math.round(g.altitudeM) : null, n = ondulation();
    const sol = t && t.solM !== undefined ? `sol ${Math.round(t.solM)} m (${echap(t.origine || '?')})` : 'sol inconnu (relief non calculé)';
    const gps = r && r.medianeM !== null ? `altitude GPS : médiane ${Math.round(r.medianeM)} m au niveau de la mer${brute !== null ? ` (dernière mesure ${brute} m${n ? ` − géoïde ${Math.round(n)} m` : ''})` : ''} sur ${r.n} mesure(s) en ${Math.round(r.dureeMs / 1000)} s · précision ±${r.precisionM === null ? '?' : Math.round(r.precisionM)} m` : 'altitude GPS : aucune mesure';
    const disp = r && r.dispersion ? `dispersion des ${Math.min(10, r.n)} dernières mesures : ${r.dispersion.minM.toFixed(0)} à ${r.dispersion.maxM.toFixed(0)} m (σ ${r.dispersion.ecartTypeM.toFixed(1)} m)` : 'dispersion : —';
    const prop = p ? (p.proposee ? `proposition : correction ${fmtOeil(/** @type {number} */ (p.correctionM))} (écart au sol ${Math.round(/** @type {number} */ (p.ecartSolM))} m)` : `aucune proposition : ${echap(p.raison)}`) : 'aucune proposition (relief non calculé)';
    return [`hauteur d'œil : ${mode}`, `${gps} · ${sol}`, `${disp} · seuils : écart ≥ ${ECART_PROPOSITION_M} m, précision ≤ ${PRECISION_MAX_M} m`, prop];
  }
  let derniereOeil = '';
  /** Met à jour la puce « œil », son détail et la ligne du réglage d'après le relief calculé ; applique le recalage automatique si la case est cochée. */
  function synchroOeil() {
    const t = /** @type {any} */ (app.donnees().terrain), p = proposition(t);
    oeilAuto(t, p);
    const sansRelief = S.calculRelief === false || !t || t.solM === undefined, etatRelief = app.etat().etatRelief;
    const propose = !!p && p.proposee && Math.abs(/** @type {number} */ (p.correctionM) - S.obsHeight) >= 3;
    const vue = sansRelief ? `sans|${S.calculRelief === false}|${etatRelief}|${S.obsHeight}` : `${t.solM}|${t.origine}|${t.h0}|${S.obsHeight}|${S.obsHeightSrc}|${propose ? `${p && p.correctionM}|${p && p.precisionM}` : '-'}`;
    if (vue === derniereOeil) return; derniereOeil = vue;
    const chip = $('eyeChip'); chip.hidden = false; // la puce est toujours là : sans relief elle l'explique, le curseur reste utilisable (la correction s'appliquera dès que le relief sera calculé)
    if (sansRelief) {
      const raisonOeil = S.calculRelief === false ? 'relief désactivé (Réglages › Calculer le relief)' : etatRelief === 'indispo' ? 'relief indisponible (réseau ?)' : 'relief en cours de calcul';
      const texte = `Sol inconnu : ${raisonOeil} · correction ${fmtOeil(S.obsHeight)} (appliquée dès que le relief est calculé)`;
      chip.textContent = `œil ${S.obsHeight ? fmtOeil(S.obsHeight) : '?'}`; $('eyePopT').textContent = texte; $('eyeQ').value = String(S.obsHeight); $('eyeGps').hidden = true; $('eyePropT').textContent = ''; $('obsHInfo').textContent = texte; return;
    }
    $('eyeGps').hidden = !propose;
    $('eyePropT').textContent = propose && p ? `GPS : ${fmtOeil(/** @type {number} */ (p.correctionM))} (±${Math.round(/** @type {number} */ (p.precisionM))} m)` : '';
    const detail = `Sol estimé ${Math.round(t.solM)} m (${t.origine}) · correction ${fmtOeil(S.obsHeight)} → œil à ${Math.round(t.h0)} m`;
    chip.textContent = `œil ${fmtOeil(S.obsHeight)}${S.obsHeightSrc === 'gps' ? ' GPS' : ''}${propose ? ' · GPS ?' : ''}`; $('eyePopT').textContent = detail; $('eyeQ').value = String(S.obsHeight); $('obsHInfo').textContent = detail;
  }
  return { synchroOeil, regleOeil, reprendreAuto, lignesDiagnostic };
}
