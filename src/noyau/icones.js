// @ts-check
/**
 * Pictogrammes et silhouettes de monuments, en listes d'opérations de dessin (jamais sur le canvas). Silhouettes à taille réelle (Tour Eiffel, Arc de
 * Triomphe, Notre-Dame, Montparnasse et gabarits par type) quand le monument est assez grand à l'écran, sinon pictogramme posé sur sa base. Tous
 * génériques, dessinés maison. Entrées : type, position, hauteur en pixels. Sorties : commandes (noyau/commandes.js). Fonctions pures (v1 : `GLYPH`,
 * `SPR`, `monSpriteKey`, `drawSprite`, `drawGlyph`, `infraIconLook`).
 */
import { remplissage, trait, glyphe } from './commandes.js';

/** @typedef {import('./commandes.js').OperationChemin} OperationChemin */

/** Enregistreur de chemin avec l'interface de Path2D : les pictogrammes de la v1 sont transcrits tels quels. */
class Chemin {
  constructor() {
    /** @type {OperationChemin[]} */
    this.ops = [];
  }
  /** @param {number} x @param {number} y */ moveTo(x, y) { this.ops.push(['M', x, y]); }
  /** @param {number} x @param {number} y */ lineTo(x, y) { this.ops.push(['L', x, y]); }
  /** @param {number} cx @param {number} cy @param {number} x @param {number} y */ quadraticCurveTo(cx, cy, x, y) { this.ops.push(['Q', cx, cy, x, y]); }
  /** @param {number} x @param {number} y @param {number} r @param {number} a0 @param {number} a1 @param {boolean} [ccw] */ arc(x, y, r, a0, a1, ccw) { this.ops.push(ccw === undefined ? ['AR', x, y, r, a0, a1] : ['AR', x, y, r, a0, a1, ccw]); }
  /** @param {number} x @param {number} y @param {number} w @param {number} h */ rect(x, y, w, h) { this.ops.push(['RC', x, y, w, h]); }
  closePath() { this.ops.push(['Z']); }
}

/**
 * Pictogrammes : chaque fonction (u = taille/16) renvoie ses chemins de remplissage (`fill`, `fill2`) et de trait (`stroke`).
 * @type {Record<string, (u: number) => {fill?: Chemin, fill2?: Chemin, stroke?: Chemin, evenodd?: boolean}>}
 */
