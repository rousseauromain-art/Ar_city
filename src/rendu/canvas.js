// @ts-check
/**
 * PÉRIPHÉRIE : exécute des commandes de dessin sur un contexte 2D. Seul module de la v2 qui appelle `ctx.*` pour dessiner.
 * Entrées : contexte canvas, commandes (rendu/commandes.js). Sortie : aucune (effet de bord sur le canvas).
 */

/** @typedef {import('./commandes.js').Commande} Commande */
/** @typedef {import('./commandes.js').OperationChemin} OperationChemin */

/** Applique des opérations de chemin à un contexte ou à un Path2D. @param {CanvasRenderingContext2D | Path2D} cible @param {OperationChemin[]} chemin */
function appliquer(cible, chemin) {
  for (const op of chemin) {
    if (op[0] === 'M') cible.moveTo(op[1], op[2]);
    else if (op[0] === 'L') cible.lineTo(op[1], op[2]);
    else if (op[0] === 'Q') cible.quadraticCurveTo(op[1], op[2], op[3], op[4]);
    else if (op[0] === 'A') cible.arc(op[1], op[2], op[3], 0, 7);
    else if (op[0] === 'AR') { if (op.length > 6) cible.arc(op[1], op[2], op[3], op[4], op[5], op[6]); else cible.arc(op[1], op[2], op[3], op[4], op[5]); }
    else if (op[0] === 'RC') cible.rect(op[1], op[2], op[3], op[4]);
    else if (op[0] === 'Z') cible.closePath();
    else cible.roundRect(op[1], op[2], op[3], op[4], op[5]);
  }
}

/** @param {CanvasRenderingContext2D} ctx @param {OperationChemin[]} chemin */
function tracer(ctx, chemin) {
  ctx.beginPath();
  appliquer(ctx, chemin);
}

/** @param {OperationChemin[]} chemin @returns {Path2D} */
function cheminReutilisable(chemin) {
  const p = new Path2D();
  appliquer(p, chemin);
  return p;
}

/** @param {CanvasRenderingContext2D} ctx @param {Commande[]} commandes */
export function dessiner(ctx, commandes) {
  for (const c of commandes) {
    if (c.type === 'trait') {
      if (c.alpha !== undefined) { ctx.save(); ctx.globalAlpha = c.alpha; } // l'opacité ne déborde pas non plus
      tracer(ctx, c.chemin);
      ctx.setLineDash(c.tirets); ctx.lineJoin = c.jointure; ctx.lineCap = c.extremite; ctx.strokeStyle = c.couleur; ctx.lineWidth = c.largeur;
      ctx.stroke();
      if (c.alpha !== undefined) ctx.restore();
      else if (c.tirets.length) ctx.setLineDash([]); // les pointillés ne débordent pas sur ce qui est dessiné ensuite
    } else if (c.type === 'remplissage') {
      tracer(ctx, c.chemin);
      ctx.fillStyle = c.couleur;
      if (c.regle) ctx.fill(c.regle); else ctx.fill();
    } else if (c.type === 'glyphe') {
      const g = c.chemins, fill = g.fill ? cheminReutilisable(g.fill) : null, fill2 = g.fill2 ? cheminReutilisable(g.fill2) : null, stroke = g.stroke ? cheminReutilisable(g.stroke) : null;
      ctx.save(); ctx.translate(c.x, c.y); ctx.globalAlpha = c.alpha; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      try {
        ctx.strokeStyle = 'rgba(14,26,43,.85)'; ctx.lineWidth = 3.2; // halo sombre d'abord
        for (const p of [fill, fill2, stroke]) if (p) ctx.stroke(p);
        ctx.fillStyle = c.couleur; ctx.strokeStyle = c.couleur; ctx.lineWidth = 1.5;
        if (fill) ctx.fill(fill, g.evenodd ? 'evenodd' : 'nonzero');
        if (fill2) ctx.fill(fill2);
        if (stroke) ctx.stroke(stroke);
      } finally { ctx.restore(); }
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
