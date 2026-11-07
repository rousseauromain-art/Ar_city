// @ts-check
/**
 * Toucher un nom : quel élément est sous le doigt ? Toutes les zones de toucher de la scène (noms de lieux et de monuments, bande des équipements, des pylônes et des couches perso, avions, bateaux)
 * sont ramenées au format de la v1, puis choisies par les fonctions de la v1 (hitBest). Pur : aucune horloge, aucun DOM.
 * Entrées : `bilan.zones` de moteur/scene.js, roulis de l'image, position du toucher (px de l'écran). Sortie : la zone (élément, groupe) ou null.
 */



// ---------- choix de l'élément touché : fonctions de la v1 déplacées (villes-horizon.html, hitLocal, hitIn, hitDist, hitBest, inQuad, l. 4115-4144) ----------
// UN SEUL test de toucher pour tout ce qui se touche : toutes les zones sont testées ensemble, d'abord franchement DANS la zone, puis avec 6 px de marge ;
// s'il y en a plusieurs, celle dont le centre est le plus proche du doigt l'emporte. Seul changement : W, H et les zones sont des paramètres (globaux en v1),
// et une zone sans icône ni rectangle (nom incliné d'un lieu, touchable en v2 seulement) est testée sur son polygone.

/**
 * Zone de toucher au format de la v1 : t = élément, g = éléments regroupés, roll = roulis (°) de l'image où la zone a été posée, icon = [x0, x1, y0, y1], poly = quadrilatère.
 * @typedef {{t: any, g: any[] | null, roll: number, icon?: number[] | null, poly?: number[][] | null, x0?: number, x1?: number, y0?: number, y1?: number}} Hit
 */

/** Point tapé ramené dans le repère compensé du roulis (v1 : `hitLocal`). @param {number} px @param {number} py @param {Hit} h @param {number} W @param {number} H */
export function hitLocal(px, py, h, W, H) { const cx = W / 2, cy = H / 2, dx = px - cx, dy = py - cy, r = h.roll * Math.PI / 180; return [cx + dx * Math.cos(r) + dy * Math.sin(r), cy - dx * Math.sin(r) + dy * Math.cos(r)]; }

/** Point dans un quadrilatère convexe, avec une marge m (distance signée à chaque côté) (v1 : `inQuad`). @param {number[][]} P @param {number} x @param {number} y @param {number} m */
export function inQuad(P, x, y, m) {
  let sgn = 0;
  for (let i = 0; i < 4; i++) { const a = P[i], b = P[(i + 1) % 4], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const d = ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0])) / L; // distance signée au côté
    if (!sgn && Math.abs(d) > 1e-9) sgn = Math.sign(d);
    if (d * (sgn || 1) < -m) return false; }
  return true;
}

/** @param {number} px @param {number} py @param {Hit} h @param {number} mg @param {number} W @param {number} H */
export function hitIn(px, py, h, mg, W, H) {
  const [lx, ly] = hitLocal(px, py, h, W, H);
  if (h.icon) { const ic = h.icon; if (lx >= ic[0] - mg && lx <= ic[1] + mg && ly >= ic[2] - mg && ly <= ic[3] + mg) return true; return !!(h.poly && inQuad(h.poly, lx, ly, mg)); }
  if (h.x0 === undefined) return !!(h.poly && inQuad(h.poly, lx, ly, mg));
  return lx >= /** @type {number} */ (h.x0) - mg && lx <= /** @type {number} */ (h.x1) + mg && ly >= /** @type {number} */ (h.y0) - mg && ly <= /** @type {number} */ (h.y1) + mg;
}

/** @param {Hit} h @returns {number[]} */
const boite = (h) => h.icon || (h.x0 !== undefined ? [/** @type {number} */ (h.x0), /** @type {number} */ (h.x1), /** @type {number} */ (h.y0), /** @type {number} */ (h.y1)]
  : [Math.min(...(h.poly || [[0, 0]]).map((p) => p[0])), Math.max(...(h.poly || [[0, 0]]).map((p) => p[0])), Math.min(...(h.poly || [[0, 0]]).map((p) => p[1])), Math.max(...(h.poly || [[0, 0]]).map((p) => p[1]))]);
