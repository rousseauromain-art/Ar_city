// @ts-check
/**
 * Bande des équipements, COMMUNE à tous les calques d'infrastructure (équipements urbains, pylônes télécom, repères hauts, couches personnelles) : aucun calque
 * ne dessine ni ne place sa bande lui-même. Les éléments d'une couche sont regroupés quand ils se touchent (même type, quelques pixels d'écart), chaque groupe
 * porte UNE icône (la plus proche) et une pastille du nombre, puis un nom : à côté de l'icône, sinon sous elle par lignes, sinon en haut d'écran.
 * Deux étages : la bande SOUS l'horizon (étage « bas ») ; si l'horizon est trop bas à l'écran pour la loger, la bande passe au-dessus (étage « haut »), posée AVANT
 * les lieux et limitée à leurs 3 lignes les plus basses. Reprend `drawInfra` de la v1. Entrées : couches (éléments déjà classés), vue, placeur partagé (réservations
 * et mémoire de ligne), géométrie de l'étage. Sortie : commandes de dessin, zones de toucher, statistiques. Dépend de : rendu/{commandes,projection,reservations,icones}.js.
 */
import { RAD } from '../noyau/constantes.js';
import { borner, ecartAngle } from '../noyau/maths.js';
import { trait, remplissage, texte } from './commandes.js';
import { commandeGlyphe } from './icones.js';
import { focalePx, yDepuisSite, xDepuisEcart } from './projection.js';
import { rectangleTouche } from './reservations.js';

/**
 * Élément d'une couche, prêt à poser.
 * @typedef {object} ElementBande
 * @property {string} nom @property {string} [lab] libellé court choisi par l'utilisateur (couches personnelles) @property {string} icone type de pictogramme
 * @property {number} dist @property {number} brg @property {boolean} [hl] site trouvé par la recherche : en gras, toujours nommé
 * @property {string} idMemoire identifiant stable (mémoire de la ligne du nom) @property {unknown} [source] objet d'origine (zones de toucher)
 */
/**
 * @typedef {object} CoucheBande
 * @property {string} cle @property {ElementBande[]} elements @property {{ligne: string, texte: string, icone: string}} couleur
 * @property {'icone'} [groupePar] regrouper par type d'icône (sinon par nom) @property {number} [rangees] rangées d'icônes sous l'horizon @property {number} [iconeDy] décalage des icônes sous l'horizon
 * @property {number} [tailleK] échelle des icônes @property {boolean} [aCote] nom d'abord à côté de l'icône @property {(el: ElementBande) => number | null} [ancre] angle du sommet réel d'un élément
 * @property {Record<string, string>} pluriels libellés au pluriel (par nom, ou par icône avec `groupePar`) @property {string} [pluralParDefaut]
 * @property {(items: ElementBande[]) => {pastilles: {k: string, col: string}[], g5: boolean}} [decorations] pastilles d'opérateurs et badge 5G d'un groupe
 */
/**
 * @typedef {object} OptionsBande
 * @property {'bas' | 'haut'} etage @property {number} hy ordonnée de l'horizon @property {number} basTexteLimite ordonnée en dessous de laquelle aucun nom ne descend
 * @property {number} hautLimite ordonnée au-dessus de laquelle aucun nom ne monte @property {number} debutBas ordonnée du début des lignes sous l'horizon
 * @property {boolean} calquesHautActifs calques Lieux ou Monuments actifs (sinon la bande récupère aussi le haut de l'écran)
 * @property {number} lignesMax @property {Map<string, number>} memoireLignes @property {(police: string, texte: string) => number} mesurerTexte
 * @property {{affichage: string, mono: string}} familles
 */

