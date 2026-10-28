// @ts-check
/**
 * PÉRIPHÉRIE : exécute des commandes de dessin sur un contexte 2D. Seul module de la v2 qui appelle `ctx.*` pour dessiner.
 * Entrées : contexte canvas, commandes (rendu/commandes.js). Sortie : aucune (effet de bord sur le canvas).
 */

/** @typedef {import('./commandes.js').Commande} Commande */
/** @typedef {import('./commandes.js').OperationChemin} OperationChemin */

/** @param {CanvasRenderingContext2D} ctx @param {OperationChemin[]} chemin */
function tracer(ctx, chemin) {
  ctx.beginPath();
  for (const op of chemin) {
    if (op[0] === 'M') ctx.moveTo(op[1], op[2]);
    else if (op[0] === 'L') ctx.lineTo(op[1], op[2]);
    else if (op[0] === 'Q') ctx.quadraticCurveTo(op[1], op[2], op[3], op[4]);
    else if (op[0] === 'A') ctx.arc(op[1], op[2], op[3], 0, 7);
    else ctx.roundRect(op[1], op[2], op[3], op[4], op[5]);
  }
}

/** @param {CanvasRenderingContext2D} ctx @param {Commande[]} commandes */
export function dessiner(ctx, commandes) {
  for (const c of commandes) {
    if (c.type === 'trait') {
      tracer(ctx, c.chemin);
      ctx.setLineDash(c.tirets); ctx.lineJoin = c.jointure; ctx.lineCap = c.extremite; ctx.strokeStyle = c.couleur; ctx.lineWidth = c.largeur;
      ctx.stroke();
    } else if (c.type === 'remplissage') {
      tracer(ctx, c.chemin);
      ctx.fillStyle = c.couleur;
      ctx.fill();
    } else if (c.type === 'groupe') {
      ctx.save();
      ctx.translate(c.x, c.y); ctx.rotate(c.angleRad);
      try { dessiner(ctx, c.enfants); } finally { ctx.restore(); }
    } else {
      ctx.font = c.police; ctx.textAlign = c.alignement; ctx.textBaseline = c.ligneDeBase;
      if (c.contour) { ctx.lineJoin = c.contour.jointure; ctx.lineCap = c.contour.extremite; ctx.strokeStyle = c.contour.couleur; ctx.lineWidth = c.contour.largeur; ctx.strokeText(c.texte, c.x, c.y); }
      ctx.fillStyle = c.couleur;
      ctx.fillText(c.texte, c.x, c.y);
    }
  }
}

/**
 * Exécute `dessin` dans le repère redressé du roulis (rotation autour du centre de l'écran), puis restaure le contexte.
 * @param {CanvasRenderingContext2D} ctx @param {{largeurPx: number, hauteurPx: number, roulisDeg: number}} vue @param {() => void} dessin
 */
export function avecRoulis(ctx, vue, dessin) {
  ctx.save();
  ctx.translate(vue.largeurPx / 2, vue.hauteurPx / 2); ctx.rotate((vue.roulisDeg * Math.PI) / 180); ctx.translate(-vue.largeurPx / 2, -vue.hauteurPx / 2);
  try { dessin(); } finally { ctx.restore(); }
}
