// @ts-check
/**
 * Position nettoyée (GPS d'un téléphone : quelques mètres de bruit à chaque fix, et en ville des fix qui tombent dans les bâtiments).
 * À l'arrêt (vitesse GPS < 0,5 m/s ET téléphone presque immobile) : médiane PONDÉRÉE (1 / précision²) des mesures des 10 dernières secondes, en écartant celles dont la précision dépasse 2 fois la précision médiane.
 * En marche : la dernière mesure. Une position qui tombe dans un bâtiment (BD TOPO, cours intérieures comprises) est ramenée au point extérieur le plus proche, plus 1,5 m, sauf si l'œil est relevé de plus de 5 m (balcon, toit).
 * Entrées : mesures GPS { t, lat, lon, precisionM }, vitesse, immobilité, bâtiments. Sorties : position, précision, nombre de mesures retenues, déplacement appliqué. Fonctions PURES.
 */

/** @typedef {{lat: number, lon: number}} Point */
/** @typedef {{t: number, lat: number, lon: number, precisionM: number}} MesureGps */

/** Fenêtre (ms) des mesures utilisées à l'arrêt. */
export const FENETRE_MS = 10000;
/** Une mesure dont la précision dépasse ce multiple de la précision médiane est écartée. */
export const RATIO_PRECISION = 2;
/** En dessous de cette vitesse GPS (m/s), on est à l'arrêt. */
export const VITESSE_ARRET_MS = 0.5;
/** Nombre minimal de mesures pour une médiane. */
export const MESURES_MIN = 3;
/** Un nouveau fix qui déplace la position de moins de ce nombre de mètres ne relance rien. */
export const RELANCE_M = 5;
/** Distance (m) dont on dépasse le mur quand on ramène une position hors d'un bâtiment. */
export const MARGE_MUR_M = 1.5;
/** Au-delà de cette élévation de l'œil (m) au-dessus du sol standard, on est sur un balcon ou un toit : la position n'est pas ramenée. */
export const OEIL_BALCON_M = 5;
/** Hauteur d'œil standard au-dessus du sol (m). */
const OEIL_STANDARD_M = 1.6;

/** Médiane d'une liste de nombres. @param {number[]} v */
function mediane(v) { const s = v.slice().sort((a, b) => a - b), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; }
/** Médiane pondérée : la valeur où le poids cumulé atteint la moitié. @param {number[]} valeurs @param {number[]} poids */
export function medianePonderee(valeurs, poids) {
  const idx = valeurs.map((_, i) => i).sort((a, b) => valeurs[a] - valeurs[b]), total = poids.reduce((s, p) => s + p, 0);
  let cumul = 0;
  for (const i of idx) { cumul += poids[i]; if (cumul >= total / 2) return valeurs[i]; }
  return valeurs[idx[idx.length - 1]];
}
/** Distance (m) entre deux points proches. @param {Point} a @param {Point} b */
export const distanceM = (a, b) => Math.hypot((b.lat - a.lat) * 111320, (b.lon - a.lon) * 111320 * Math.cos((a.lat * Math.PI) / 180));

/**
 * @param {{mesures: MesureGps[], vitesseMs: number | null, immobile: boolean, maintenantMs: number}} e
 * @returns {{pos: Point, precisionM: number, n: number, mode: 'mediane' | 'derniere'} | null}
 */
export function nettoyerPosition({ mesures, vitesseMs, immobile, maintenantMs }) {
  const derniere = mesures[mesures.length - 1];
  if (!derniere) return null;
  const recentes = mesures.filter((m) => maintenantMs - m.t <= FENETRE_MS);
  if (!((vitesseMs ?? 0) < VITESSE_ARRET_MS && immobile) || recentes.length < MESURES_MIN) return { pos: { lat: derniere.lat, lon: derniere.lon }, precisionM: derniere.precisionM, n: 1, mode: 'derniere' };
  const pm = mediane(recentes.map((m) => m.precisionM)), gardees = recentes.filter((m) => m.precisionM <= RATIO_PRECISION * pm), w = gardees.map((m) => 1 / Math.max(1, m.precisionM) ** 2);
  return { pos: { lat: medianePonderee(gardees.map((m) => m.lat), w), lon: medianePonderee(gardees.map((m) => m.lon), w) }, precisionM: pm, n: gardees.length, mode: 'mediane' };
}