const RANGEE_PX = 15, PAS_LIGNE_PX = 20, TAILLE_PX = 13, ECART_GROUPE_PX = 28, ETENDUE_GROUPE_PX = 64, ECART_ICONE_PX = 22, ETENDUE_ICONE_PX = 44;
/** Pluriel d'un groupe de repères ou de pylônes (par nom du premier). */
export const PLURIELS_INFRA = Object.freeze(/** @type {Record<string, string>} */ ({ Tour: 'tours', Clocher: 'clochers', "Château d'eau": "châteaux d'eau", Cheminée: 'cheminées', Mât: 'mâts', Immeuble: 'immeubles', Pylône: 'pylônes', 'Toit-terrasse': 'toits-terrasses', Antenne: 'antennes' }));
/** Jointure du contexte quand la bande est posée : 'round' après les noms (étage bas), encore celle par défaut avant eux (étage haut) ; extrémité toujours par défaut. */
const JOINTURE_BAS = /** @type {const} */ ('round'), JOINTURE_HAUT = /** @type {const} */ ('miter'), E = /** @type {const} */ ('butt');

/** Hauteur (px) et opacité d'une icône d'équipement : grande de près, petite et plus pâle de loin (v1 : `infraIconLook`). @param {number} d distance en km */
export function aspectIcone(d) {
  const t = Math.max(0, Math.min(1, Math.log(Math.max(d, 0.05) / 0.3) / Math.log(15 / 0.3)));
  return { h: 26 - 16 * t, a: 1 - 0.5 * t };
}
/** Distance affichée : 1 décimale sous 10 km. @param {number} d */
export const kmCourt = (d) => (d < 10 ? d.toFixed(1) : String(Math.round(d)));

/**
 * @typedef {object} Groupe
 * @property {string} nom @property {string} gk @property {ElementBande[]} items @property {number[]} xs @property {number} dmin @property {boolean} hl
 * @property {number} x @property {number} h @property {number} row @property {number} base
 */

/** Regroupe les éléments visibles d'une couche : même type et peu d'écart sur l'écran. @param {CoucheBande} L @param {import('./projection.js').VueRendu} vue @returns {Groupe[]} */
function former(L, vue) {
  const vis = [], W = vue.largeurPx;
  for (const t of L.elements) {
    const dB = ecartAngle(t.brg - vue.capDeg);
    if (Math.abs(dB) > Math.min(80, vue.champDeg * 0.8)) continue;
    const x = xDepuisEcart(vue, dB);
    if (x < -20 || x > W + 20) continue;
    vis.push({ t, x });
  }
  vis.sort((a, b) => a.x - b.x);
  /** @type {Groupe[]} */
  const groupes = [];
  for (const v of vis) {
    // un groupe = même type, écarts de 28 px au plus, sur 64 px de large au plus (sinon une rue entière de toits-terrasses ne ferait qu'un groupe, ancré n'importe où)
    const gk = L.groupePar === 'icone' ? v.t.icone : (v.t.hl ? '*' : '') + (v.t.lab || v.t.nom), gapX = L.groupePar ? ECART_ICONE_PX : ECART_GROUPE_PX, spanX = L.groupePar ? ETENDUE_ICONE_PX : ETENDUE_GROUPE_PX;
    const g = groupes.find((o) => o.gk === gk && v.x - o.xs[o.xs.length - 1] <= gapX && v.x - o.xs[0] <= spanX);
    if (g) { g.items.push(v.t); g.xs.push(v.x); } else groupes.push({ nom: v.t.lab || v.t.nom, gk, items: [v.t], xs: [v.x], dmin: 0, hl: false, x: 0, h: 0, row: 0, base: 0 });
  }
  for (const g of groupes) { g.dmin = Math.min(...g.items.map((t) => t.dist)); g.hl = g.items.some((t) => t.hl); }
  groupes.sort((a, b) => (+b.hl - +a.hl) || a.dmin - b.dmin); // les plus proches se placent en premier
  return groupes;
}

const plusProche = (/** @type {ElementBande[]} */ items) => items.reduce((a, t) => (t.dist < a.dist ? t : a));

/**
 * Pose une couche. `placeur.reservations` est MODIFIÉ (icônes sous l'horizon, noms posés).
 * @param {CoucheBande} L @param {import('./projection.js').VueRendu} vue @param {ReturnType<typeof import('./placement.js').creerPlaceur>} placeur @param {OptionsBande} o
 * @param {{commandes: import('./commandes.js').Commande[], zones: ZoneBande[], nommes: number, iconeSeule: number}} sortie
 */
