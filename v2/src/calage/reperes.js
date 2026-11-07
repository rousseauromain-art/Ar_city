// @ts-check
/**
 * CALAGE SUR LES REPÈRES VUS, PONCTUEL : sur la silhouette lue dans l'image, on cherche les POINTES (sommets locaux nettement plus hauts que leurs voisins) et on les apparie aux REPÈRES
 * FIABLES connus : tours, clochers, dômes de hauteur connue, étroits vus d'ici, nets. Chaque appariement propose une correction de cap ; on ne corrige que si au moins 2 repères concordent
 * (à 0,4° près), ou 1 seul repère avec une pointe unique et très nette. Avec 2 repères écartés de 10° ou plus, le champ de vision est recalé aussi. Au plus 3 passes ; correction refusée
 * au-delà de ±20° de la boussole. Version de la v1 (j) : PAS de test de permutation contre les concordances fortuites en ville dense (apport de l'étape 11).
 * Fonctions pures. Entrées : silhouette du ciel, liste des éléments affichés, pose, champ. Sortie : correction de cap (et de champ) ou refus avec message. Dépend de : noyau/maths.js, calques/monuments.js.
 */
import { RAD } from '../noyau/constantes.js';
import { ecartAngle } from '../noyau/maths.js';
import { LARGEUR_TYPE_M } from '../noyau/constantes.js';
import { cleMonument } from '../scene/cles.js';
import { verdictRelief } from '../scene/visibilite.js';
import { distanceEtCap } from '../noyau/geo.js';

/** Prominence minimale d'une pointe (°), fenêtre d'appariement en cap (°), tolérance en hauteur (°), accord entre repères (°). v1 : `AC_PROM`, `AC_WIN`, `AC_VTOL`, `AC_AGREE`. */
export const PROMINENCE_MIN_DEG = 0.8, FENETRE_APPARIEMENT_DEG = 8, TOLERANCE_HAUTEUR_DEG = 1.5, ACCORD_DEG = 0.4;
/** Correction cumulée maximale (°) acceptée sur le cap (v1 : `LM_MAX`). */
const CORRECTION_MAX_DEG = 20;

/** @typedef {{cols: {brg: number, a: number, top?: boolean}[], heading: number, pitch: number, fh: number}} SilhouetteLue colonnes lues, cap et site de la pose, focale (px d'écran) */
/** @typedef {{dd: number, brg: number, a: number, prom: number, w: number}} Pointe */
/** @typedef {{name: string, kind: string, cat?: string, type?: string, dist?: number | null, brg?: number | null, far?: boolean, hidden?: boolean, aP?: number | null, ht?: number | null, htWd?: number | null, htOsm?: number | null}} ElementRepere */

/** Pointes de la silhouette (v1 : `photoPeaks`). @param {SilhouetteLue} ps @returns {Pointe[]} */
export function pointesPhoto(ps) {
  const cs = ps.cols.map((c) => ({ ...c, dd: ecartAngle(c.brg - ps.heading) })).sort((a, b) => a.dd - b.dd);
  /** @type {Pointe[]} */
  const out = [];
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    let isMax = true, mn = c.a;
    for (const o of cs) { const g = Math.abs(o.dd - c.dd); if (g <= 0.8 && o.a > c.a) { isMax = false; break; } if (g <= 2 && o.a < mn) mn = o.a; }
    if (!isMax || c.a - mn < PROMINENCE_MIN_DEG) continue;
    const top = cs.filter((o) => Math.abs(o.dd - c.dd) <= 1.5 && o.a >= c.a - 0.3 * (c.a - mn)), ctr = top.reduce((s, o) => s + o.dd, 0) / top.length;
    if (out.some((p) => Math.abs(p.dd - ctr) < 0.5)) continue;
    out.push({ dd: ctr, brg: (ps.heading + ctr + 360) % 360, a: c.a, prom: c.a - mn, w: Math.max(...top.map((o) => o.dd)) - Math.min(...top.map((o) => o.dd)) });
  }
  return out;
}

/**
 * TOUS les monuments candidats au calage, avec leur distance, leur relèvement, `far`, `hidden` et l'angle de leur sommet. La v1 cherche ses repères dans `monumentSites` (tout ce qui est chargé), pas dans ce qui est
 * affiché : une statue trop loin pour être nommée reste un repère possible. Pour un monument classé par le moteur on reprend ses valeurs ; pour les autres (rayon, portée des statues), `far` reste faux comme dans
 * la v1 (ces drapeaux n'y sont pas recalculés) et la visibilité vient du relief. Calcul à la demande (au moment du calage), jamais à chaque image.
 * @param {{monuments: any[], elements: any[], pos: {lat: number, lon: number}, terrain: {h0: number, pm: any, bands: any[]} | null}} e `elements` : monuments classés (`bilan.monuments`)
 * @returns {ElementRepere[]}
 */
