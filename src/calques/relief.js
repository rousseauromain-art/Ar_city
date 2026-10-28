// @ts-check
/**
 * Calque « relief » : silhouette du relief (trait gradué par la distance) et crêtes intérieures, avec la distance de chaque plan.
 * Entrées : terrain calculé (masque `pm`), vue de rendu, réglages. Sortie : commandes de dessin (rendu/commandes.js). Aucun accès au canvas.
 * Règles d'affichage : Essentiel = crêtes principales (vrai décrochement de plan) ; Tout voir = toutes les crêtes (v1 : bloc « crêtes intérieures »).
 * Dépend de : scene/cretes.js, rendu/projection.js, rendu/commandes.js, noyau.
 */
import { CRETE_DIST_MIN_KM, CRETE_DENIVELE_ESSENTIEL_M, CRETE_DENIVELE_TOUT_M } from '../noyau/constantes.js';
import { PAS_RELEVEMENT_DEG } from '../scene/relief.js';
import { lignesDeCretes, angleSilhouette, distancesSilhouette, distanceSilhouette } from '../scene/cretes.js';
import { ecartDepuisX, xDepuisEcart, yDepuisSite, demiChampDeg } from '../rendu/projection.js';
import { trait, remplissage, texte, courbeParLesMilieux } from '../rendu/commandes.js';

/** @typedef {import('../rendu/projection.js').VueRendu} VueRendu */
/** @typedef {import('../rendu/commandes.js').Commande} Commande */
/** @typedef {import('../scene/cretes.js').LigneCrete} LigneCrete */
/** @typedef {import('../scene/masque.js').Masque} Masque */
/** @typedef {{etat: 'net' | 'transparent' | 'absent', raison: string | null, el: LigneCrete}} CreteClassee */
/**
 * @typedef {object} ReglagesRelief
 * @property {boolean} silhouette tracé de la silhouette et des crêtes (réglage « ligne d'horizon », v1 : `S.skyline`)
 * @property {boolean} cretes crêtes intérieures (v1 : `S.ridges !== false`) @property {boolean} distances pastilles de distance des plans (v1 : `S.showDist`)
 * @property {boolean} toutVoir bouton œil (v1 : `S.beyond`)
 */

/** Seuils par mode (v1 : `minG`, `minLen`, `minD`, `RIDGE_DROP_*`). */
const SEUILS = {
  essentiel: { gradient: 1.6, longueurDeg: 4, distKm: 1, deniveleM: CRETE_DENIVELE_ESSENTIEL_M },
  toutVoir: { gradient: 1.25, longueurDeg: 1.5, distKm: CRETE_DIST_MIN_KM, deniveleM: CRETE_DENIVELE_TOUT_M },
};

/** Lignes de crêtes mémorisées par masque (le calcul est lourd, le masque ne change qu'à chaque nouveau terrain). @type {WeakMap<object, LigneCrete[]>} */
const memoCretes = new WeakMap();
/** Distances de silhouette mémorisées par masque. @type {WeakMap<object, Float32Array>} */
const memoDistances = new WeakMap();

/** @param {Masque} pm */
function cretesDe(pm) { let l = memoCretes.get(pm); if (!l) { l = lignesDeCretes(pm); memoCretes.set(pm, l); } return l; }
/** @param {Masque} pm */
function distancesDe(pm) { let d = memoDistances.get(pm); if (!d) { d = distancesSilhouette(pm); memoDistances.set(pm, d); } return d; }

/**
 * Classe les crêtes : nettes si elles passent les seuils du mode, sinon absentes avec la raison.
 * @param {LigneCrete[]} lignes @param {{toutVoir: boolean}} reglages
 * @returns {CreteClassee[]}
 */
export function classerCretes(lignes, { toutVoir }) {
  const s = toutVoir ? SEUILS.toutVoir : SEUILS.essentiel;
  return lignes.map((el) => {
    /** @type {string | null} */
    let raison = null;
    if (el.g < s.gradient) raison = 'plan trop proche du suivant';
    else if (el.len < s.longueurDeg) raison = 'crête trop courte';
    else if (el.d < s.distKm) raison = 'crête trop proche';
    else if (el.drop < s.deniveleM) raison = 'dénivelé caché trop faible';
    return { el, etat: raison ? 'absent' : 'net', raison };
  });
}

