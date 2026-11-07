// @ts-check
/**
 * Calque « couches personnelles » (KMZ/KML) : les points d'un fichier chargé par l'utilisateur, un calque par fichier, chacun de sa couleur, posés dans la bande des
 * équipements. La recherche met des sites en gras (`hl`) : ils sont toujours montrés et nommés, même au-delà de la distance réglée ; hors de l'écran, une pastille au bord
 * indique de quel côté tourner. Fonctions pures. Reprend la partie couches personnelles de `draw()` de la v1.
 * Entrées : couches (donnees/kml.js : sites déjà positionnés, `shown`). Sorties : éléments classés, couches de bande, sites trouvés. Dépend de : rendu/bande.js.
 */
import { PLURIELS_INFRA } from '../noyau/constantes.js';

/** @typedef {import('../donnees/kml.js').CouchePerso} CouchePerso */
/** @typedef {import('../donnees/kml.js').ItemPerso} ItemPerso */
/** @typedef {{el: ItemPerso, etat: 'net' | 'absent', raison: string | null}} SiteClasse */
/** @typedef {import('../rendu/bande.js').CoucheBande} CoucheBande */

/** Couleur CSS `#rrggbb` avec opacité (v1 : `hexA`). @param {string} h @param {number} a */
export const couleurAvecOpacite = (h, a) => { const n = parseInt(h.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };

/**
 * Sites d'une couche : nets si la couche est active et le site affichable (déjà trié et limité par `positionnerCouche`), sinon absents.
 * @param {CouchePerso} L @returns {SiteClasse[]}
 */
export function classerCouche(L) {
  if (!L.on || !L.shown || !L.shown.length) return [];
  return L.shown.map((el) => ({ el, etat: /** @type {const} */ ('net'), raison: null }));
}

/** Couche de bande d'une couche personnelle, ou null si elle n'a rien à montrer. @param {CouchePerso} L @returns {CoucheBande | null} */
export function preparerCouche(L) {
  const classes = classerCouche(L);
  if (!classes.length) return null;
  const elements = classes.map(({ el }) => ({ nom: el.name, lab: el.lab, icone: el.icon, dist: /** @type {number} */ (el.dist), brg: /** @type {number} */ (el.brg), hl: el.hl, idMemoire: String(el.name + el.lat), source: el }));
  return { cle: 'usr:' + L.id, elements, couleur: { ligne: couleurAvecOpacite(L.color, 0.85), texte: L.color, icone: L.color }, pluriels: PLURIELS_INFRA };
}

/** Sites trouvés par la recherche dans les couches actives, au format de la bande (pastilles hors champ). @param {CouchePerso[]} couches */
export function sitesTrouves(couches) {
  /** @type {import('../rendu/bande.js').ElementBande[]} */
  const out = [];
  for (const L of couches) if (L.on && L.items) for (const it of L.items) if (it.hl && it.dist !== null) out.push({ nom: it.name, lab: it.lab, icone: it.icon, dist: it.dist, brg: /** @type {number} */ (it.brg), hl: true, idMemoire: '', source: it });
  return out;
}

/** Calque couches personnelles (interface commune, REFONTE.md §7). */
export const calque = {
  id: 'kml',
  libelle: 'Couches personnelles',
  /** @param {unknown} _zone @param {{couches: CouchePerso[]}} donnees */
  async charger(_zone, donnees) { return donnees.couches; },
  classer: classerCouche,
  preparer: preparerCouche,
};
