// @ts-check
/**
 * Pose et dessin des noms (étiquettes) de tous les calques : l'ordre reçu est l'ordre de priorité ; chaque nom est placé par rendu/placement.js,
 * puis converti en commandes de dessin (fil, point, nom incliné avec liseré, détail). Aucun calque ne place ni ne dessine ses noms lui-même.
 * Entrées : étiquettes à poser, placeur, mesure de texte. Sorties : commandes et comptes. Reprend la boucle des lieux de `draw()` de la v1.
 * Dépend de : rendu/commandes.js, rendu/placement.js.
 */
import { trait, remplissage, texte, groupe } from './commandes.js';
import { ANGLE_NOM_RAD } from './placement.js';

/**
 * Étiquette à poser (style « lieu » : point sur le sol, fil, nom incliné).
 * @typedef {object} Etiquette
 * @property {string} cle clé de la mémoire de placement @property {unknown} proprietaire
 * @property {string} texte @property {string} detail ex. « 12 m · 3,4 km » (peut être vide) @property {number} taille corps du nom (px)
 * @property {number} x abscisse de l'ancre @property {number} y ordonnée de l'ancre
 * @property {number} opacite opacité de base (déjà réduite pour un fantôme) @property {string} teinte « r,g,b » @property {boolean} fantome
 * @property {number} decalage décalage horizontal du départ du nom @property {number} elevation hauteur du départ du nom
 */
/** @typedef {{affichage: string, mono: string}} Familles polices du titre et du détail */
/**
 * @typedef {object} ComptesEtiquettes
 * @property {number} eligibles dans le champ @property {number} affichees nets posés @property {number} fantomes transparents posés @property {number} sansPlace faute de place
 */

/**
 * @param {Etiquette[]} etiquettes dans l'ordre de priorité
 * @param {ReturnType<typeof import('./placement.js').creerPlaceur>} placeur
 * @param {{mesurerTexte: (police: string, texte: string) => number, familles: Familles}} options
 * @returns {{commandes: import('./commandes.js').Commande[], comptes: ComptesEtiquettes}}
 */
export function composerEtiquettes(etiquettes, placeur, { mesurerTexte, familles }) {
  /** @type {import('./commandes.js').Commande[]} */
  const commandes = [];
  const comptes = { eligibles: 0, affichees: 0, fantomes: 0, sansPlace: 0 };
  for (const e of etiquettes) {
    comptes.eligibles++;
    const sgn = e.x < placeur.largeurPx / 2 ? -1 : 1;
    const police = `700 ${e.taille}px ${familles.affichage}`, policeDetail = `500 11px ${familles.mono}`;
    const nw = mesurerTexte(police, e.texte), dw = e.detail ? mesurerTexte(policeDetail, e.detail) : 0;
    const totalLen = nw + (e.detail ? dw + 7 : 0) + 4;
    const ps = placeur.placerIncline({ x: e.x, base: e.y, off: e.decalage, lift: e.elevation, len: totalLen, padTop: e.taille + 2, padBot: 3, side: sgn, own: e.proprietaire, memKey: e.cle });
    if (!ps) { comptes.sansPlace++; continue; }
    if (e.fantome) comptes.fantomes++; else comptes.affichees++;
    const alpha = e.opacite, ghost = e.fantome, side = ps.side;
    commandes.push(trait([['M', e.x, e.y], ['L', ps.lx, ps.ly]], `rgba(255,255,255,${0.85 * alpha})`, 1, { tirets: ghost ? [2, 3] : [], jointure: 'round' }));
    commandes.push(remplissage([['A', e.x, e.y, ghost ? 1.8 : 2.4]], `rgba(255,255,255,${0.9 * alpha})`));
    const align = side > 0 ? 'left' : 'right', enfants = [
      texte(e.texte, 0, 0, police, `rgba(${e.teinte},${alpha})`, { alignement: align, contour: { couleur: `rgba(14,26,43,${ghost ? 0.6 : 0.9})`, largeur: 3.5, jointure: 'round' } }),
    ];
    if (e.detail) enfants.push(texte(e.detail, side * (nw + 7), 0, policeDetail, `rgba(224,165,38,${ghost ? 0.5 : 1})`, { alignement: align, contour: { couleur: `rgba(14,26,43,${ghost ? 0.6 : 0.9})`, largeur: 3, jointure: 'round' } }));
    commandes.push(groupe(ps.lx, ps.ly, -side * ANGLE_NOM_RAD, enfants));
  }
  return { commandes, comptes };
}