/** Bande de profondeur d'un tronçon de silhouette : 0 proche (< 3 km), 1 moyen (< 15 km), 2 lointain ou inconnu. @param {number | null} d */
const bande = (d) => (d === null ? 2 : d < 3 ? 0 : d < 15 ? 1 : 2);
/** [épaisseur, opacité] par bande. */
const STYLE_BANDE = [[1.6, 0.98], [1.25, 0.85], [1, 0.62]];

/**
 * Silhouette du relief : échantillonnée tous les 3 px, lissée (noyau 1-2-1), tracée en courbes ; trait fin et transparent au loin.
 * @param {Masque} pm @param {VueRendu} vue
 * @returns {Commande[]}
 */
export function commandesSilhouette(pm, vue) {
  const W = vue.largeurPx, dists = distancesDe(pm);
  /** @type {({x: number, e: number, d: number | null, es?: number, y?: number} | null)[]} */
  const pts = [];
  for (let x = -40; x <= W + 40; x += 3) {
    const brg = (vue.capDeg + ecartDepuisX(vue, x) + 360) % 360, e = angleSilhouette(pm, brg);
    pts.push(e < -10 ? null : { x, e, d: distanceSilhouette(dists, brg) });
  }
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (!p) continue;
    const a = pts[i - 1] || p, b = pts[i + 1] || p;
    p.es = (a.e + 2 * p.e + b.e) / 4;
    p.y = yDepuisSite(vue, p.es);
  }
  /** @type {{x: number, y: number, d: number | null}[][]} */
  const runs = [];
  /** @type {{x: number, y: number, d: number | null}[]} */
  let cur = [];
  for (const p of pts) { if (p) cur.push({ x: p.x, y: /** @type {number} */ (p.y), d: p.d }); else if (cur.length) { runs.push(cur); cur = []; } }
  if (cur.length) runs.push(cur);
  const rond = { jointure: /** @type {'round'} */ ('round'), extremite: /** @type {'round'} */ ('round') };
  /** @type {Commande[]} */
  const out = [];
  out.push(trait(runs.filter((r) => r.length > 1).flatMap((r) => courbeParLesMilieux(r)), 'rgba(14,26,43,.45)', 3.2, rond)); // halo : un seul tracé
  for (const run of runs) {
    let s = 0;
    for (let i = 1; i <= run.length; i++) {
      if (i === run.length || bande(run[i].d) !== bande(run[s].d)) {
        const j = Math.min(i, run.length - 1);
        if (j > s) { const [lw, al] = STYLE_BANDE[bande(run[s].d)]; out.push(trait(courbeParLesMilieux(run, s, j), `rgba(243,233,210,${al})`, lw, rond)); }
        s = i;
      }
    }
  }
  return out;
}

/** Couleur d'une crête selon sa distance : crème (proche) → bleutée (lointaine), perspective atmosphérique. @param {number} d */
function couleurCrete(d) {
  const t = Math.min(1, Math.max(0, Math.log(d / 1.5) / Math.log(30 / 1.5))), m = (/** @type {number} */ a, /** @type {number} */ b) => Math.round(a + (b - a) * t);
  return /** @type {[number, number, number]} */ ([m(243, 190), m(233, 214), m(210, 240)]);
}
const kmCourt = (/** @type {number} */ d) => (d < 10 ? d.toFixed(1) : String(Math.round(d)));

/**
 * Crêtes intérieures nettes + une pastille de distance par plan (4 au plus, du plan le plus étendu au moins étendu, sans chevauchement).
 * @param {CreteClassee[]} classes @param {VueRendu} vue @param {{distances: boolean, mesurerTexte: (police: string, texte: string) => number}} options
 * @returns {Commande[]}
 */