const GLYPHES = {
  pin(u){ const F=new Chemin(); F.moveTo(0,0); F.lineTo(-4.4*u,-8.4*u); F.arc(0,-11*u,5.2*u,2.6,0.54+2*Math.PI,false); F.closePath();
    F.moveTo(2*u,-11*u); F.arc(0,-11*u,2*u,0,2*Math.PI); return {fill:F,evenodd:true}; },
  pylone(u){ const P=new Chemin(); P.moveTo(-5*u,0); P.lineTo(-1*u,-14*u); P.moveTo(5*u,0); P.lineTo(1*u,-14*u);
    for(const [a,b] of [[0,-4.5],[-4.5,-9],[-9,-13]]){ const w=(/** @type {number} */ y)=>5-(-y)*4/14; P.moveTo(-w(a)*u,a*u); P.lineTo(w(b)*u,b*u); P.moveTo(w(a)*u,a*u); P.lineTo(-w(b)*u,b*u); }
    P.moveTo(0,-14*u); P.lineTo(0,-17*u); P.moveTo(-2.4*u,-16*u); P.lineTo(2.4*u,-16*u); return {stroke:P}; },
  mat(u){ const P=new Chemin(); P.moveTo(0,0); P.lineTo(0,-16*u); P.moveTo(-3*u,0); P.lineTo(3*u,0);
    const F=new Chemin(); F.rect(-3.2*u,-15.5*u,2*u,5*u); F.rect(1.2*u,-15.5*u,2*u,5*u); return {stroke:P,fill:F}; },
  toit(u){ const F=new Chemin(); F.rect(-6*u,-9*u,12*u,9*u); const P=new Chemin(); P.moveTo(2.5*u,-9*u); P.lineTo(2.5*u,-16*u);
    const A=new Chemin(); A.rect(3.2*u,-15.5*u,1.8*u,4*u); A.rect(0*u,-15.5*u,1.8*u,4*u); return {fill:F,stroke:P,fill2:A}; },
  chateau_eau(u){ const P=new Chemin(); P.moveTo(-2*u,0); P.lineTo(-1.5*u,-9*u); P.moveTo(2*u,0); P.lineTo(1.5*u,-9*u);
    const F=new Chemin(); F.moveTo(-5.5*u,-9*u); F.lineTo(5.5*u,-9*u); F.lineTo(4.5*u,-15*u); F.lineTo(-4.5*u,-15*u); F.closePath(); return {stroke:P,fill:F}; },
  antenne(u){ const P=new Chemin(); P.moveTo(-4*u,0); P.lineTo(0,-12*u); P.lineTo(4*u,0); P.moveTo(0,-12*u); P.lineTo(0,-15*u);
    P.moveTo(-3*u,-17*u); P.quadraticCurveTo(0,-19.5*u,3*u,-17*u); return {stroke:P}; },
  tour(u){ const F=new Chemin(); F.moveTo(-6*u,0); F.quadraticCurveTo(-2.5*u,-7*u,-1.1*u,-17*u); F.lineTo(1.1*u,-17*u); F.quadraticCurveTo(2.5*u,-7*u,6*u,0);
    F.lineTo(3*u,0); F.quadraticCurveTo(0,-5*u,-3*u,0); F.closePath(); const P=new Chemin(); P.moveTo(0,-17*u); P.lineTo(0,-20*u); return {fill:F,stroke:P}; },
  dome(u){ const F=new Chemin(); F.rect(-6.5*u,-6*u,13*u,6*u); F.moveTo(-5*u,-6*u); F.arc(0,-6*u,5*u,Math.PI,0); F.closePath();
    const P=new Chemin(); P.moveTo(0,-11*u); P.lineTo(0,-15*u); P.moveTo(-1.5*u,-13.5*u); P.lineTo(1.5*u,-13.5*u); return {fill:F,stroke:P}; },
  clocher(u){ const F=new Chemin(); F.rect(-4*u,-8*u,8*u,8*u); F.moveTo(-4.5*u,-8*u); F.lineTo(0,-18*u); F.lineTo(4.5*u,-8*u); F.closePath();
    F.rect(-7*u,-4*u,3*u,4*u); F.rect(4*u,-4*u,3*u,4*u); return {fill:F}; },
  arc(u){ const F=new Chemin(); F.rect(-7*u,-13*u,14*u,13*u); F.moveTo(3*u,0); F.lineTo(3*u,-6*u); F.arc(0,-6*u,3*u,0,Math.PI,true); F.lineTo(-3*u,0); F.closePath();
    return {fill:F,evenodd:true}; },
  colonne(u){ const F=new Chemin(); F.moveTo(-1.6*u,-1.5*u); F.lineTo(-1.1*u,-15*u); F.lineTo(0,-18*u); F.lineTo(1.1*u,-15*u); F.lineTo(1.6*u,-1.5*u); F.closePath();
    F.rect(-3.5*u,-1.8*u,7*u,1.8*u); return {fill:F}; },
  chateau(u){ const F=new Chemin(); F.moveTo(-7*u,0); F.lineTo(-7*u,-12*u);
    for(let i=0;i<5;i++){ const x=-7+i*3.5; F.lineTo(x*u,-12*u); F.lineTo(x*u,-14*u); F.lineTo((x+1.75)*u,-14*u); F.lineTo((x+1.75)*u,-12*u); }
    F.lineTo(7*u,-12*u); F.lineTo(7*u,0); F.closePath(); return {fill:F}; },
  musee(u){ const F=new Chemin(); F.moveTo(-7.5*u,-10*u); F.lineTo(0,-14.5*u); F.lineTo(7.5*u,-10*u); F.closePath(); F.rect(-7.5*u,-1.6*u,15*u,1.6*u);
    for(const x of [-5.5,-1,3.5]) F.rect(x*u,-9.5*u,2*u,8*u); return {fill:F}; },
  stade(u){ const F=new Chemin();
    F.moveTo(-4.5*u,-12*u); F.lineTo(4.5*u,-12*u); F.arc(4.5*u,-7.5*u,4.5*u,-Math.PI/2,Math.PI/2); F.lineTo(-4.5*u,-3*u); F.arc(-4.5*u,-7.5*u,4.5*u,Math.PI/2,Math.PI*1.5); F.closePath();
    F.moveTo(-4.2*u,-9.6*u); F.lineTo(4.2*u,-9.6*u); F.arc(4.2*u,-7.5*u,2.1*u,-Math.PI/2,Math.PI/2); F.lineTo(-4.2*u,-5.4*u); F.arc(-4.2*u,-7.5*u,2.1*u,Math.PI/2,Math.PI*1.5); F.closePath();
    const P=new Chemin(); for(const x of [-8.5,8.5]){ P.moveTo(x*u,-3*u); P.lineTo(x*u,-14*u); P.moveTo((x-1.6)*u,-14.5*u); P.lineTo((x+1.6)*u,-14.5*u); } return {fill:F,stroke:P,evenodd:true}; },
  gare(u){ const F=new Chemin(); F.rect(-5.5*u,-13*u,11*u,11*u); F.rect(-3.8*u,-11.2*u,7.6*u,4.6*u); F.rect(-3.8*u,-5.2*u,1.6*u,1.4*u); F.rect(2.2*u,-5.2*u,1.6*u,1.4*u);
    const P=new Chemin(); P.moveTo(-7*u,0); P.lineTo(7*u,0); P.moveTo(-3*u,-2*u); P.lineTo(-4*u,0); P.moveTo(3*u,-2*u); P.lineTo(4*u,0); P.moveTo(0,-13*u); P.lineTo(0,-15.5*u); P.moveTo(-2.5*u,-15.5*u); P.lineTo(2.5*u,-15.5*u); return {fill:F,stroke:P,evenodd:true}; },
  eau(u){ const P=new Chemin(); for(const y of [-3,-8,-13]){ P.moveTo(-8*u,y*u); P.quadraticCurveTo(-5.5*u,(y-3.2)*u,-3*u,y*u); P.quadraticCurveTo(-0.5*u,(y+3.2)*u,2*u,y*u); P.quadraticCurveTo(4.5*u,(y-3.2)*u,7*u,y*u); } return {stroke:P}; },
  parc(u){ const F=new Chemin(); F.arc(0,-10*u,5.2*u,0,Math.PI*2); F.moveTo(1.2*u,-4.8*u); F.lineTo(1.2*u,0); F.lineTo(-1.2*u,0); F.lineTo(-1.2*u,-4.8*u); F.closePath(); return {fill:F}; },
  place(u){ const F=new Chemin(); F.moveTo(0,-15*u); F.lineTo(7.5*u,-7.5*u); F.lineTo(0,0); F.lineTo(-7.5*u,-7.5*u); F.closePath(); F.moveTo(2.4*u,-7.5*u); F.arc(0,-7.5*u,2.4*u,0,Math.PI*2,true); return {fill:F,evenodd:true}; },
  scene(u){ const F=new Chemin();
    F.arc(0,-8*u,6.6*u,0,Math.PI*2);
    F.moveTo(-1.4*u,-9.2*u); F.arc(-2.6*u,-9.2*u,1.2*u,0,Math.PI*2); F.moveTo(3.8*u,-9.2*u); F.arc(2.6*u,-9.2*u,1.2*u,0,Math.PI*2);
    F.moveTo(-3.4*u,-6.2*u); F.arc(0,-6.2*u,3.4*u,Math.PI,0,true); F.closePath(); return {fill:F,evenodd:true}; },
  pont(u){ const P=new Chemin(); P.moveTo(-8*u,-4*u); P.lineTo(8*u,-4*u); for(const x of [-4.5,4.5]){ P.moveTo(x*u,0); P.lineTo(x*u,-13*u); } P.moveTo(-8*u,-5*u); P.lineTo(-4.5*u,-13*u); P.moveTo(8*u,-5*u); P.lineTo(4.5*u,-13*u);
    P.moveTo(-4.5*u,-13*u); P.quadraticCurveTo(0,-4.5*u,4.5*u,-13*u); return {stroke:P}; },
  mairie(u){ const F=new Chemin(); F.moveTo(-8*u,-9*u); F.lineTo(0,-13*u); F.lineTo(8*u,-9*u); F.closePath(); F.rect(-8*u,-1.6*u,16*u,1.6*u); F.rect(-6.5*u,-8.5*u,13*u,6.9*u);
    F.moveTo(2.2*u,-5.2*u); F.arc(0,-5.2*u,2.2*u,0,Math.PI*2,true); const P=new Chemin(); P.moveTo(0,-13*u); P.lineTo(0,-17*u); P.moveTo(0,-16.5*u); P.lineTo(3.5*u,-15.6*u); P.lineTo(0,-14.7*u); return {fill:F,stroke:P,evenodd:true}; },
  maison(u){ const F=new Chemin(); F.moveTo(-8*u,-8*u); F.lineTo(0,-15*u); F.lineTo(8*u,-8*u); F.lineTo(6*u,-8*u); F.lineTo(6*u,0); F.lineTo(-6*u,0); F.lineTo(-6*u,-8*u); F.closePath();
    F.rect(-1.6*u,-5*u,3.2*u,5*u); const P=new Chemin(); P.moveTo(4*u,-12*u); P.lineTo(4*u,-15*u); return {fill:F,stroke:P,evenodd:true}; },
  edifice(u){ const F=new Chemin(); F.rect(-5*u,-13*u,10*u,13*u); for(const y of [-10.5,-6.5,-2.5]) for(const x of [-3.2,0.8]) F.rect(x*u,y*u,2.4*u,2.4*u); return {fill:F,evenodd:true}; },
};;