function poserCouche(L, vue, placeur, o, sortie) {
  const { commandes, zones } = sortie, W = vue.largeurPx, H = vue.hauteurPx, { hy, etage, mesurerTexte, familles, memoireLignes } = o, bas = etage === 'bas';
  const J = bas ? JOINTURE_BAS : JOINTURE_HAUT;
  const touche = (/** @type {number} */ x0, /** @type {number} */ x1, /** @type {number} */ y0, /** @type {number} */ y1, /** @type {number} */ m, /** @type {unknown} */ propre) => rectangleTouche(placeur.reservations, x0, x1, y0, y1, m, propre);
  const groupes = former(L, vue), ligne = L.couleur.ligne, tl = L.groupePar === 'icone';
  const poseZone = (/** @type {Groupe} */ g, /** @type {ElementBande} */ near, /** @type {number} */ x, /** @type {{x0: number, x1: number, y0: number, y1: number} | null} */ lab) => {
    const n = g.items.length, b = g.base;
    zones.push({ cle: L.cle, element: near, elements: g.items, genre: 'icone', x0: x - g.h / 2 - 4, x1: n > 1 ? x + g.h * 0.45 + 14 : x + g.h / 2 + 4, y0: b - g.h - (n > 1 ? 14 : 4), y1: b + 4 });
    if (lab) zones.push({ cle: L.cle, element: near, elements: g.items, genre: 'etiquette', ...lab });
  };
  // bande des équipements : icône SOUS la ligne d'horizon, sur L.rangees rangées (la plus proche d'abord, sans chevauchement) ;
  // un fil pointillé la relie à son azimut sur l'horizon ; le texte commence sous la dernière rangée
  const dy = bas && L.iconeDy ? L.iconeDy : 0, rangsOccupes = /** @type {[number, number][][]} */ ([]);
  for (const g of groupes) {
    const near = plusProche(g.items), n = g.items.length, look = aspectIcone(near.dist);
    g.x = n > 1 ? g.xs.reduce((a, b) => a + b, 0) / n : g.xs[0];
    g.h = (g.hl ? Math.max(24, look.h * 1.35) : look.h * (L.tailleK || 1)) + (n > 1 ? 3 : 0); g.row = 0;
    if (dy && L.rangees) {
      let r = 0;
      while (r < L.rangees - 1 && (rangsOccupes[r] || []).some(([a, b]) => g.x - g.h / 2 - 2 < b && g.x + g.h / 2 + 2 > a)) r++;
      (rangsOccupes[r] = rangsOccupes[r] || []).push([g.x - g.h / 2 - 2, g.x + g.h / 2 + 2]); g.row = r;
    }
    g.base = hy + dy + g.row * RANGEE_PX;
    // repères hauts : posés à leur SOMMET réel (sol + hauteur, vu d'ici), plus sur la ligne d'horizon
    if (!dy && L.ancre) { const a = L.ancre(near); if (a !== null && a !== undefined && isFinite(a)) { const y = yDepuisSite(vue, a); if (isFinite(y)) g.base = Math.max(o.hautLimite + g.h + 16, Math.min(H - 8, y)); } }
  }
  const lt = dy ? hy + dy + groupes.reduce((a, g) => Math.max(a, g.row), 0) * RANGEE_PX + 12 : o.debutBas;
  const iconTop = hy - 32;
  // 1) icônes : toutes, des plus lointaines aux plus proches (les proches par-dessus), taille selon la distance ;
  // un groupe de plusieurs éléments = UNE icône (la plus proche) + pastille du nombre
  for (const g of groupes.slice().sort((a, b) => b.dmin - a.dmin)) {
    const n = g.items.length, near = plusProche(g.items), x = g.x, lk = aspectIcone(near.dist), h = g.h - (n > 1 ? 3 : 0) || lk.h;
    if (dy) {
      commandes.push(trait([['M', x, hy + 1], ['L', x, g.base - g.h - 1]], ligne, 1, { tirets: [2, 3], jointure: J, extremite: E, alpha: 0.7 }));
      placeur.reservations.push([x - g.h / 2 - 3, x + g.h / 2 + 3, g.base - g.h - 3, g.base + 3, null, g]);
    }
    if (g.hl) { // site trouvé : halo jaune
      const cercle = /** @type {import('./commandes.js').OperationChemin[]} */ ([['A', x, g.base - h / 2, h * 0.78]]);
      commandes.push(remplissage(cercle, 'rgba(255,210,63,.22)'), trait(cercle, '#FFD23F', 2.5, { jointure: J, extremite: E }));
    }
    commandes.push(commandeGlyphe(near.icone || 'antenne', x, g.base, n > 1 ? h + 3 : h, L.couleur.icone, g.hl ? 1 : lk.a));
    if (n > 1) {
      const txt = n > 99 ? '99+' : String(n), bx = x + h * 0.45 + 4, by = g.base - h - 6, cercle = /** @type {import('./commandes.js').OperationChemin[]} */ ([['A', bx, by, 7.5]]);
      commandes.push(remplissage(cercle, 'rgba(14,26,43,.92)'), trait(cercle, L.couleur.icone, 1.5, { jointure: J, extremite: E }), texte(txt, bx, by + 3.2, `700 ${txt.length > 2 ? 7 : 9}px ${familles.mono}`, '#F3E9D2', { alignement: 'center' }));
    }
  }
  // 2) noms
  for (const g of groupes) {
    const sz = g.hl ? 17 : TAILLE_PX, n = g.items.length, near = plusProche(g.items), x = g.x;
    const libelle = n > 1 ? (tl ? `${n} ${L.pluriels[near.icone] || L.pluralParDefaut || 'lieux'}` : L.pluriels[g.nom] ? `${n} ${L.pluriels[g.nom]}` : `${n} × ${g.nom}`) : g.nom;
    const dmax = Math.max(...g.items.map((t) => t.dist)), dtxt = (n > 1 && kmCourt(g.dmin) !== kmCourt(dmax) ? `${kmCourt(g.dmin)}–${kmCourt(dmax)}` : kmCourt(g.dmin)) + ' km';
    const deco = L.decorations ? L.decorations(g.items) : { pastilles: [], g5: false }, ops = deco.pastilles, g5 = deco.g5;
    const police = `${g.hl ? 800 : 700} ${sz}px ${familles.affichage}`, policeDetail = `500 11px ${familles.mono}`;
    const nw = mesurerTexte(police, libelle), dw = mesurerTexte(policeDetail, dtxt), opsW = ops.length ? ops.length * 13 + 4 : 0, g5W = g5 ? 24 : 0, tw = nw + 7 + dw + opsW + g5W + 4;
    const flip = x + 6 + tw > W - 4;
    let tx = flip ? x - 6 - tw : x + 6, x0 = flip ? tx - 4 : x - 2, x1 = flip ? x + 2 : x + 6 + tw;
    // équipements : le nom se pose D'ABORD à côté de son icône (à droite, sinon à gauche), à la même hauteur, sans fil ; ce n'est qu'à défaut qu'il descend dans les lignes du bandeau (avec un fil)
    /** @type {{tx: number, y: number, x0: number, x1: number, fil: boolean} | null} */
    let bs = null;
    if (dy && L.aCote) {
      const cotes = x < W / 2 ? [1, -1] : [-1, 1], yb = g.base + 3;
      for (const side of cotes) {
        const bx = side > 0 ? x + g.h / 2 + 5 : x - g.h / 2 - 5 - tw;
        if (bx < 4 || bx + tw > W - 4 || yb + 4 > o.basTexteLimite) continue;
        if (!touche(bx - 3, bx + tw + 3, yb - sz - 2, yb + 4, 2, g)) { bs = { tx: bx, y: yb, x0: bx - 3, x1: bx + tw + 3, fil: false }; break; }
      }
      for (let k = 0; k < o.lignesMax && !bs; k++) {
        const y = lt + sz + k * PAS_LIGNE_PX;
        if (y + 4 > o.basTexteLimite) break;
        for (const side of cotes) {
          const bx = Math.max(4, Math.min(W - 4 - tw, side > 0 ? x - 4 : x + 4 - tw));
          if (!touche(bx - 2, bx + tw + 2, y - sz - 2, y + 4, 4, g)) { bs = { tx: bx, y, x0: bx - 2, x1: bx + tw + 2, fil: true }; break; }
        }
      }
    }
    const yDe = (/** @type {number} */ k) => (bas ? lt + sz + k * PAS_LIGNE_PX : iconTop - 6 - k * PAS_LIGNE_PX); // ligne de base du texte
    const tient = (/** @type {number} */ k) => { const y = yDe(k); if (bas ? y + 4 > o.basTexteLimite : y - sz - 2 < o.hautLimite) return -1; return touche(x0, x1, y - sz - 2, y + 4, 6, undefined) ? 0 : 1; };
    const cle = L.cle + '|' + g.nom + '|' + near.idMemoire, mem = memoireLignes.get(cle), kMax = g.hl ? o.lignesMax : bas ? o.lignesMax : 3;
    /** @type {number | null} */
    let k0 = null;
    if (bs) { /* nom à côté de l'icône : pas de ligne à chercher */ } else if (mem !== undefined && mem < kMax && tient(mem) === 1) k0 = mem;
    else for (let k = 0; k < kMax; k++) { const r = tient(k); if (r < 0) break; if (r === 1) { k0 = k; break; } }
    // rien au-dessus de l'horizon (calques Lieux et Monuments décochés) : les équipements récupèrent aussi le haut de l'écran quand la bande du bas est pleine
    /** @type {number | null} */
    let hautY = null;
    if (!bs && k0 === null && bas && !o.calquesHautActifs) {
      for (let k = 0; k < o.lignesMax; k++) { const y = hy - 38 - k * PAS_LIGNE_PX; if (y - sz - 2 < o.hautLimite) break; if (!touche(x0, x1, y - sz - 2, y + 4, 6, undefined)) { hautY = y; break; } }
    }
    if (g.hl && !bs && k0 === null && hautY === null) k0 = 0; // site recherché : son nom s'affiche toujours (au pire par-dessus d'autres)
    if (!bs && k0 === null && hautY === null) { sortie.iconeSeule += n; poseZone(g, near, x, null); continue; }
    if (k0 !== null) memoireLignes.set(cle, k0);
    sortie.nommes += n;
    const ly = bs ? bs.y : k0 !== null ? yDe(k0) : /** @type {number} */ (hautY), sous = !bs && k0 !== null && bas;
    if (bs) { tx = bs.tx; x0 = bs.x0; x1 = bs.x1; }
    placeur.reservations.push([x0, x1, ly - sz - 2, ly + 4]);
    if (!bs || bs.fil) {
      commandes.push(trait(bs || sous ? [['M', x, (dy ? g.base : hy) + 3], ['L', x, ly - sz - 1]] : [['M', x, iconTop], ['L', x, ly + 3]], ligne, 1, { jointure: J, extremite: E }));
    }
    const contour = (/** @type {number} */ largeur) => ({ couleur: 'rgba(14,26,43,.9)', largeur, jointure: J, extremite: E });
    if (g.hl) { // cartouche jaune autour du nom d'un site trouvé
      commandes.push(remplissage([['RC', x0, ly - sz - 2, x1 - x0, sz + 8]], 'rgba(14,26,43,.94)'), trait([['RC', x0 + 1, ly - sz - 1, x1 - x0 - 2, sz + 6]], '#FFD23F', 2, { jointure: J, extremite: E }));
    }
    commandes.push(texte(libelle, tx, ly, police, g.hl ? '#FFF3C4' : L.couleur.texte, { contour: contour(3.5) }), texte(dtxt, tx + nw + 7, ly, policeDetail, ligne, { contour: contour(3) }));
    let ox = tx + nw + 7 + dw + 6;
    for (const p of ops) { // pastille d'opérateur : cercle couleur de la marque + initiale
      const cercle = /** @type {import('./commandes.js').OperationChemin[]} */ ([['A', ox + 5, ly - 4, 5.5]]);
      commandes.push(remplissage(cercle, p.col), trait(cercle, 'rgba(14,26,43,.9)', 1, { jointure: J, extremite: E }), texte(p.k, ox + 5, ly - 1.2, `700 8px ${familles.mono}`, '#fff', { alignement: 'center' }));
      ox += 13;
    }
    if (g5) {
      const bx = ox + 2, bw = 20;
      commandes.push(remplissage([['RC', bx, ly - 11, bw, 12]], 'rgba(14,26,43,.9)'), trait([['RC', bx + 0.5, ly - 10.5, bw - 1, 11]], L.couleur.texte, 1, { jointure: J, extremite: E }), texte('5G', bx + bw / 2, ly - 2, `700 9px ${familles.mono}`, L.couleur.texte, { alignement: 'center' }));
    }
    poseZone(g, near, x, { x0, x1, y0: ly - sz - 2, y1: ly + 4 });
  }
}

