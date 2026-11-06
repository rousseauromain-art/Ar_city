// @ts-check
/**
 * Calage en ville : cap sur l'axe de la rue (calage/rue.js) et état de la ville pour le guidage (rue proche, toits disponibles). Reçoit le contexte de la page (`c`) et le calage ; ne lit ni n'écrit rien d'autre que ce contexte et le DOM.
 */
import { capDepuisRue } from '../calage/rue.js';
import { ecartAngle } from '../noyau/maths.js';
import { villeDense } from '../scene/liste-affichage.js';
import { positionSoleil } from '../noyau/astro.js';

/** Durée (ms) pendant laquelle l'axe de la rue reste tracé au sol après le calage (pour vérifier). */
export const AXE_VISIBLE_MS = 5000;

/** La boussole est-elle douteuse (voiture : plus de 3 m/s, ou perturbée) ? Le cap affiché ne dit alors rien : on propose les deux sens. @param {import('./contexte.js').Contexte} c */
export const boussoleDouteuse = ({ entree, fusion }) => fusion.boussolePerturbee || (!!entree && (entree.etat().vitesseMs ?? 0) > 3);

/** @param {import('./contexte.js').Contexte} c @param {ReturnType<typeof import('./calage.js').installerCalage>} calage */
export function installerCalageVille(c, calage) {
  const { S, app, journal, entree, pose, ps, synchroniser, note } = c;
  /** Résultat du calage sur la rue pour la position et le cap affiché actuels (`douteuse` force les deux sens). @param {boolean} [douteuse] */
  function evaluerRue(douteuse = false) {
    const d = app.donnees();
    return capDepuisRue({ pos: d.pos, capAfficheDeg: ps.photoMode ? null : pose().capDeg, precisionM: entree ? entree.etat().precisionM : 0, rues: d.rues || [], boussoleDouteuse: douteuse || boussoleDouteuse(c) });
  }
  /** Applique le cap de la rue : le cap affiché devient celui de l'axe ; l'axe reste tracé au sol 5 s ; une entrée « rue » au carnet. @param {number} capDeg @param {string} nom */
  function appliquerRue(capDeg, nom) {
    const avant = { h: S.headOff, p: S.pitchOff }, dh = ecartAngle(capDeg - pose().capDeg);
    calage.appliquerCalage(dh, 0); synchroniser();
    calage.consigner('rue', avant, { rue: nom, axeDeg: Math.round(capDeg) });
    ps.axeRue = { capDeg, oeilM: 1.6 + (S.obsHeight || 0), jusqua: Date.now() + AXE_VISIBLE_MS };
    const msg = `Calé sur l'axe de ${nom} (${Math.round(capDeg)}°) · cap ${dh >= 0 ? '+' : ''}${dh.toFixed(1)}°`;
    journal.info('calage', msg); note(msg, 6000);
    return msg;
  }
  /** État de la ville pour le guidage : null hors ville dense ; sinon la rue proche (axe, nom) et la possibilité de caler sur les toits (de jour, bâtiments chargés). @returns {import('../calage/guide.js').Ville | null} */
  function villeActuelle() {
    const d = app.donnees();
    if (!d.pos || !villeDense({ pos: d.pos, cities: /** @type {any} */ (d.lieux), monuments: /** @type {any} */ (d.monuments), batiments: /** @type {any} */ (d.reperes) })) return null;
    const r = evaluerRue(), t = ps.photoMode ? ps.photoMode.photo.utc : Date.now(), so = t ? positionSoleil(t, d.pos.lat, d.pos.lon) : null;
    const cand = r.ok ? { nom: r.rue, axeDeg: r.capDeg } : r.choix && r.choix.length ? { nom: r.choix[0].rue, axeDeg: r.choix[0].capDeg } : null;
    return { rue: cand, toits: !!so && so.elDeg > 0 && (d.batiments || []).length > 0 };
  }
  return { evaluerRue, appliquerRue, villeActuelle };
}
