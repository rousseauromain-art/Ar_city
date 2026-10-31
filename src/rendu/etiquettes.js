// @ts-check
/**
 * Pose et dessin des noms (étiquettes) de tous les calques : l'ordre reçu est l'ordre de priorité ; chaque nom est placé par rendu/placement.js,
 * puis converti en commandes de dessin. Deux styles : « lieu » (point sur le sol, fil, nom incliné) et « monument » (silhouette à taille réelle ou
 * pictogramme, regroupement « +N » des icônes qui se touchent, nom incliné à côté de l'icône, repli sur un nom à plat). Les icônes de monuments sont
 * réservées AVANT tous les noms. Aucun calque ne place ni ne dessine ses noms lui-même. Reprend la boucle des noms de `draw()` de la v1.
 * Dépend de : rendu/commandes.js, rendu/placement.js, rendu/icones.js.
 */
import { trait, remplissage, texte, groupe } from './commandes.js';
import { ANGLE_NOM_RAD } from './placement.js';
import { commandeGlyphe, commandesSilhouetteMonument } from './icones.js';

/**
 * Étiquette à poser (style « lieu » : point sur le sol, fil, nom incliné).
 * @typedef {object} Etiquette
 * @property {'lieu'} [style] @property {string} cle clé de la mémoire de placement @property {unknown} proprietaire
 * @property {string} texte @property {string} detail ex. « 12 m · 3,4 km » (peut être vide) @property {number} taille corps du nom (px)
 * @property {number} x abscisse de l'ancre @property {number} y ordonnée de l'ancre
 * @property {number} opacite opacité de base (déjà réduite pour un fantôme) @property {string} teinte « r,g,b » @property {boolean} fantome
 * @property {number} decalage décalage horizontal du départ du nom @property {number} elevation hauteur du départ du nom
 * @property {boolean} [remarquable] lieu remarquable (phare, cap, plage…) : fil et point de la couleur du nom, au lieu du blanc
 */
/**
 * Étiquette de style « monument » : l'icône (x, y = sommet) est dessinée, avec ou sans nom.
 * @typedef {Omit<Etiquette, 'style'> & {style: 'monument', icone: {type: string, gH: number, yTerre: number,
 *   boite: {cle: string, x0: number, x1: number, yTop: number, yBase: number, w: number} | null}}} EtiquetteMonument
 */
/** @typedef {{affichage: string, mono: string}} Familles polices du titre et du détail */
/**
 * @typedef {object} ComptesEtiquettes
 * @property {number} eligibles dans le champ (après regroupement des icônes) @property {number} affichees nets dont le nom est posé @property {number} fantomes transparents dont le nom est posé
 * @property {number} sansPlace faute de place pour le nom @property {number} fantomesVus fantômes dans le champ, comptés dans la boucle (après regroupement)
 */

/**
 * Zone de toucher d'un nom ou d'une icône de monument : `element` est l'objet d'origine (lieu, monument), `icone` un rectangle [x0, x1, y0, y1] ou `poly` des sommets [x, y].
 * @typedef {{element: unknown, icone: number[] | null, poly: number[][] | null}} ZoneEtiquette
 */

/**
 * Rectangle du texte d'un nom incliné : ancre (ax, ay), rotation `angle` (rad, comme `groupe`), `largeur` signée (le nom part vers la droite ou la gauche), `haut` au-dessus et `bas` sous la ligne de base.
 * @param {number} ax @param {number} ay @param {number} angle @param {number} largeur @param {number} haut @param {number} bas @returns {number[][]}
 */
export function rectangleIncline(ax, ay, angle, largeur, haut, bas) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return [[0, -haut], [largeur, -haut], [largeur, bas], [0, bas]].map(([x, y]) => [ax + x * c - y * s, ay + x * s + y * c]);
}

/** Plus petite part de l'icône qui doit se chevaucher pour être regroupée derrière une plus connue. */
const CHEVAUCHEMENT_REGROUPEMENT = 0.45;

/**
 * Regroupe les icônes de monument SANS silhouette qui se chevauchent : la première (la plus prioritaire) reste, les autres sont retirées et comptées sur elle.
 * @param {(Etiquette | EtiquetteMonument)[]} ordre @returns {{retirees: Set<unknown>, plus: Map<unknown, number>}}
 */