/** @typedef {{cle: string, element: ElementBande, elements: ElementBande[], genre: 'icone' | 'etiquette', x0: number, x1: number, y0: number, y1: number}} ZoneBande */

/**
 * Bande complète : toutes les couches, dans l'ordre reçu (les équipements urbains d'abord, puis pylônes, repères, couches personnelles).
 * @param {CoucheBande[]} couches @param {import('./projection.js').VueRendu} vue @param {ReturnType<typeof import('./placement.js').creerPlaceur>} placeur @param {OptionsBande} o
 * @returns {{commandes: import('./commandes.js').Commande[], zones: ZoneBande[], stats: {nommes: number, iconeSeule: number, etage: 'bas' | 'haut'}}}
 */
export function composerBande(couches, vue, placeur, o) {
  const sortie = { commandes: /** @type {import('./commandes.js').Commande[]} */ ([]), zones: /** @type {ZoneBande[]} */ ([]), nommes: 0, iconeSeule: 0 };
  for (const L of couches) poserCouche(L, vue, placeur, o, sortie);
  return { commandes: sortie.commandes, zones: sortie.zones, stats: { nommes: sortie.nommes, iconeSeule: sortie.iconeSeule, etage: o.etage } };
}

/**
 * Sites trouvés par la recherche mais hors de l'écran : une pastille au bord, du côté où tourner (nom, distance), trois au plus (v1 : `drawHlPointers`).
 * @param {ElementBande[]} trouves éléments `hl` des couches actives (distance connue) @param {import('./projection.js').VueRendu} vue
 * @param {ReturnType<typeof import('./placement.js').creerPlaceur>} placeur @param {{hy: number, mesurerTexte: (police: string, texte: string) => number, familles: {affichage: string, mono: string}}} o
 */