/** Anneau en mètres (nord, est) autour de `o`. @param {Float64Array} p @param {Point} o @returns {[number, number][]} */
function anneauMetres(p, o) {
  const k = 111320 * Math.cos((o.lat * Math.PI) / 180), r = /** @type {[number, number][]} */ ([]);
  for (let i = 0; i < p.length; i += 2) r.push([(p[i] - o.lat) * 111320, (p[i + 1] - o.lon) * k]);
  return r;
}
/** Le point (n, e) est-il dans l'anneau ? (lancer de rayon) @param {[number, number][]} r @param {number} n @param {number} e */
function dansAnneau(r, n, e) {
  let dedans = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [ni, ei] = r[i], [nj, ej] = r[j];
    if ((ei > e) !== (ej > e) && n < ((nj - ni) * (e - ei)) / (ej - ei) + ni) dedans = !dedans;
  }
  return dedans;
}
/** Anneaux des bâtiments proches (à moins de ~110 m en latitude), en mètres autour de `pos`. @param {Point} pos @param {{pts: Float64Array}[]} batiments */
function anneauxProches(pos, batiments) {
  const out = /** @type {[number, number][][]} */ ([]);
  for (const b of batiments) { let proche = false; for (let i = 0; i < b.pts.length; i += 2) if (Math.abs(b.pts[i] - pos.lat) < 0.001) { proche = true; break; } if (proche) out.push(anneauMetres(b.pts, pos)); }
  return out;
}
/** Candidats de sortie : pour chaque arête, son point le plus proche de l'origine, poussé de 1,5 m vers l'extérieur de SON bâtiment. @param {[number, number][][]} anneaux @returns {{n: number, e: number, d: number}[]} */
function candidatsDeSortie(anneaux) {
  const out = [];
  for (const r of anneaux) for (let i = 0; i < r.length; i++) {
    const [an, ae] = r[i], [bn, be] = r[(i + 1) % r.length], dn = bn - an, de = be - ae, l2 = dn * dn + de * de;
    if (!l2) continue;
    const t = Math.max(0, Math.min(1, -(an * dn + ae * de) / l2)), qn = an + t * dn, qe = ae + t * de, len = Math.sqrt(l2);
    let nn = -de / len, ne = dn / len; // normale à l'arête ; on garde le côté qui sort du bâtiment
    if (dansAnneau(r, qn + nn * 0.05, qe + ne * 0.05)) { nn = -nn; ne = -ne; }
    const n = qn + nn * MARGE_MUR_M, e = qe + ne * MARGE_MUR_M;
    out.push({ n, e, d: Math.hypot(n, e) });
  }
  return out;
}

/**
 * Ramène une position tombée dans un bâtiment au point extérieur le plus proche, plus 1,5 m (cours intérieures comprises : les trous des polygones ne sont pas gardés) ; le point choisi n'est jamais dans un autre bâtiment.
 * Rien n'est fait si l'œil est relevé de plus de 5 m (`oeilRelM` : hauteur de l'œil au-dessus du sol) : on est sur un balcon ou un toit.
 * @param {{pos: Point, batiments: {pts: Float64Array}[], oeilRelM: number}} e @returns {{pos: Point, deplaceM: number, dans: boolean}}
 */
export function ramenerHorsBatiment({ pos, batiments, oeilRelM }) {
  const inchange = { pos, deplaceM: 0, dans: false };
  if (oeilRelM - OEIL_STANDARD_M > OEIL_BALCON_M) return inchange;
  const anneaux = anneauxProches(pos, batiments), dedans = (/** @type {number} */ n, /** @type {number} */ e) => anneaux.some((r) => dansAnneau(r, n, e));
  if (!dedans(0, 0)) return inchange;
  const sorties = candidatsDeSortie(anneaux).filter((c) => !dedans(c.n, c.e)).sort((a, b) => a.d - b.d);
  if (!sorties.length) return { pos, deplaceM: 0, dans: true };
  const k = 111320 * Math.cos((pos.lat * Math.PI) / 180), s = sorties[0];
  return { pos: { lat: pos.lat + s.n / 111320, lon: pos.lon + s.e / k }, deplaceM: s.d, dans: true };
}