export function commandesCretes(classes, vue, { distances, mesurerTexte }) {
  const W = vue.largeurPx, hf = demiChampDeg(vue), rond = { jointure: /** @type {'round'} */ ('round'), extremite: /** @type {'round'} */ ('round') };
  /** @type {Commande[]} */
  const out = [];
  /** @type {{x: number, y: number, d: number, n: number, c: [number, number, number]}[]} */
  const etiquettes = [];
  for (const { el: L, etat } of classes) {
    if (etat === 'absent') continue;
    /** @type {{x: number, y: number}[][]} */
    const runs = [];
    /** @type {{x: number, y: number}[]} */
    let cur = [];
    for (const p of L.pts) {
      const dB = ((p.i * PAS_RELEVEMENT_DEG - vue.capDeg + 540) % 360) - 180;
      if (Math.abs(dB) > hf) { if (cur.length) runs.push(cur); cur = []; continue; }
      cur.push({ x: xDepuisEcart(vue, dB), y: yDepuisSite(vue, p.a) });
    }
    if (cur.length) runs.push(cur);
    const [r, g, b] = couleurCrete(L.d), lw = L.d < 3 ? 1.4 : L.d < 12 ? 1.2 : 1.0, al = L.d < 3 ? 0.9 : L.d < 12 ? 0.8 : 0.7;
    for (const run of runs) {
      if (run.length < 2) continue;
      const chemin = courbeParLesMilieux(run);
      out.push(trait(chemin, 'rgba(14,26,43,.35)', lw + 1.8, rond), trait(chemin, `rgba(${r},${g},${b},${al})`, lw, rond));
      if (run.length >= 6) { let top = run[0]; for (const q of run) if (q.y < top.y) top = q; etiquettes.push({ x: top.x, y: top.y, d: L.d, n: run.length, c: [r, g, b] }); }
    }
  }
  if (distances && etiquettes.length) out.push(...commandesPastilles(etiquettes, W, mesurerTexte));
  return out;
}

/** @param {{x: number, y: number, d: number, n: number, c: [number, number, number]}[]} etiquettes @param {number} W @param {(police: string, texte: string) => number} mesurerTexte @returns {Commande[]} */
function commandesPastilles(etiquettes, W, mesurerTexte) {
  const police = '600 10px "IBM Plex Mono",monospace';
  /** @type {Map<number, (typeof etiquettes)[number]>} */
  const plans = new Map();
  for (const t of etiquettes) { const k = Math.round(Math.log(t.d) / Math.log(1.6)), o = plans.get(k); if (!o || t.n > o.n) plans.set(k, t); }
  /** @type {{x: number, y: number, w: number}[]} */
  const utilisees = [];
  /** @type {Commande[]} */
  const out = [];
  for (const t of [...plans.values()].sort((a, b) => b.n - a.n).slice(0, 4)) {
    const s = kmCourt(t.d) + ' km', w = mesurerTexte(police, s) + 10, x = Math.max(w / 2 + 6, Math.min(W - w / 2 - 6, t.x)), y = t.y + 11;
    if (utilisees.some((u) => Math.abs(u.x - x) < (w + u.w) / 2 + 4 && Math.abs(u.y - y) < 16)) continue;
    utilisees.push({ x, y, w });
    out.push(remplissage([['R', x - w / 2, y - 7, w, 14, 7]], 'rgba(14,26,43,.62)'));
    out.push(texte(s, x, y + 0.5, police, `rgba(${t.c[0]},${t.c[1]},${t.c[2]},.95)`, { alignement: 'center', ligneDeBase: 'middle' }));
  }
  return out;
}

/**
 * Calque relief (interface commune, REFONTE.md §7). `donnees.terrain.pm` : masque du relief (scene/terrain.js).
 */
export const calque = {
  id: 'relief',
  libelle: 'Relief',
  /** Crêtes intérieures du terrain courant. @param {unknown} _zone @param {{terrain: {pm: Masque} | null}} donnees */
  async charger(_zone, donnees) { return donnees.terrain ? cretesDe(donnees.terrain.pm) : []; },
  /** @param {LigneCrete[]} lignes @param {unknown} _scene @param {{toutVoir: boolean}} reglages */
  classer(lignes, _scene, reglages) { return classerCretes(lignes, reglages); },
  /**
   * @param {CreteClassee[]} classes @param {VueRendu} vue
   * @param {{terrain: {pm: Masque} | null, reglages: ReglagesRelief, mesurerTexte: (police: string, texte: string) => number}} contexte
   * @returns {Commande[]}
   */
  preparer(classes, vue, { terrain, reglages, mesurerTexte }) {
    if (!reglages.silhouette || !terrain) return [];
    return [...commandesSilhouette(terrain.pm, vue), ...(reglages.cretes ? commandesCretes(classes, vue, { distances: reglages.distances, mesurerTexte }) : [])];
  },
};

