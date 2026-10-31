// @ts-check
/**
 * Noms des bateaux A PLAT sous leurs icônes, « EN ESCALIER » : sur une grille de lignes communes, jamais dans le ciel, avec des fils verticaux. Les noms vont vers l'extérieur de
 * l'écran (vers l'intérieur si le bord manque de place) ; un nom qui couvre l'abscisse du fil d'un autre bateau passe SOUS ce bateau : aucun fil ne traverse un nom ni un autre calque.
 * QUI est nommé : les plus proches d'abord, un bateau n'entre que si toute la disposition tient encore avec lui ; les autres (les plus lointains) sont regroupés en pastille « +N »
 * (jamais « +1 » : un bateau seul sans place garde son icône et rejoint la liste de son voisin nommé). Le choix est gardé 0,4 s (ou tant que la vue ne tourne pas de plus de 2°) ;
 * entre-temps on ne refait que la disposition. Reprend le bloc BATEAUX de `draw()` de la v1.
 * Entrées : bateaux à l'écran, vue, réservations déjà posées, choix précédent. Sorties : commandes, zones de toucher, nouveau choix. Dépend de : rendu/{commandes,reservations,projection}.js.
 */
import { ecartAngle } from '../noyau/maths.js';
import { trait, remplissage, texte } from '../noyau/commandes.js';
import { polygonesSeChevauchent } from './reservations.js';
import { kmCourt } from './bande.js';

/** @typedef {{m: import('../donnees/trafic.js').Mobile, x: number, y: number, g: unknown}} BateauEcran */
/** @typedef {{ids: Map<string, [number, number]> | null, key?: string, t?: number, h?: number, p?: number}} ChoixBateaux */
/** @typedef {{it: BateauEcran, dir: number, dx?: number}} Choisi */

const TAILLE = 13, PAS = TAILLE + 6, COULEUR = '#7FE3C4', NOMS_MAX = 30, ESSAIS_MAX = 90, RETOURNEMENTS_MAX = 36, GARDE_MS = 400, GARDE_LIBRE_MS = 150, ROTATION_MAX_DEG = 2;
const J = /** @type {const} */ ('round'), E = /** @type {const} */ ('butt');

/**
 * @param {{
 *   bateaux: BateauEcran[], vue: import('../noyau/projection.js').VueRendu, reservations: import('./reservations.js').Reservation[], estIcone: (r: import('./reservations.js').Reservation) => boolean,
 *   mesurerTexte: (police: string, texte: string) => number, familles: {affichage: string, mono: string}, maintenantMs: number, choix: ChoixBateaux, distances: boolean,
 *   jointure?: 'miter' | 'round' | 'bevel'
 * }} e `reservations` est MODIFIÉ (noms, fils et pastilles posés). `choix` : choix de l'image précédente ({ids: null} : aucun).
 */
