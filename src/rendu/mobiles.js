// @ts-check
/**
 * Avions et bateaux à l'écran, COMMUN aux calques avions et bateaux : regroupement des icônes qui se touchent, réservation de leur place AVANT toute étiquette, dessin des icônes
 * (flèche d'avion, pentagone de navire pivoté au cap et coloré par catégorie, rond à l'arrêt) et noms d'avions. Un avion a son nom incliné d'abord, à plat sinon ; plusieurs avions
 * serrés : un nom chacun si tout tient, sinon « NOM +N ». Les noms de bateaux sont disposés par rendu/escalier.js. Reprend le bloc « mobiles » de `draw()` de la v1.
 * Entrées : mobiles classés (état net, position à l'écran), vue, placeur partagé. Sorties : commandes, zones de toucher. Dépend de : rendu/{commandes,placement,reservations,bande}.js, donnees/trafic.js.
 */
import { RAD } from '../noyau/constantes.js';
import { ecartAngle } from '../noyau/maths.js';
import { trait, remplissage, texte, groupe } from '../noyau/commandes.js';
import { ANGLE_NOM_RAD } from './placement.js';
import { kmCourt } from './bande.js';
import { NAVIRE_ARRET_MS, categorieNavire } from '../donnees/trafic.js';

/** @typedef {import('../donnees/trafic.js').Mobile & {x: number, y: number}} MobileEcran */
/** @typedef {{kind: 'plane' | 'ship', x: number, y: number, items: {m: import('../donnees/trafic.js').Mobile, x: number, y: number}[]}} GroupeMobiles */

const COULEUR_AVION = '#8FD3FF';
const J = /** @type {const} */ ('round'), E = /** @type {const} */ ('butt');
/** Écart (px) sous lequel deux icônes de même nature sont regroupées. */
const ECART_X_PX = 16, ECART_Y_PX = 12;

/**
 * Regroupe les mobiles à l'écran : même nature, moins de 16 px en abscisse et 12 px en ordonnée du PREMIER du groupe (v1 : `mobGroups`). L'ordre reçu (par distance) est conservé.
 * @param {MobileEcran[]} mobiles @returns {GroupeMobiles[]}
 */
export function grouperMobiles(mobiles) {
  /** @type {GroupeMobiles[]} */
  const groupes = [];
  for (const m of mobiles) {
    const g = groupes.find((o) => o.kind === m.kind && Math.abs(o.x - m.x) < ECART_X_PX && Math.abs(o.y - m.y) < ECART_Y_PX);
    if (g) g.items.push({ m, x: m.x, y: m.y }); else groupes.push({ kind: m.kind, x: m.x, y: m.y, items: [{ m, x: m.x, y: m.y }] });
  }
  return groupes;
}

/** Réserve la place de chaque icône (18 px de côté) : aucune étiquette ne passera dessus. @param {GroupeMobiles[]} groupes @param {import('./reservations.js').Reservation[]} reservations */
export function reserverIcones(groupes, reservations) {
  for (const g of groupes) for (const it of g.items) reservations.push([it.x - 9, it.x + 9, it.y - 9, it.y + 9, null, g]);
}

/** Icônes : flèche d'avion, pentagone de navire (pivoté au cap), rond de navire à l'arrêt. @param {GroupeMobiles[]} groupes @param {import('../noyau/projection.js').VueRendu} vue @param {{jointure?: 'miter' | 'round' | 'bevel'}} [o] */
export function commandesIcones(groupes, vue, { jointure = J } = {}) {
  /** @type {import('../noyau/commandes.js').Commande[]} */
  const commandes = [];
  const style = { jointure, extremite: E };
  for (const g of groupes) {
    const air = g.kind === 'plane';
    for (const { m, x, y } of g.items) {
      const col = air ? COULEUR_AVION : categorieNavire(m.type).col;
      if (!air && m.vel < NAVIRE_ARRET_MS) {
        const cercle = /** @type {import('../noyau/commandes.js').OperationChemin[]} */ ([['A', x, y, 4.5]]);
        commandes.push(trait(cercle, 'rgba(14,26,43,.85)', 2, style), remplissage(cercle, col));
        continue;
      }
      /** @type {import('../noyau/commandes.js').OperationChemin[]} */
      const forme = air ? [['M', 0, -8], ['L', 6, 7], ['L', 0, 4], ['L', -6, 7], ['Z']] : [['M', 0, -7], ['L', 4.5, 2], ['L', 3, 6], ['L', -3, 6], ['L', -4.5, 2], ['Z']];
      commandes.push(groupe(x, y, ecartAngle(m.trk - vue.capDeg) * RAD, [trait(forme, 'rgba(14,26,43,.85)', 2.5, style), remplissage(forme, col)]));
    }
  }
  return commandes;
}

/**
 * Noms des avions (les bateaux : rendu/escalier.js). `placeur.reservations` est MODIFIÉ.
 * @param {GroupeMobiles[]} groupes @param {ReturnType<typeof import('./placement.js').creerPlaceur>} placeur
 * @param {{mesurerTexte: (police: string, texte: string) => number, familles: {affichage: string, mono: string}, distances: boolean, jointure?: 'miter' | 'round' | 'bevel'}} o
 */