/** @param {number} px @param {number} py @param {Hit} h @param {number} W @param {number} H */
export function hitDist(px, py, h, W, H) { const [lx, ly] = hitLocal(px, py, h, W, H), b = boite(h); return Math.hypot(lx - (b[0] + b[1]) / 2, ly - (b[2] + b[3]) / 2); }

/** Élément touché : d'abord franchement dedans, puis à 6 px près ; le centre le plus proche l'emporte (v1 : `hitBest`). @param {number} px @param {number} py @param {Hit[][]} arrs @param {number} W @param {number} H @returns {Hit | null} */
export function hitBest(px, py, arrs, W, H) {
  for (const mg of [0, 6]) {
    let best = null, bd = 1e9;
    for (const arr of arrs) for (const h of arr) { if (!hitIn(px, py, h, mg, W, H)) continue; const d = hitDist(px, py, h, W, H); if (d < bd) { bd = d; best = h; } }
    if (best) return best;
  }
  return null;
}

/**
 * Zones de la dernière image (moteur/scene.js, `bilan.zones`) au format de la v1. Un monument : icône ET nom dans la même zone (v1 : une entrée de `monHits`) ;
 * les monuments regroupés derrière son icône (+N) vont dans `_hidObjs` (v1). Bande : `t` = l'objet d'origine (`source`, v1 : `_src`), `g` = le groupe. Mobiles : `t` = le mobile, `g` = le groupe.
 * @param {{bande?: any[], avions?: any[], bateaux?: any[], etiquettes?: any[]} | null | undefined} zones @param {number} roll roulis (°) de l'image @returns {Hit[]}
 */
export function hitsDeScene(zones, roll) {
  if (!zones) return [];
  return [...hitsEtiquettes(zones.etiquettes || [], roll), ...hitsBande(zones.bande || [], roll), ...hitsMobiles(zones.avions || [], 'avion', 'avions', roll), ...hitsMobiles(zones.bateaux || [], 'bateau', 'bateaux', roll)];
}

/** @param {any[]} etiquettes @param {number} roll @returns {Hit[]} */
function hitsEtiquettes(etiquettes, roll) {
  /** @type {Map<any, Hit>} */
  const parElement = new Map();
  for (const z of etiquettes) {
    const el = z.element, caches = z.caches && z.caches.length ? z.caches : null;
    let h = parElement.get(el);
    if (!h) { h = { t: el, g: null, roll, icon: null, poly: null }; parElement.set(el, h); }
    if (z.icone) h.icon = z.icone;
    if (z.poly) h.poly = z.poly;
    if (caches) h.t = { ...el, _hidObjs: caches };
  }
  return [...parElement.values()];
}

/** Bande : `t` = l'objet d'origine (`source`, v1 : `_src`). @param {any[]} bande @param {number} roll @returns {Hit[]} */
function hitsBande(bande, roll) {
  const origine = (/** @type {any} */ el) => (el && el.source ? el.source : el);
  return bande.map((z) => ({ t: origine(z.element), g: (z.elements || [z.element]).map(origine), roll, x0: z.x0, x1: z.x1, y0: z.y0, y1: z.y1 }));
}

/** Avions et bateaux (un bateau de l'escalier porte son mobile dans `m`). @param {any[]} zs @param {string} un @param {string} plusieurs @param {number} roll @returns {Hit[]} */
function hitsMobiles(zs, un, plusieurs, roll) {
  const mob = (/** @type {any} */ b) => (b && b.m ? b.m : b);
  return zs.map((z) => ({ t: mob(z[un]), g: (z[plusieurs] || [z[un]]).map(mob), roll, icon: z.icone || null, poly: z.poly || null }));
}