/** Hauteur totale approximative d'un pictogramme (unités de 16), pour placer le nom. */
export const HAUTEUR_GLYPHE = {pin:16,pylone:17,mat:16,toit:16,chateau_eau:15,antenne:18,tour:20,dome:15,clocher:18,arc:13,colonne:18,chateau:14,musee:14.5,stade:15,gare:15.5,eau:16,parc:15,place:15,scene:15,pont:13,edifice:13,mairie:17,maison:15};

/** Silhouettes : `asp` = largeur / hauteur ; `poly` = contour (x depuis l'axe, y de 0 au sol à 1 au sommet, en hauteurs) ; `hole` = ouverture ; `lines` = traits de détail. */
export const SILHOUETTES = /** @type {Record<string, {asp: number, poly: number[][], hole?: number[][] | null, lines?: number[][]}>} */ ({
  eiffel:{asp:.40,poly:[[-.19,0],[-.145,.06],[-.108,.17],[-.085,.25],[-.062,.35],[-.04,.55],[-.022,.8],[-.017,.84],[-.008,.93],[0,1],[.008,.93],[.017,.84],[.022,.8],[.04,.55],[.062,.35],[.085,.25],[.108,.17],[.145,.06],[.19,0],[.13,0],[.1,.04],[.05,.09],[0,.11],[-.05,.09],[-.1,.04],[-.13,0]],
    lines:[[-.12,.17,.12,.17],[-.075,.35,.075,.35],[-.03,.84,.03,.84]]},
  arc:{asp:.9,poly:[[-.45,0],[.45,0],[.45,.86],[.47,.86],[.47,.92],[.45,.92],[.45,1],[-.45,1],[-.45,.92],[-.47,.92],[-.47,.86],[-.45,.86]],
    hole:[[-.13,0],[-.13,.5],[-.1,.62],[0,.68],[.1,.62],[.13,.5],[.13,0]]},
  notredame:{asp:1.0,poly:[[-.5,0],[.5,0],[.5,.72],[.22,.72],[.22,.5],[.035,.5],[.03,.88],[0,1],[-.03,.88],[-.035,.5],[-.22,.5],[-.22,.72],[-.5,.72]],
    hole:null,lines:[[-.5,.62,-.22,.62],[.22,.62,.5,.62]]},
  montparnasse:{asp:.30,poly:[[-.15,0],[.15,0],[.15,.96],[.12,1],[-.12,1],[-.15,.96]],lines:[[-.15,.3,.15,.3],[-.15,.6,.15,.6]]},
  tour:{asp:.22,poly:[[-.1,0],[.1,0],[.075,.5],[.065,.8],[.025,.93],[0,1],[-.025,.93],[-.065,.8],[-.075,.5]]},
  dome:{asp:1.0,poly:[[-.5,0],[.5,0],[.5,.34],[.3,.34],[.3,.5],[.27,.56],[.2,.7],[.1,.8],[.035,.84],[.03,.94],[0,1],[-.03,.94],[-.035,.84],[-.1,.8],[-.2,.7],[-.27,.56],[-.3,.5],[-.3,.34],[-.5,.34]]},
  clocher:{asp:.9,poly:[[-.45,0],[.45,0],[.45,.4],[.12,.4],[.12,.62],[0,1],[-.12,.62],[-.12,.4],[-.45,.4]]},
  colonne:{asp:.12,poly:[[-.06,0],[.06,0],[.06,.12],[.035,.12],[.025,.9],[0,1],[-.025,.9],[-.035,.12],[-.06,.12]]},
  chateau:{asp:3.2,poly:[[-1.6,0],[1.6,0],[1.6,.62],[1.55,.62],[1.45,1],[1.35,.62],[.4,.62],[.4,.7],[-.4,.7],[-.4,.62],[-1.35,.62],[-1.45,1],[-1.55,.62],[-1.6,.62]]},
  musee:{asp:3.0,poly:[[-1.5,0],[1.5,0],[1.5,.7],[.3,.7],[0,1],[-.3,.7],[-1.5,.7]]},
});
/** Silhouettes dessinées à taille réelle (les gabarits « boîte » ne le sont plus : une icône vaut mieux qu'un rectangle). */
export const SILHOUETTES_DISTINCTES = new Set(['eiffel','arc','notredame','montparnasse','tour','dome','clocher','colonne','chateau']);
/** Silhouette d'un monument : dédiée (Eiffel, Arc de Triomphe, Notre-Dame, Montparnasse) ou gabarit de son type. @param {{name?: string, qid?: string | null, type: string}} c */
export function cleSilhouette(c){
  const n=c.name||'';
  if(c.qid==='Q243'||/^tour eiffel$/i.test(n)) return 'eiffel';
  if(c.qid==='Q64436'||/arc de triomphe de l.[ée]toile/i.test(n)) return 'arc';
  if(c.qid==='Q2981'||/notre-dame de paris/i.test(n)) return 'notredame';
  if(c.qid==='Q179797'||/tour montparnasse/i.test(n)) return 'montparnasse';
  return SILHOUETTES[c.type]?c.type:'musee';
}