export function monumentsPourCalage({ monuments, elements, pos, terrain }) {
  const parCle = new Map(elements.map((el) => [cleMonument(el), el]));
  const masque = terrain ? { oeilM: terrain.h0, pm: terrain.pm } : null;
  return monuments.filter((m) => m.cat !== 'equip').map((m) => {
    const el = parCle.get(cleMonument(m));
    if (el) return el;
    const { distKm, capDeg } = distanceEtCap(pos, m), v = masque && terrain ? verdictRelief(masque, terrain.bands, { ...m, dist: distKm, brg: capDeg }) : null;
    return { ...m, dist: distKm, brg: capDeg, far: false, hidden: v ? v.hidden : false, aP: v ? v.aP : null };
  });
}

/**
 * Repères fiables pour le calage : monuments (pas d'équipement) ni lointains ni cachés, de 0,15 à 20 km, de hauteur connue ou tour / clocher / dôme, étroits vus d'ici (moins de 1,5°),
 * dans le champ (moins un degré), avec l'angle de leur sommet. Reprend `landmarksForCal` de la v1.
 * @param {SilhouetteLue} ps @param {ElementRepere[]} liste éléments affichés (`classerScene().liste`) @param {{largeurPx: number}} ecran @param {{avecRelief: boolean, correctionOeilM?: number}} o
 * @returns {{c: ElementRepere, aTop: number}[]}
 */
export function reperesPourCalage(ps, liste, ecran, { avecRelief, correctionOeilM = 0 }) {
  const eye = 1.6 + correctionOeilM, half = Math.atan(ecran.largeurPx / 2 / ps.fh) / RAD - 1;
  return liste.filter((c) => c.kind === 'monument' && c.cat !== 'equip' && !c.far && !(avecRelief && c.hidden) && /** @type {number} */ (c.dist) >= 0.15 && /** @type {number} */ (c.dist) <= 20
      && (c.htWd || c.htOsm || /^(tour|clocher|dome)$/.test(c.type || '')) && Math.atan2((LARGEUR_TYPE_M[c.type || ''] || 20) / 2, /** @type {number} */ (c.dist) * 1000) / RAD < 1.5 && Math.abs(ecartAngle(/** @type {number} */ (c.brg) - ps.heading)) < half)
    .map((c) => ({ c, aTop: c.aP !== null && c.aP !== undefined && avecRelief ? c.aP : Math.atan2((c.ht || 20) - eye, Math.max(30, /** @type {number} */ (c.dist) * 1000)) / RAD }));
}

/**
 * Appariement pointes ↔ repères (v1 : `landmarkFit`). `inclinaisonCouranteDeg` : l'inclinaison de la pose au moment de l'appel (v1 : `pose().pitch`).
 * @param {SilhouetteLue} ps @param {{c: ElementRepere, aTop: number}[]} lms @param {{ecran: {largeurPx: number}, camFov: number, champAffiche: (cam: number) => number, inclinaisonCouranteDeg: number, permutation?: boolean}} e `permutation` (défaut oui) : refuse les concordances fortuites (apport du 26/10, absent de la v1 (j) : `false` redonne la v1)
 * @returns {{ok: true, corr: number, cam: number, names: string[]} | {ok: false, msg: string}}
 */