export function pointeursHorsChamp(trouves, vue, placeur, { hy, mesurerTexte, familles }) {
  /** @type {import('./commandes.js').Commande[]} */
  const commandes = [];
  const W = vue.largeurPx, fh = focalePx(vue), tries = trouves.slice().sort((a, b) => a.dist - b.dist);
  let k = 0;
  for (const t of tries) {
    if (k >= 3) break;
    const dB = ecartAngle(t.brg - vue.capDeg), x = W / 2 + fh * Math.tan(borner(dB, -85, 85) * RAD);
    if (Math.abs(dB) <= Math.min(80, vue.champDeg * 0.8) && x >= -20 && x <= W + 20) continue; // visible : déjà posé dans la bande
    const droite = dB > 0, lab = `${droite ? '' : '◀ '}${(t.lab || t.nom || 'site').slice(0, 22)} · ${kmCourt(t.dist)} km${droite ? ' ▶' : ''}`;
    const w = mesurerTexte(`800 13px ${familles.affichage}`, lab) + 14, x0 = droite ? W - 6 - w : 6;
    let y = hy - 70 - k * 30;
    for (let a = 0; a < 6 && rectangleTouche(placeur.reservations, x0, x0 + w, y - 17, y + 7, 2); a++) y -= 30;
    placeur.reservations.push([x0, x0 + w, y - 17, y + 7]);
    commandes.push(remplissage([['RC', x0, y - 17, w, 24]], 'rgba(14,26,43,.94)'), trait([['RC', x0 + 1, y - 16, w - 2, 22]], '#FFD23F', 2, { jointure: JOINTURE_BAS, extremite: E }), texte(lab, x0 + 7, y, `800 13px ${familles.affichage}`, '#FFF3C4'));
    k++;
  }
  return commandes;
}