/** Hauteur minimale (px) d'un monument pour être dessiné à sa taille réelle. */
export const SILHOUETTE_MIN_PX = 26;

/** Un pictogramme prêt à dessiner. @typedef {{fill: OperationChemin[] | null, fill2: OperationChemin[] | null, stroke: OperationChemin[] | null, evenodd: boolean}} Glyphe */

/** Chemins d'un pictogramme pour une hauteur de `h` pixels. @param {string} type @param {number} h @returns {Glyphe} */
export function cheminsGlyphe(type, h) {
  const g = ((GLYPHES[type] || GLYPHES.antenne)(h / 16));
  return { fill: g.fill ? g.fill.ops : null, fill2: g.fill2 ? g.fill2.ops : null, stroke: g.stroke ? g.stroke.ops : null, evenodd: !!g.evenodd };
}

/**
 * Pictogramme posé sur sa base (x, yBase), avec un halo sombre (lisible sur ciel clair comme sur façade sombre) puis sa couleur (v1 : `drawGlyph`).
 * @param {string} type @param {number} x @param {number} yBase @param {number} h hauteur (px) @param {string} couleur @param {number} [alpha]
 */
export const commandeGlyphe = (type, x, yBase, h, couleur, alpha = 1) => glyphe(x, yBase, alpha, couleur, cheminsGlyphe(type, h));