function regrouperIcones(ordre) {
  /** @type {{e: EtiquetteMonument, b: number[], g: number}[]} */
  const gardees = [];
  /** @type {Set<unknown>} */
  const retirees = new Set();
  /** @type {Map<unknown, number>} */
  const plus = new Map();
  for (const e of ordre) {
    if (e.style !== 'monument' || e.icone.boite) continue;
    const g = e.icone.gH, b = [e.x - g / 2, e.x + g / 2, e.y - g, e.y];
    const k = gardees.find((o) => Math.min(o.b[1], b[1]) - Math.max(o.b[0], b[0]) > Math.min(g, o.g) * CHEVAUCHEMENT_REGROUPEMENT && b[2] < o.b[3] && b[3] > o.b[2]);
    if (k) { retirees.add(e); plus.set(k.e, (plus.get(k.e) || 0) + 1); } else gardees.push({ e, b, g });
  }
  return { retirees, plus };
}

/**
 * @param {(Etiquette | EtiquetteMonument)[]} etiquettes dans l'ordre de priorité
 * @param {ReturnType<typeof import('./placement.js').creerPlaceur>} placeur
 * @param {{mesurerTexte: (police: string, texte: string) => number, familles: Familles, avantNoms?: () => void}} options `avantNoms` : appelée après la réservation des icônes de monuments et avant le placement des noms (la bande des équipements, quand elle passe au-dessus de l'horizon)
 * @returns {{commandes: import('./commandes.js').Commande[], comptes: ComptesEtiquettes, zones: ZoneEtiquette[]}}
 */
