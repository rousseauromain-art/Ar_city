// @ts-check
/**
 * Calage guidé (direct) : le bouton cible choisit la meilleure cible (soleil, lune, repère, horizon), affiche comment la viser (« tournez de 40° vers la droite et montez de 12° ») et lance « Caler auto » tout seul
 * dès qu'elle est dans le champ et que le téléphone est stable. Un second toucher sur le bouton (ou sur le bandeau) annule. Au bout de 60 s sans succès : fin avec un message. Reçoit le contexte de la page (`c`) et le calage.
 */
import { choisirCible, consigne, meilleurRepere } from '../calage/guide.js';
import { monumentsPourCalage } from '../calage/reperes.js';
import { pourquoiIgnore } from '../calage/banc.js';
import { positionSoleil, positionLune } from '../noyau/astro.js';
import { RAD } from '../noyau/constantes.js';
import { ecartAngle } from '../noyau/maths.js';

/** Période du guidage (ms), stabilité (°/s) et durée maximale (ms). */
const PERIODE_MS = 400, STABLE_DEG_S = 6, DUREE_MAX_MS = 60000, STABLE_MIN_MS = 800;

/** Cible actuelle : astre calculé pour maintenant, repère utilisable le plus proche du cap, sinon l'horizon. @param {import('./contexte.js').Contexte} c */
function cibleActuelle({ S, app, ps, pose }) {
  const d = app.donnees(), po = pose(), t = ps.photoMode ? ps.photoMode.photo.utc : Date.now();
  const soleil = d.pos && t ? positionSoleil(t, d.pos.lat, d.pos.lon) : null, lune = d.pos && t ? positionLune(t, d.pos.lat, d.pos.lon) : null;
  const liste = d.pos ? monumentsPourCalage({ monuments: d.monuments, elements: (ps.dernierBilan && ps.dernierBilan.monuments) || [], pos: d.pos, terrain: d.terrain }) : [];
  const reliefActif = S.relief && !!d.terrain;
  const utilisables = liste.filter((m) => m.cat !== 'equip' && m.dist !== null && m.dist !== undefined && m.brg !== null && m.brg !== undefined && pourquoiIgnore(/** @type {any} */ (m), reliefActif) === '')
    .map((m) => ({ nom: String(m.name), brg: /** @type {number} */ (m.brg), dist: /** @type {number} */ (m.dist) }));
  return choisirCible({ soleil, lune, repere: meilleurRepere(utilisables, po.capDeg), capDeg: po.capDeg });
}

/** Champs horizontal et vertical (°). @param {import('./contexte.js').Contexte} c */
function champsDeg({ ps, vFov }) {
  const h = vFov(), fh = (ps.W / 2) / Math.tan((h / 2) * RAD), v = (2 * Math.atan(ps.H / 2 / fh)) / RAD;
  return { champHDeg: h, champVDeg: v };
}

/** La boussole est-elle douteuse (voiture : plus de 3 m/s, ou perturbée) ? Dans ce cas le guidage d'après le cap affiché serait faux : on tente d'abord le calage direct (soleil cherché dans toute l'image). @param {import('./contexte.js').Contexte} c */
const boussoleDouteuse = ({ entree, fusion }) => fusion.boussolePerturbee || (!!entree && (entree.etat().vitesseMs ?? 0) > 3);

/** @param {import('./contexte.js').Contexte} c @param {ReturnType<typeof import('./calage.js').installerCalage>} calage */
export function installerCalageGuide(c, calage) {
  const { ps, pose, $, $f, note } = c;
  /** @type {null | {debut: number, capPrec: number, tPrec: number, stableDepuis: number | null, minuteur: number, enCours: boolean}} */
  let session = null;

  const bandeau = () => $f('guideMsg');
  const terminer = (/** @type {string} */ msg) => { if (session) clearInterval(session.minuteur); session = null; bandeau().hidden = true; $('btnAlign').classList.remove('on'); if (msg) note(msg, 6000); };
  /** Un pas du guidage : consigne, puis calage quand la cible est dans le champ et que le téléphone ne bouge presque plus. */
  async function pas() {
    if (!session || session.enCours) return;
    const maintenant = performance.now(), po = pose();
    if (maintenant - session.debut > DUREE_MAX_MS) { terminer('Guidage terminé sans calage : réessayez, ou touchez le réticule puis un repère connu.'); return; }
    const vitesse = Math.abs(ecartAngle(po.capDeg - session.capPrec)) / Math.max(0.05, (maintenant - session.tPrec) / 1000);
    session.capPrec = po.capDeg; session.tPrec = maintenant;
    const cb = cibleActuelle(c), cs = consigne(cb, po, champsDeg(c));
    bandeau().hidden = false; bandeau().textContent = cs.texte;
    if (!cs.dansLeChamp) { session.stableDepuis = null; return; }
    if (vitesse > STABLE_DEG_S) { session.stableDepuis = null; return; }
    session.stableDepuis = session.stableDepuis ?? maintenant;
    if (maintenant - session.stableDepuis < STABLE_MIN_MS) return;
    session.enCours = true; bandeau().textContent = `Calage sur ${cb.nom}…`;
    const message = await calage.calerAuto();
    const ok = /^calé/.test(message);
    terminer(ok ? message : `${message} — visez autre chose (touchez de nouveau le bouton).`);
  }
  /** Premier toucher : démarre le guidage ; second toucher : l'annule. */
  async function basculer() {
    if (session) { terminer('Guidage annulé'); return; }
    $('btnAlign').classList.add('on');
    if (boussoleDouteuse(c)) { // la boussole ment : on cherche l'astre dans toute l'image avant de guider
      note('Calage en cours…', 20000); const m = await calage.calerAuto(); $('btnAlign').classList.remove('on');
      if (/^calé/.test(m)) { note(m, 6000); return; }
      $('btnAlign').classList.add('on');
    }
    const t = performance.now();
    session = { debut: t, capPrec: pose().capDeg, tPrec: t, stableDepuis: null, minuteur: window.setInterval(() => { pas(); }, PERIODE_MS), enCours: false };
    pas();
  }
  $f('guideMsg').addEventListener('click', () => terminer('Guidage annulé')); ps.guide = { basculer, actif: () => !!session };
  return { basculer };
}