/** Silhouette d'un monument à l'échelle exacte (largeur = rapport réel × hauteur à l'écran), de son sol à son sommet (v1 : `drawSprite`, sans bâtiment devant). */
/** @param {string} cle @param {number} x @param {number} yTop @param {number} yBase @param {number} remplissageA @param {number} traitA */
export function commandesSilhouetteMonument(cle, x, yTop, yBase, remplissageA, traitA) {
  const sp = SILHOUETTES[cle], Hpx = yBase - yTop, P = (/** @type {number[]} */ pt) => [x + pt[0] * Hpx, yBase - pt[1] * Hpx];
  /** @type {OperationChemin[]} */
  const contour = [];
  for (const [i, q] of /** @type {number[][]} */ (sp.poly).entries()) { const [px, py] = P(q); contour.push([i ? 'L' : 'M', px, py]); }
  contour.push(['Z']);
  if (sp.hole) { for (const [i, q] of /** @type {number[][]} */ (sp.hole).entries()) { const [px, py] = P(q); contour.push([i ? 'L' : 'M', px, py]); } contour.push(['Z']); }
  const rond = { jointure: /** @type {'round'} */ ('round'), extremite: /** @type {'round'} */ ('round') };
  const cmds = [remplissage(contour, `rgba(242,193,78,${remplissageA})`, 'evenodd'), trait(contour, 'rgba(14,26,43,.75)', 3.6, rond), trait(contour, `rgba(255,214,110,${traitA})`, 1.6, rond)];
  if (sp.lines) {
    /** @type {OperationChemin[]} */
    const detail = [];
    for (const l of /** @type {number[][]} */ (sp.lines)) { const a = P([l[0], l[1]]), b = P([l[2], l[3]]); detail.push(['M', a[0], a[1]], ['L', b[0], b[1]]); }
    cmds.push(trait(detail, `rgba(255,214,110,${traitA * 0.8})`, 1.2, rond));
  }
  return cmds;
}
