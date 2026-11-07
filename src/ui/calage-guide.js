// @ts-check
/**
 * Bouton cible « Caler » (direct), comme la v1 : il cale TOUT DE SUITE sur ce qui est devant (« Caler auto » : soleil, relief, repères).
 * Le guidage (« Visez le soleil : tournez de 40° vers la droite ») vient ensuite : sur un second toucher dans les 15 s, ou en repli après un échec ;
 * jamais quand la boussole est douteuse (perturbée, ou en voiture) : la consigne serait fausse. Le guidage choisit la meilleure cible (soleil, lune, repère, horizon)
 * et lance « Caler auto » tout seul dès qu'elle est dans le champ et que le téléphone est stable ; un toucher sur le bouton (ou sur le bandeau) l'annule ; 60 s sans succès : fin avec un message.
 * Reçoit le contexte de la page (`c`) et le calage.
 */
import { choisirCible, consigne, meilleurRepere } from '../calage/guide.js';
import { monumentsPourCalage } from '../calage/reperes.js';
import { pourquoiIgnore } from '../calage/banc.js';
import { positionSoleil, positionLune } from '../noyau/astro.js';
import { RAD } from '../noyau/constantes.js';
import { ecartAngle } from '../noyau/maths.js';
import { boussoleDouteuse } from './calage-ville.js';

/** Période du guidage (ms), stabilité (°/s) et durée maximale (ms). */
const PERIODE_MS = 400, STABLE_DEG_S = 6, DUREE_MAX_MS = 60000, STABLE_MIN_MS = 800;
/** Un toucher dans ce délai après un calage est un « second toucher » : il lance le guidage (ms). */
const SECOND_TOUCHER_MS = 15000;

/** Cible actuelle : astre calculé pour maintenant, repère utilisable le plus proche du cap, sinon l'horizon. @param {import('./contexte.js').Contexte} c */
function cibleActuelle({ S, app, ps, pose }, /** @type {import('../calage/guide.js').Ville | null} */ ville = null) {
  const d = app.donnees(), po = pose(), t = ps.photoMode ? ps.photoMode.photo.utc : Date.now();
  const soleil = d.pos && t ? positionSoleil(t, d.pos.lat, d.pos.lon) : null, lune = d.pos && t ? positionLune(t, d.pos.lat, d.pos.lon) : null;
  const liste = d.pos ? monumentsPourCalage({ monuments: d.monuments, elements: (ps.dernierBilan && ps.dernierBilan.monuments) || [], pos: d.pos, terrain: d.terrain }) : [];
  const reliefActif = S.relief && !!d.terrain;
  const utilisables = liste.filter((m) => m.cat !== 'equip' && m.dist !== null && m.dist !== undefined && m.brg !== null && m.brg !== undefined && pourquoiIgnore(/** @type {any} */ (m), reliefActif) === '')
    .map((m) => ({ nom: String(m.name), brg: /** @type {number} */ (m.brg), dist: /** @type {number} */ (m.dist) }));
  return choisirCible({ soleil, lune, repere: meilleurRepere(utilisables, po.capDeg), capDeg: po.capDeg, ville });
}

/** Champs horizontal et vertical (°). @param {import('./contexte.js').Contexte} c */
function champsDeg({ ps, vFov }) {
  const h = vFov(), fh = (ps.W / 2) / Math.tan((h / 2) * RAD), v = (2 * Math.atan(ps.H / 2 / fh)) / RAD;
  return { champHDeg: h, champVDeg: v };
}

/** Consigne de la rue et boutons : « Caler sur <rue> (cap) » si la rue est sûre, un bouton par rue ou par sens sinon. Renvoie la signature de l'affichage (le DOM n'est refait que si elle change).
 * @param {HTMLElement} b @param {ReturnType<typeof import('./calage-ville.js').installerCalageVille>} ville @param {string} texte @param {string} signatureAvant @param {(msg: string) => void} terminer */
function afficherRue(b, ville, texte, signatureAvant, terminer) {
  const r = ville.evaluerRue(), choix = r.ok ? [{ rue: r.rue, capDeg: r.capDeg }] : r.choix || [], sig = texte + '|' + (r.ok ? '' : r.raison) + '|' + choix.map((x) => `${x.rue}${Math.round(x.capDeg)}`).join(',');
  if (sig === signatureAvant) return sig;
  b.textContent = ''; b.append(Object.assign(document.createElement('div'), { textContent: texte }));
  if (!r.ok && r.raison) b.append(Object.assign(document.createElement('div'), { textContent: r.raison }));
  for (const x of choix) {
    const bt = Object.assign(document.createElement('button'), { type: 'button', className: 'guideBtn', textContent: choix.length === 1 ? `Caler sur ${x.rue} (${Math.round(x.capDeg)}°)` : `${x.rue} · ${Math.round(x.capDeg)}°` });
    bt.addEventListener('click', (e) => { e.stopPropagation(); terminer(ville.appliquerRue(x.capDeg, x.rue)); });
    b.append(bt);
  }
  return sig;
}