export function composerEtiquettes(etiquettes, placeur, { mesurerTexte, familles, avantNoms }) {
  /** @type {import('./commandes.js').Commande[]} */
  const commandes = [];
  const comptes = { eligibles: 0, affichees: 0, fantomes: 0, sansPlace: 0, fantomesVus: 0 };
  /** Zones de toucher : un nom posé (polygone, incliné comme lui) ou l'icône d'un monument (rectangle). Format des zones d'avions et de bateaux. @type {ZoneEtiquette[]} */
  const zones = [];
  const { retirees, plus } = regrouperIcones(etiquettes);
  const ordre = etiquettes.filter((e) => !retirees.has(e));
  // les icônes des monuments sont réservées AVANT tout le reste : aucun nom ne peut passer dessus
  for (const e of ordre) {
    if (e.style !== 'monument') continue;
    const sb = e.icone.boite, g = e.icone.gH;
    placeur.reservations.push(sb ? [sb.x0 - 2, sb.x1 + 2, sb.yTop - 2, sb.yBase + 2, null, e.proprietaire] : [e.x - g / 2 - 2, e.x + g / 2 + 2, e.y - g - 2, e.y + 2, null, e.proprietaire]);
  }
  if (avantNoms) avantNoms();
  for (const e of ordre) {
    comptes.eligibles++;
    if (e.fantome) comptes.fantomesVus++;
    const police = `700 ${e.taille}px ${familles.affichage}`, policeDetail = `500 11px ${familles.mono}`, mon = e.style === 'monument';
    const sgn = e.x < placeur.largeurPx / 2 ? -1 : 1;
    const nw = mesurerTexte(police, e.texte), dw = e.detail ? mesurerTexte(policeDetail, e.detail) : 0, largeurTotale = nw + (e.detail ? dw + 7 : 0);
    const ps = placeur.placerIncline({ x: e.x, base: mon ? e.y - 4 : e.y, off: e.decalage, lift: e.elevation, len: largeurTotale + 4, padTop: e.taille + 2, padBot: 3, side: sgn, own: e.proprietaire, memKey: e.cle });
    // monument sans place pour un nom incliné (fréquent en paysage : posé à son sommet réel, il part déjà haut) : repli sur un nom à plat, plus compact en hauteur
    const gH = mon ? e.icone.gH : 0;
    const plat = !ps && mon ? placeur.placerAPlat({ x: e.x, y0: e.y - gH - 2, halfW: gH / 2, w: largeurTotale, size: e.taille, own: e.proprietaire, dir: -1 }) : null;
    if (!ps && !plat) { comptes.sansPlace++; if (!mon) continue; } // un monument garde toujours son icône, même sans place pour son nom
    else if (e.fantome) comptes.fantomes++; else comptes.affichees++;
    const alpha = e.opacite, ghost = e.fantome;
    let leadY = e.y, boiteIcone = [0, 0, 0, 0];
    if (mon) {
      const ic = e.icone, sb = ic.boite;
      if (sb) { commandes.push(...commandesSilhouetteMonument(sb.cle, e.x, sb.yTop, sb.yBase, 0.26 * alpha, 0.95 * alpha)); boiteIcone = [sb.x0, sb.x1, sb.yTop, sb.yBase]; leadY = e.y + 1; }
      else {
        if (ic.yTerre - e.y > 8) commandes.push(trait([['M', e.x, ic.yTerre], ['L', e.x, e.y]], `rgba(${e.teinte},${0.45 * alpha})`, 1, { tirets: [2, 3], jointure: 'round' }));
        commandes.push(commandeGlyphe(ic.type, e.x, e.y, ic.gH, `rgb(${e.teinte})`, alpha));
        boiteIcone = [e.x - ic.gH / 2, e.x + ic.gH / 2, e.y - ic.gH, e.y]; leadY = e.y - ic.gH * 0.45;
        const n = plus.get(e) || 0;
        if (n > 0) { // pastille : monuments regroupés derrière cette icône
          const bx = e.x + ic.gH / 2 + 1, by = e.y - ic.gH - 1;
          commandes.push(remplissage([['A', bx, by, 7]], 'rgba(14,26,43,.92)'), trait([['A', bx, by, 7]], `rgb(${e.teinte})`, 1.3, { jointure: 'round' }),
            texte('+' + (n > 99 ? '99' : n), bx, by + 2.9, `700 8px ${familles.mono}`, '#F3E9D2', { alignement: 'center' }));
        }
      }
      zones.push({ element: e.proprietaire, icone: [boiteIcone[0] - 4, boiteIcone[1] + 4, boiteIcone[2] - 4, boiteIcone[3] + 4], poly: null });
      if (!ps && !plat) continue;
    }
    const contour = (/** @type {number} */ largeur) => ({ couleur: `rgba(14,26,43,${ghost ? 0.6 : 0.9})`, largeur, jointure: /** @type {'round'} */ ('round') });
    if (plat) {
      const ex = plat.side > 0 ? plat.x - 2 : plat.x + plat.w + 2, ey = plat.y - e.taille * 0.35; // bord du nom le plus proche de l'icône
      if (Math.hypot(ex - e.x, ey - (e.y - gH)) > 6) commandes.push(trait([['M', e.x, boiteIcone[2] - 1], ['L', ex, ey]], `rgba(${e.teinte},${0.8 * alpha})`, 1, { jointure: 'round' }));
      zones.push({ element: e.proprietaire, icone: null, poly: [[plat.x - 2, plat.y - e.taille - 2], [plat.x + largeurTotale + 2, plat.y - e.taille - 2], [plat.x + largeurTotale + 2, plat.y + 4], [plat.x - 2, plat.y + 4]] });
      commandes.push(texte(e.texte, plat.x, plat.y, police, `rgba(${e.teinte},${alpha})`, { alignement: 'left', contour: contour(3.5) }));
      if (e.detail) commandes.push(texte(e.detail, plat.x + nw + 7, plat.y, policeDetail, `rgba(224,165,38,${ghost ? 0.5 : 1})`, { alignement: 'left', contour: contour(3) }));
      continue;
    }
    const side = /** @type {{lx: number, ly: number, side: number}} */ (ps).side, lx = /** @type {{lx: number, ly: number}} */ (ps).lx, ly = /** @type {{lx: number, ly: number}} */ (ps).ly;
    if (mon) {
      const x0 = boiteIcone[3] - boiteIcone[2] > gH + 4 ? e.x : e.x + side * (gH / 2 - 2);
      commandes.push(trait([['M', x0, leadY], ['L', lx, ly]], `rgba(${e.teinte},${0.8 * alpha})`, 1, { tirets: ghost ? [2, 3] : [], jointure: 'round' }));
    } else {
      const rem = !!e.remarquable;
      commandes.push(trait([['M', e.x, e.y], ['L', lx, ly]], rem ? `rgba(224,165,38,${0.8 * alpha})` : `rgba(255,255,255,${0.85 * alpha})`, 1, { tirets: ghost ? [2, 3] : [], jointure: 'round' }));
      commandes.push(remplissage([['A', e.x, e.y, ghost ? 1.8 : 2.4]], rem ? `rgba(224,165,38,${0.95 * alpha})` : `rgba(255,255,255,${0.9 * alpha})`));
    }
    const align = side > 0 ? 'left' : 'right', enfants = [texte(e.texte, 0, 0, police, `rgba(${e.teinte},${alpha})`, { alignement: align, contour: contour(3.5) })];
    if (e.detail) enfants.push(texte(e.detail, side * (nw + 7), 0, policeDetail, `rgba(224,165,38,${ghost ? 0.5 : 1})`, { alignement: align, contour: contour(3) }));
    commandes.push(groupe(lx, ly, -side * ANGLE_NOM_RAD, enfants));
    zones.push({ element: e.proprietaire, icone: null, poly: rectangleIncline(lx, ly, -side * ANGLE_NOM_RAD, side * (largeurTotale + 2), e.taille + 2, 4) });
  }
  return { commandes, comptes, zones };
}