export function ajusterSurReperes(ps, lms, { ecran, camFov, champAffiche, inclinaisonCouranteDeg, permutation = true }) {
  const peaks = pointesPhoto(ps);
  if (!lms.length) return { ok: false, msg: 'aucun repère fiable (tour, clocher, dôme de hauteur connue) dans le champ' };
  if (!peaks.length) return { ok: false, msg: 'aucune pointe nette sur la photo' };
  /** @type {{corr: number, L: {c: ElementRepere, aTop: number}, p: Pointe, uniq: boolean}[]} */
  const hyps = [];
  for (const L of lms) {
    const cand = peaks.filter((p) => Math.abs(ecartAngle(p.brg - /** @type {number} */ (L.c.brg))) <= FENETRE_APPARIEMENT_DEG && Math.abs(p.a - L.aTop) <= TOLERANCE_HAUTEUR_DEG + Math.abs(ps.pitch - inclinaisonCouranteDeg));
    for (const p of cand) hyps.push({ corr: ecartAngle(/** @type {number} */ (L.c.brg) - p.brg), L, p, uniq: cand.length === 1 });
  }
  /** @type {{h: typeof hyps[number], sup: typeof hyps, n: number, score: number} | null} */
  let best = null;
  for (const h of hyps) {
    const sup = hyps.filter((o) => Math.abs(ecartAngle(o.corr - h.corr)) < ACCORD_DEG), names = new Set(sup.map((o) => o.L.c.name));
    const score = names.size * 10 - sup.reduce((s, o) => s + Math.abs(ecartAngle(o.corr - h.corr)), 0);
    if (!best || score > best.score) best = { h, sup, n: names.size, score };
  }
  // CONCORDANCES FORTUITES (Turin, 26/10/2026 : cap −19,4° et champ 71,5° → 58,5° sur une photo dont la direction était juste) : avec beaucoup de repères et de pointes, quelques paires concordent par hasard presque toujours.
  // Test de permutation : on décale chaque repère d'un écart aléatoire (graine fixe) dans la fenêtre de recherche, ce qui détruit toute concordance d'ensemble en gardant le même nombre d'hypothèses, et l'on compte
  // combien de fois le hasard rassemble autant de repères que le meilleur cap. Le cap n'est accepté que si cela arrive dans moins de 5 % des tirages ; un repère seul ne vaut que s'il y a au plus 3 repères dans le champ.
  /** Fréquence à laquelle le hasard rassemble au moins `nBest` repères sur un même cap (`corrOf` : correction proposée par chaque hypothèse). @param {(h: typeof hyps[number]) => number} corrOf @param {number} nBest */
  const chanceOf = (corrOf, nBest) => {
    let seed = 12345; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, RUNS = 100, cs = hyps.map(corrOf); let hit = 0;
    for (let r = 0; r < RUNS; r++) {
      const off = new Map(); for (const L of lms) off.set(L, (rnd() * 2 - 1) * FENETRE_APPARIEMENT_DEG);
      const v = hyps.map((h, i) => cs[i] + /** @type {number} */ (off.get(h.L))); let mx = 0;
      for (let i = 0; i < v.length && mx < nBest; i++) { const nm = new Set(); for (let k = 0; k < v.length; k++) if (Math.abs(ecartAngle(v[k] - v[i])) < ACCORD_DEG) nm.add(hyps[k].L); if (nm.size > mx) mx = nm.size; }
      if (mx >= nBest) hit++;
    }
    return hit / RUNS;
  };
  const chance = permutation && best && best.n >= 2 ? chanceOf((h) => h.corr, best.n) : 1;
  let ok = !!best && (permutation ? ((best.n >= 2 && chance < 0.05) || (best.n === 1 && best.h.uniq && best.h.p.prom >= 2 && lms.length <= 3)) : (best.n >= 2 || (best.n === 1 && best.h.uniq && best.h.p.prom >= 2))), supSel = ok && best ? best.sup : null;
  const fhOf = (/** @type {number} */ cam) => (ecran.largeurPx / 2) / Math.tan(champAffiche(cam) / 2 * RAD), impl = (/** @type {typeof hyps[number]} */ o, /** @type {number} */ cam) => ecartAngle(/** @type {number} */ (o.L.c.brg) - Math.atan(Math.tan(o.p.dd * RAD) * ps.fh / fhOf(cam)) / RAD);
  if (!ok && hyps.length >= 2) { // zoom faux : les écarts ne concordent qu'après correction du champ
    /** @type {{r: number, cam: number, a: typeof hyps[number], b: typeof hyps[number]} | null} */
    let bp = null;
    for (let i = 0; i < hyps.length; i++) for (let j = i + 1; j < hyps.length; j++) {
      const a = hyps[i], b = hyps[j];
      if (a.L === b.L || Math.abs(a.p.dd - b.p.dd) < 8) continue;
      for (let cam = Math.max(20, camFov - 12); cam <= Math.min(110, camFov + 12); cam += 0.5) { const r = Math.abs(ecartAngle(impl(a, cam) - impl(b, cam))); if (!bp || r < bp.r) bp = { r, cam, a, b }; }
    }
    if (bp && bp.r < 0.2) { const m = impl(bp.a, bp.cam), cam = bp.cam; supSel = hyps.filter((o) => Math.abs(ecartAngle(impl(o, cam) - m)) < ACCORD_DEG); const nz = new Set(supSel.map((o) => o.L)).size; ok = permutation ? nz >= 6 && chanceOf((o) => ecartAngle(impl(o, cam)), nz) < 0.02 : nz >= 2; } // champ déduit : au moins 6 repères et moins de 2 % de chance (2 repères + zoom libre concordent toujours)
  }
  if (!ok || !supSel) return { ok: false, msg: `${lms.length} repère(s), ${peaks.length} pointe(s) : pas de concordance sûre` };
  const sup = supSel.filter((o, i, a) => a.findIndex((q) => q.L === o.L) === i);
  let corr = sup.reduce((s, o) => s + o.corr, 0) / sup.length, cam = camFov;
  if (sup.length >= 2) {
    const dds = sup.map((o) => o.p.dd), span = Math.max(...dds) - Math.min(...dds);
    if (span >= 10 && (!permutation || sup.length >= 4)) { // le champ n'est ajusté qu'avec au moins 4 repères : 2 inconnues (cap, champ), avec 2 ou 3 repères l'ajustement serait exact par construction
      const xs = sup.map((o) => Math.tan(o.p.dd * RAD) * ps.fh);
      /** @type {{r: number, m: number, cam: number} | null} */
      let bc = null;
      const resid = (/** @type {number} */ c) => { const fh2 = (ecran.largeurPx / 2) / Math.tan(champAffiche(c) / 2 * RAD), hs = sup.map((o, i) => ecartAngle(/** @type {number} */ (o.L.c.brg) - Math.atan(xs[i] / fh2) / RAD)); const m = hs.reduce((s, v) => s + v, 0) / hs.length; return { r: Math.sqrt(hs.reduce((s, v) => s + (v - m) * (v - m), 0) / hs.length), m }; };
      const cur = resid(camFov);
      for (let c = Math.max(20, camFov - 10); c <= Math.min(110, camFov + 10); c += 0.5) { const q = resid(c); if (!bc || q.r < bc.r) bc = { ...q, cam: c }; }
      if (bc && bc.r < 0.25 && bc.r < cur.r * 0.7 && Math.abs(bc.cam - camFov) >= 1) cam = bc.cam;
      if (bc && bc.r < 0.25) corr = ecartAngle(bc.m - ps.heading);
    }
  }
  return { ok: true, corr, cam, names: sup.map((o) => o.L.c.name) };
}