/**
 * Toucher du bouton : guidage en cours → annulé ; second toucher (15 s après un calage) → guidage ; sinon calage tout de suite (v1), guidage en repli après un échec.
 * @param {import('./contexte.js').Contexte} c @param {ReturnType<typeof import('./calage.js').installerCalage>} calage @param {{actif: () => boolean, annuler: () => void, guider: () => boolean}} g
 */
function creerBoutonCaler({ $, note }, calage, g) {
  let calageEnCours = false, dernierCalage = -Infinity;
  return async function basculer() {
    if (g.actif()) { g.annuler(); return; }
    if (calageEnCours) return;
    if (performance.now() - dernierCalage < SECOND_TOUCHER_MS && g.guider()) return;
    calageEnCours = true; $('btnAlign').classList.add('on'); note('Calage en cours…', 20000);
    /** @type {string} */
    let m;
    try { m = await calage.calerAuto(); } finally { calageEnCours = false; dernierCalage = performance.now(); $('btnAlign').classList.remove('on'); }
    if (/^calé/.test(m) || !g.guider()) { note(m, 6000); return; }
    note(`${m} — suivez la consigne`, 4000); // repli : la cible n'était pas dans le champ
  };
}

/** @param {import('./contexte.js').Contexte} c @param {ReturnType<typeof import('./calage.js').installerCalage>} calage @param {ReturnType<typeof import('./calage-ville.js').installerCalageVille>} ville */
export function installerCalageGuide(c, calage, ville) {
  const { ps, pose, $, $f, note } = c;
  /** @type {null | {debut: number, capPrec: number, tPrec: number, stableDepuis: number | null, minuteur: number, enCours: boolean}} */
  let session = null, signatureRue = ''; // signature de l'affichage de la rue : le DOM n'est refait que si elle change (un toucher ne tombe pas sur un bouton qui vient d'être remplacé)

  const bandeau = () => $f('guideMsg');
  const terminer = (/** @type {string} */ msg) => { if (session) clearInterval(session.minuteur); session = null; signatureRue = ''; bandeau().hidden = true; $('btnAlign').classList.remove('on'); if (msg) note(msg, 6000); };
  const montrerRue = (/** @type {string} */ texte) => { signatureRue = afficherRue(bandeau(), ville, texte, signatureRue, terminer); };
  /** Un pas du guidage : consigne, puis calage quand la cible est dans le champ et que le téléphone ne bouge presque plus. */
  async function pas() {
    if (!session || session.enCours) return;
    const maintenant = performance.now(), po = pose();
    if (maintenant - session.debut > DUREE_MAX_MS) { terminer('Guidage terminé sans calage : réessayez, ou touchez le réticule puis un repère connu.'); return; }
    const vitesse = Math.abs(ecartAngle(po.capDeg - session.capPrec)) / Math.max(0.05, (maintenant - session.tPrec) / 1000);
    session.capPrec = po.capDeg; session.tPrec = maintenant;
    const cb = cibleActuelle(c, ville.villeActuelle()), cs = consigne(cb, po, champsDeg(c));
    if (cb.type !== 'rue' && boussoleDouteuse(c)) { terminer(''); return; } // la boussole devient douteuse (départ en voiture) : plus de consigne de rotation
    bandeau().hidden = false;
    if (cb.type === 'rue') { montrerRue(cs.texte); return; } // viser le point de fuite de la rue : le cap affiché ne dit pas si c'est fait, c'est l'utilisateur qui touche le bouton
    bandeau().textContent = cs.texte;
    if (!cs.dansLeChamp) { session.stableDepuis = null; return; }
    if (vitesse > STABLE_DEG_S) { session.stableDepuis = null; return; }
    session.stableDepuis = session.stableDepuis ?? maintenant;
    if (maintenant - session.stableDepuis < STABLE_MIN_MS) return;
    session.enCours = true; bandeau().textContent = `Calage sur ${cb.nom}…`;
    const message = await calage.calerAuto();
    const ok = /^calé/.test(message);
    terminer(ok ? message : `${message} — visez autre chose (touchez de nouveau le bouton).`);
  }
  /** Démarre le guidage. Boussole douteuse : jamais de consigne « tournez de… » (elle serait fausse) ; seul le choix du sens de la rue, qui ne lit pas la boussole, reste proposé. @returns {boolean} */
  function guider() {
    if (boussoleDouteuse(c) && cibleActuelle(c, ville.villeActuelle()).type !== 'rue') return false;
    $('btnAlign').classList.add('on');
    const t = performance.now();
    session = { debut: t, capPrec: pose().capDeg, tPrec: t, stableDepuis: null, minuteur: window.setInterval(() => { pas(); }, PERIODE_MS), enCours: false };
    pas();
    return true;
  }
  const basculer = creerBoutonCaler(c, calage, { actif: () => !!session, annuler: () => terminer('Guidage annulé'), guider });
  $f('guideMsg').addEventListener('click', (/** @type {MouseEvent} */ e) => { if (/** @type {HTMLElement} */ (e.target).closest('button')) return; terminer('Guidage annulé'); }); ps.guide = { basculer, actif: () => !!session };
  return { basculer };
}