export function poserBateaux({ bateaux, vue, reservations: placed, estIcone: isIcon, mesurerTexte, familles, maintenantMs, choix, distances, jointure = J }) {
  const W = vue.largeurPx, H = vue.hauteurPx, size = TAILLE, step = PAS, bot = H - 8, mid = W / 2;
  /** @type {import('../noyau/commandes.js').Commande[]} */
  const commandes = [];
  /** @type {{bateau: BateauEcran, bateaux: BateauEcran[], icone: number[], poly: number[][] | null}[]} */
  const zones = [];
  const ships0 = bateaux.filter((it) => it.x >= 3 && it.x <= W - 3).sort((a, b) => a.m.dist - b.m.dist); // icône hors écran : ni nom ni pastille
  const base = ships0.length ? Math.min(...ships0.map((o) => o.y)) + size + 12 : 0, R = Math.max(0, Math.floor((bot - 4 - base) / step) + 1);
  const rTop = (/** @type {number} */ r) => base + r * step - size - 2, rBot = (/** @type {number} */ r) => base + r * step + 4;
  const hitR = (/** @type {number} */ x0, /** @type {number} */ x1, /** @type {number} */ y0, /** @type {number} */ y1, /** @type {import('./reservations.js').Reservation} */ r) =>
    x0 < r[1] && x1 > r[0] && y0 < r[3] && y1 > r[2] && (!r[4] || polygonesSeChevauchent([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], r[4], 0));
  const ext = placed.filter((r) => r[3] > base - size - 40), extRow = /** @type {typeof placed[]} */ ([]); // obstacles déjà posés (autres calques, icônes), rangés par ligne
  for (let r = 0; r < R; r++) extRow.push(ext.filter((q) => q[2] < rBot(r) + 3 && q[3] > rTop(r) - 3));
  const police = `700 ${size}px ${familles.affichage}`, policeDetail = `500 11px ${familles.mono}`;
  const nwOf = new Map();
  for (const it of ships0) {
    const m = it.m, kn = m.vel * 1.944, lab = m.name || '?', dtxt = [kn >= 0.5 ? Math.round(kn) + ' nd' : '', distances ? kmCourt(m.dist) + ' km' : ''].filter(Boolean).join(' · ');
    const nw = mesurerTexte(police, lab), dw = dtxt ? mesurerTexte(policeDetail, dtxt) : 0;
    nwOf.set(it, { lab, dtxt, nw, w: nw + (dtxt ? dw + 7 : 0) });
  }
  // disposition d'un ensemble [{it, dir}] (dir : -1 nom vers la gauche, 1 vers la droite, 2 centré) → Map(it → {r, fx0, fx1, lx}) ou null.
  // Règle : si le nom de B couvre l'abscisse du fil de A, A doit être nommé PLUS HAUT que B (sinon le nom de B barre ce fil). On en tire un ordre (tri topologique ; un cycle =
  // impossible), puis chaque nom prend la première ligne libre sous ceux qu'il doit laisser passer.
  const spanOf = (/** @type {BateauEcran} */ it, /** @type {number} */ dir, /** @type {number} */ lx) => { const w = nwOf.get(it).w; let a = dir < 0 ? lx + 3 - w : dir === 1 ? lx - 3 : lx - w / 2; a = Math.max(4, Math.min(W - 4 - w, a)); return [a, a + w]; };
  const layout = (/** @type {{it: BateauEcran, dir: number, dx?: number}[]} */ set) => {
    const n = set.length, xs = set.map((o) => o.it.x + (o.dx || 0)), sp = set.map((o, k) => spanOf(o.it, o.dir, xs[k])), succ = /** @type {number[][]} */ (set.map(() => [])), indeg = new Array(n).fill(0);
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) if (a !== b) {
      if (Math.abs(xs[a] - xs[b]) < 4) return null; // deux fils collés l'un à l'autre
      if (xs[a] > sp[b][0] - 2 && xs[a] < sp[b][1] + 2) { succ[a].push(b); indeg[b]++; }
    }
    const order = /** @type {number[]} */ ([]);
    for (let i = 0; i < n; i++) if (!indeg[i]) order.push(i);
    for (let k = 0; k < order.length; k++) for (const b of succ[order[k]]) if (--indeg[b] === 0) order.push(b);
    if (order.length < n) return null;
    const lb = new Array(n).fill(0), labs = /** @type {{r: number, fx0: number, fx1: number}[]} */ ([]), pl = new Map();
    for (const b of order) {
      const it = set[b].it, x = xs[b], y = it.y, [fx0, fx1] = sp[b], xa = Math.min(x, it.x), xb = Math.max(x, it.x);
      let r = Math.max(lb[b], Math.ceil((y + size + 12 - base) / step), 0);
      for (; r < R; r++) {
        if (extRow[r].some((q) => hitR(fx0 - 3, fx1 + 3, rTop(r), rBot(r), q))) continue;
        if (labs.some((l) => l.r === r && fx0 - 6 < l.fx1 && fx1 + 6 > l.fx0)) continue;
        break;
      }
      if (r >= R) return null;
      const t = rTop(r);
      if (ext.some((q) => !isIcon(q) && q[0] < xb + 2 && q[1] > xa - 2 && q[2] < t && q[3] > y + 9)) return null; // le fil barrerait un autre calque
      labs.push({ r, fx0, fx1 }); pl.set(it, { r, fx0, fx1, lx: x });
      for (const c of succ[b]) lb[c] = Math.max(lb[c], r + 1);
    }
    return pl;
  };
  // choix des bateaux nommés : du plus proche au plus lointain, chacun n'entre que si tout tient encore (nom vers l'extérieur, sinon vers l'intérieur)
  const key = ships0.map((o) => o.m.mmsi).sort().join() + '|' + W + 'x' + H, age = maintenantMs - (choix.t || 0);
  const gardes = () => { const s = /** @type {Choisi[]} */ ([]); for (const it of ships0) { const d = /** @type {Map<string, [number, number]>} */ (choix.ids).get(/** @type {string} */ (it.m.mmsi)); if (d) s.push({ it, dir: d[0], dx: d[1] }); } return s; };
  let pl = null, suivant = choix;
  // choix gardé 0,4 s ; un changement (bateau qui entre dans le champ, vue qui tourne de plus de 2°) le refait, mais pas plus d'une fois par 0,15 s ; si la disposition ne tient plus, on le refait tout de suite
  if (choix.ids && age < GARDE_MS && (age < GARDE_LIBRE_MS || (choix.key === key && Math.abs(ecartAngle(vue.capDeg - /** @type {number} */ (choix.h))) <= ROTATION_MAX_DEG && Math.abs(vue.inclinaisonDeg - /** @type {number} */ (choix.p)) <= ROTATION_MAX_DEG))) pl = layout(gardes());
  if (!pl) {
    let sel = /** @type {Choisi[]} */ ([]), calls = 0, rep = RETOURNEMENTS_MAX;
    for (const c of ships0) {
      if (sel.length >= NOMS_MAX || calls >= ESSAIS_MAX) break;
      // fil vertical, ou légèrement penché si un fil passe déjà là (bateaux à couple : leurs fils s'écartent en éventail)
      const dx = [0, 9, -9, 18, -18].find((d) => !sel.some((o) => Math.abs(o.it.x + (o.dx || 0) - (c.x + d)) < 4));
      if (dx === undefined) continue;
      const out = c.x < mid ? -1 : 1;
      let ok = false;
      for (const dir of [out, -out, 2]) { calls++; const t = sel.concat([{ it: c, dir, dx }]); if (layout(t)) { sel = t; ok = true; break; } }
      // pas de place : on essaie de retourner le nom d'un des 3 voisins déjà nommés (budget limité)
      if (!ok && rep > 0) {
        const nb = sel.map((_o, k) => k).sort((a, b) => Math.abs(sel[a].it.x - c.x) - Math.abs(sel[b].it.x - c.x)).slice(0, 3);
        fix: for (const k of nb) for (const d2 of [-1, 1, 2]) if (d2 !== sel[k].dir) for (const dir of [out, -out, 2]) {
          if (--rep < 0) break fix;
          const t = sel.slice(); t[k] = { ...t[k], dir: d2 }; t.push({ it: c, dir, dx });
          if (layout(t)) { sel = t; break fix; }
        }
      }
    }
    suivant = { ids: new Map(sel.map((o) => [/** @type {string} */ (o.it.m.mmsi), /** @type {[number, number]} */ ([o.dir, o.dx || 0])])), key, t: maintenantMs, h: vue.capDeg, p: vue.inclinaisonDeg };
    pl = layout(sel) || new Map();
  }
  const free = ships0.filter((o) => !pl.has(o)), hitOf = new Map();
  for (const [it, p] of pl) {
    const { lab, dtxt, nw } = nwOf.get(it), x = it.x, y = it.y, fy = base + p.r * step;
    placed.push([p.fx0 - 2, p.fx1 + 2, fy - size - 2, fy + 4]); placed.push([Math.min(x, p.lx) - 1.5, Math.max(x, p.lx) + 1.5, y + 9, rTop(p.r)]);
    commandes.push(trait([['M', x, y + 7], ['L', p.lx, rTop(p.r)]], COULEUR, 1, { alpha: 0.7, jointure, extremite: E }),
      texte(lab, p.fx0, fy, police, COULEUR, { contour: { couleur: 'rgba(14,26,43,.9)', largeur: 3.5, jointure, extremite: E } }));
    if (dtxt) commandes.push(texte(dtxt, p.fx0 + nw + 7, fy, policeDetail, 'rgba(224,165,38,1)', { contour: { couleur: 'rgba(14,26,43,.9)', largeur: 3, jointure, extremite: E } }));
    const hit = { bateau: it, bateaux: [it], icone: [x - 9, x + 9, y - 9, y + 9], poly: [[p.fx0 - 2, fy - size - 2], [p.fx1 + 2, fy - size - 2], [p.fx1 + 2, fy + 4], [p.fx0 - 2, fy + 4]] };
    zones.push(hit); hitOf.set(it, hit);
  }
  // sans place : grappes d'icônes voisines (écart < 26 px, largeur < 80 px) → pastille « +N » au-dessus de la plus haute
  free.sort((a, b) => a.x - b.x);
  const clusters = /** @type {{x0: number, x1: number, items: BateauEcran[]}[]} */ ([]);
  for (const it of free) { const c = clusters[clusters.length - 1]; if (c && it.x - c.x1 < 26 && it.x - c.x0 < 80) { c.items.push(it); c.x1 = it.x; } else clusters.push({ x0: it.x, x1: it.x, items: [it] }); }
  for (const c of clusters) {
    const n = c.items.length, its = c.items.slice().sort((a, b) => a.m.dist - b.m.dist), xs = its.map((o) => o.x), ys = its.map((o) => o.y);
    if (n === 1) { // jamais de « +1 » : le bateau rejoint la liste de son voisin nommé
      const o = its[0];
      let nb = null, bd = 12;
      for (const [it, hh] of hitOf) { const d = Math.hypot(it.x - o.x, it.y - o.y); if (d < bd) { bd = d; nb = hh; } }
      if (nb) nb.bateaux.push(o); else zones.push({ bateau: o, bateaux: [o], icone: [o.x - 9, o.x + 9, o.y - 9, o.y + 9], poly: null });
      continue;
    }
    const hi = Math.min(...ys), bx = (c.x0 + c.x1) / 2, txt = '+' + (n > 99 ? '99' : n), r = Math.max(7.5, mesurerTexte(`700 9px ${familles.mono}`, txt) / 2 + 4);
    let by = hi - 15;
    for (const dy of [0, -12, -24]) if (!placed.some((q) => !isIcon(q) && hitR(bx - r - 1, bx + r + 1, hi - 15 + dy - r - 1, hi - 15 + dy + r + 1, q))) { by = hi - 15 + dy; break; } // au-dessus des icônes, sans masquer un nom
    const cercle = /** @type {import('../noyau/commandes.js').OperationChemin[]} */ ([['A', bx, by, r]]);
    commandes.push(remplissage(cercle, 'rgba(14,26,43,.92)'), trait(cercle, COULEUR, 1.3, { jointure, extremite: E }), texte(txt, bx, by + 3.2, `700 9px ${familles.mono}`, '#F3E9D2', { alignement: 'center' }));
    placed.push([bx - r, bx + r, by - r, by + r]);
    zones.push({ bateau: its[0], bateaux: its, icone: [Math.min(bx - r, ...xs) - 9, Math.max(bx + r, ...xs) + 9, by - r, Math.max(...ys) + 9], poly: null });
  }
  return { commandes, zones, choix: suivant, nommes: pl.size };
}