/**
 * Un calage complet sur les repères : jusqu'à 3 passes, chacune relit l'image avec le cap corrigé (v1 : `landmarkAlign`). Aucun effet de bord : `lireSilhouette(pose, focalePx)` relit l'image
 * (null : image illisible), et la correction est RENVOYÉE (l'appelant l'applique).
 * @param {{pose: {capDeg: number, inclinaisonDeg: number, roulisDeg: number}, camFov: number, ecran: {largeurPx: number, hauteurPx: number}, champAffiche: (cam: number) => number,
 *   lireSilhouette: (pose: {capDeg: number, inclinaisonDeg: number, roulisDeg: number}, focalePx: number) => {ok: boolean, cols: {brg: number, a: number, top?: boolean}[]} | null,
 *   liste: ElementRepere[], avecRelief: boolean, correctionOeilM?: number, permutation?: boolean}} e
 * @returns {{ok: true, corr: number, names: string[], cam: number, cam0: number} | {ok: false, msg: string}}
 */
export function calerSurReperes({ pose, camFov, ecran, champAffiche, lireSilhouette, liste, avecRelief, correctionOeilM = 0, permutation = true }) {
  let total = 0, cam = camFov;
  const cam0 = camFov;
  /** @type {{names: string[]} | null} */
  let last = null;
  for (let k = 0; k < 3; k++) {
    const P = { ...pose, capDeg: (((pose.capDeg + total) % 360) + 360) % 360 }, fh = (ecran.largeurPx / 2) / Math.tan(champAffiche(cam) / 2 * RAD), sk = lireSilhouette(P, fh);
    if (!sk) return { ok: false, msg: 'image caméra illisible' };
    if (!sk.ok) return { ok: false, msg: "ciel peu lisible sur l'image (intérieur, contre-jour, nuit ?)" };
    const ps = { cols: sk.cols, heading: P.capDeg, pitch: P.inclinaisonDeg, fh };
    const r = ajusterSurReperes(ps, reperesPourCalage(ps, liste, ecran, { avecRelief, correctionOeilM }), { ecran, camFov: cam, champAffiche, inclinaisonCouranteDeg: P.inclinaisonDeg, permutation });
    if (!r.ok) return k && last ? { ok: true, corr: total, names: last.names, cam, cam0 } : r;
    if (Math.abs(total + r.corr) > CORRECTION_MAX_DEG) return { ok: false, msg: `concordance trouvée (${r.names.slice(0, 2).join(', ')}) mais à ${(total + r.corr).toFixed(0)}° de la boussole : refusée (limite ±${CORRECTION_MAX_DEG}°)` };
    total += r.corr; last = r;
    if (r.cam !== cam) cam = Math.round(r.cam * 2) / 2;
    if (Math.abs(r.corr) < 0.1) break;
  }
  return { ok: true, corr: total, names: /** @type {{names: string[]}} */ (last).names, cam, cam0 };
}