export function composerAvions(groupes, placeur, { mesurerTexte, familles, distances, jointure = J }) {
  const W = placeur.largeurPx, size = 13;
  /** @type {import('../noyau/commandes.js').Commande[]} */
  const commandes = [];
  /** @type {{avion: import('../donnees/trafic.js').Mobile, avions: import('../donnees/trafic.js').Mobile[], icone: number[], poly: number[][] | null}[]} */
  const zones = [];
  const style = { jointure, extremite: E }, police = `700 ${size}px ${familles.affichage}`, policeDetail = `500 11px ${familles.mono}`;

  /** Place le nom d'un groupe d'avions (sans dessin) : incliné d'abord, à plat sinon ; null s'il n'y a de place nulle part. @param {GroupeMobiles} g @param {{m: import('../donnees/trafic.js').Mobile, x: number, y: number}[]} its */
  function specifier(g, its) {
    const near = its[0].m, n = its.length, x = its[0].x, y = its[0].y, lab = (near.name || '?') + (n > 1 ? ` +${n - 1}` : '');
    const extra = Math.round(near.alt * 3.281 / 100) * 100 + ' ft', dist = distances ? kmCourt(near.dist) + ' km' : '', dtxt = [extra, dist].filter(Boolean).join(' · ');
    const nw = mesurerTexte(police, lab), dw = dtxt ? mesurerTexte(policeDetail, dtxt) : 0, len = nw + (dtxt ? dw + 7 : 0) + 4;
    const ps = placeur.placerIncline({ x, base: y, off: 8, lift: 9, len, padTop: size + 2, padBot: 3, side: x < W / 2 ? -1 : 1, own: g, memKey: 'mob|' + near.name });
    const fl = ps ? null : placeur.placerAPlat({ x, y0: y - 12, halfW: 8, w: len, size, own: g, dir: -1 });
    if (!fl && !ps) return null;
    const reservations = placeur.reservations;
    return { near, its, x, y, lab, dtxt, nw, fl, ps, poly: ps ? ((reservations[reservations.length - 1] || [])[4] || null) : null };
  }
  /** @param {NonNullable<ReturnType<typeof specifier>>} s */
  function dessiner(s) {
    const { x, y, lab, dtxt, nw, fl, ps } = s, contour = (/** @type {number} */ largeur) => ({ couleur: 'rgba(14,26,43,.9)', largeur, jointure, extremite: E });
    if (fl) { // nom à plat : fil de l'icône au bord du nom le plus proche
      const ex = fl.side > 0 ? fl.x - 2 : fl.x + fl.w + 2, ey = fl.y - size * 0.35;
      commandes.push(trait([['M', x, y - 7], ['L', ex, ey]], COULEUR_AVION, 1, { alpha: 0.7, ...style }), texte(lab, fl.x, fl.y, police, COULEUR_AVION, { contour: contour(3.5) }));
      if (dtxt) commandes.push(texte(dtxt, fl.x + nw + 7, fl.y, policeDetail, 'rgba(224,165,38,1)', { contour: contour(3) }));
      return;
    }
    const sgn = /** @type {{side: number, lx: number, ly: number}} */ (ps).side, lx = /** @type {{lx: number}} */ (ps).lx, ly = /** @type {{ly: number}} */ (ps).ly, align = sgn > 0 ? 'left' : 'right';
    commandes.push(trait([['M', x, y - 7], ['L', lx, ly]], COULEUR_AVION, 1, { alpha: 0.8, ...style }));
    const enfants = [texte(lab, 0, 0, police, COULEUR_AVION, { alignement: align, contour: contour(3.5) })];
    if (dtxt) enfants.push(texte(dtxt, sgn * (nw + 7), 0, policeDetail, 'rgba(224,165,38,1)', { alignement: align, contour: contour(3) }));
    commandes.push(groupe(lx, ly, -sgn * ANGLE_NOM_RAD, enfants));
  }
  /** @param {ReturnType<typeof specifier>} s @param {{m: import('../donnees/trafic.js').Mobile, x: number, y: number}[]} its */
  function zone(s, its) {
    const xs = its.map((it) => it.x), ys = its.map((it) => it.y), icone = [Math.min(...xs) - 9, Math.max(...xs) + 9, Math.min(...ys) - 9, Math.max(...ys) + 9];
    /** @type {number[][] | null} */
    let poly = null;
    if (s) poly = s.fl ? [[s.fl.x - 2, s.fl.y - size - 2], [s.fl.x + s.fl.w + 2, s.fl.y - size - 2], [s.fl.x + s.fl.w + 2, s.fl.y + 4], [s.fl.x - 2, s.fl.y + 4]] : s.poly;
    zones.push({ avion: its[0].m, avions: its.map((it) => it.m), icone, poly });
  }
  for (const g of groupes) {
    if (g.kind !== 'plane') continue;
    if (g.items.length > 1) { // un nom par avion si tout tient
      const p0 = placeur.reservations.length, specs = [];
      for (const it of g.items) { const s = specifier(g, [it]); if (!s) break; specs.push(s); }
      if (specs.length === g.items.length) { for (const s of specs) { zone(s, s.its); dessiner(s); } continue; }
      placeur.reservations.length = p0; // sinon un seul nom « NOM +N » pour le groupe
    }
    const s = specifier(g, g.items);
    zone(s, g.items);
    if (s) dessiner(s);
  }
  return { commandes, zones };
}
