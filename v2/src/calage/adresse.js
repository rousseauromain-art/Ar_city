// @ts-check
/**
 * Position par une plaque de rue ou un numéro : nettoie le texte lu (OCR bruité), choisit le résultat de la Base Adresse Nationale et en déduit la position.
 * Numéro trouvé : le point d'adresse est ramené au trottoir (4 m de l'axe de la rue, du côté de l'adresse). Seul le nom de la rue : la position actuelle est projetée sur cette rue.
 * Rien n'est appliqué sans la confirmation de l'utilisateur (ui/lire-plaque.js). Fonctions PURES. Dépend de : noyau/texte.js.
 */
import { normaliser } from '../noyau/texte.js';

/** @typedef {{lat: number, lon: number}} Point */
/** @typedef {import('../donnees/adresse.js').Adresse} Adresse */

/** Distance (m) de l'axe de la rue à laquelle on pose la position quand l'adresse est connue (le trottoir). */
export const TROTTOIR_M = 4;
/** Types de voies reconnus, avec leur forme complète pour la recherche. */
const TYPES = /** @type {Record<string, string>} */ ({ RUE: 'rue', AV: 'avenue', AVE: 'avenue', AVENUE: 'avenue', BD: 'boulevard', BLD: 'boulevard', BOULEVARD: 'boulevard', PL: 'place', PLACE: 'place', IMP: 'impasse', IMPASSE: 'impasse', QUAI: 'quai', PASSAGE: 'passage', ALLEE: 'allée', COURS: 'cours', CHEMIN: 'chemin', ROUTE: 'route', SQUARE: 'square', VILLA: 'villa', RUELLE: 'ruelle', PONT: 'pont' });
const MOTS_TYPES = Object.keys(TYPES).sort((a, b) => b.length - a.length).join('|');

/** Mots sans valeur pour reconnaître une rue (articles, types de voies). */
const MOTS_VIDES = new Set(['rue', 'avenue', 'boulevard', 'place', 'impasse', 'quai', 'passage', 'allee', 'cours', 'chemin', 'route', 'square', 'villa', 'ruelle', 'pont', 'des', 'du', 'de', 'la', 'le', 'les', 'sur', 'sous']);
/** Mots clés d'un nom de rue (4 lettres au moins, hors articles et types de voies), sans accents ni majuscules. @param {string} rue */
export const motsCles = (rue) => normaliser(rue).split(/[^a-z0-9]+/).filter((m) => m.length >= 4 && !MOTS_VIDES.has(m));

/**
 * Texte d'une plaque (OCR) → numéro et nom de rue. Tolère le bruit courant : « L2 » pour « 12 », ponctuation, code postal et ville à la suite, « bis » / « ter ».
 * @param {string} texte @returns {{numero: string, rue: string, requete: string} | null}
 */
export function lireTexteAdresse(texte) {
  const t = texte.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9' -]/g, ' ').replace(/\s+/g, ' ').trim();
  const m = new RegExp(`(?:^| )(?:([0-9ILO]{1,4})(?: ?(BIS|TER|B|T))? )?(${MOTS_TYPES}) ([A-Z']+(?:[ -][A-Z']+){0,5})`).exec(t);
  if (!m) return null;
  const brut = m[1] && /\d/.test(m[1]) ? m[1].replace(/[IL]/g, '1').replace(/O/g, '0') : '', suffixe = brut && m[2] ? (m[2].startsWith('B') ? ' bis' : ' ter') : '';
  const nom = m[4].split(/[ ]/).slice(0, 5).join(' ').toLowerCase(), type = TYPES[m[3]];
  if (nom.replace(/[^a-z]/g, '').length < 3) return null;
  const numero = brut ? brut + suffixe : '';
  return { numero, rue: `${type} ${nom}`, requete: `${numero ? numero + ' ' : ''}${type} ${nom}` };
}

/** Choisit le résultat de la Base Adresse : le numéro lu d'abord, sinon la rue. @param {Adresse[]} adresses @param {{numero: string, rue: string}} lu @returns {Adresse | null} */
export function choisirAdresse(adresses, lu) {
  const cles = motsCles(lu.rue), memeRue = (/** @type {Adresse} */ a) => !cles.length || cles.some((w) => normaliser(a.rue).includes(w));
  if (lu.numero) { const n = adresses.find((a) => a.type === 'numero' && a.numero.toLowerCase() === lu.numero.toLowerCase() && memeRue(a)) || adresses.find((a) => a.type === 'numero' && a.numero.toLowerCase() === lu.numero.toLowerCase()); if (n) return n; }
  return adresses.find((a) => a.type === 'rue' && memeRue(a)) || adresses.find((a) => a.type === 'numero' && memeRue(a)) || adresses[0] || null;
}

/** Projection locale plane (nord, est) en mètres autour de `o`. @param {Point} o */
const projeter = (o) => { const k = 111320 * Math.cos((o.lat * Math.PI) / 180); return { versM: (/** @type {Point} */ p) => /** @type {[number, number]} */ ([(p.lat - o.lat) * 111320, (p.lon - o.lon) * k]), versGeo: (/** @type {number} */ n, /** @type {number} */ e) => ({ lat: o.lat + n / 111320, lon: o.lon + e / k }) }; };

/** Point de la polyligne le plus proche de `p` (en mètres autour de `o`). @param {Point[]} ligne @param {Point} p @param {Point} o @returns {{n: number, e: number, d: number}} */
function pointLePlusProche(ligne, p, o) {
  const { versM } = projeter(o), [pn, pe] = versM(p), pts = ligne.map(versM);
  let m = { n: pts[0][0], e: pts[0][1], d: Infinity };
  for (let i = 0; i + 1 < pts.length; i++) {
    const [an, ae] = pts[i], [bn, be] = pts[i + 1], dn = bn - an, de = be - ae, l2 = dn * dn + de * de, t = l2 ? Math.max(0, Math.min(1, ((pn - an) * dn + (pe - ae) * de) / l2)) : 0, n = an + t * dn, e = ae + t * de, d = Math.hypot(pn - n, pe - e);
    if (d < m.d) m = { n, e, d };
  }
  return m;
}

/**
 * Position déduite de l'adresse choisie. @param {{adresse: Adresse, rues: {nom: string, points: Point[]}[], pos: Point}} e
 * @returns {{ok: true, pos: Point, ecartM: number, libelle: string} | {ok: false, raison: string}}
 */
export function positionDepuisAdresse({ adresse, rues, pos }) {
  const cles = motsCles(adresse.rue), memes = rues.filter((r) => r.nom && cles.length > 0 && cles.some((w) => normaliser(r.nom).includes(w)));
  const { versGeo, versM } = projeter(pos);
  if (adresse.type === 'numero') {
    if (!memes.length) return { ok: true, pos: adresse.point, ecartM: Math.hypot(...versM(adresse.point)), libelle: adresse.libelle };
    const [an, ae] = versM(adresse.point), q = memes.map((r) => pointLePlusProche(r.points, adresse.point, pos)).reduce((a, c) => (c.d < a.d ? c : a));
    const d = Math.hypot(an - q.n, ae - q.e), k = d > TROTTOIR_M ? TROTTOIR_M / d : 1, n = q.n + (an - q.n) * k, e = q.e + (ae - q.e) * k, p = versGeo(n, e);
    return { ok: true, pos: p, ecartM: Math.hypot(n, e), libelle: adresse.libelle };
  }
  if (!memes.length) return { ok: false, raison: `la géométrie de « ${adresse.rue} » n'est pas connue ici : lisez un numéro` };
  const q = memes.map((r) => pointLePlusProche(r.points, pos, pos)).reduce((a, c) => (c.d < a.d ? c : a));
  return { ok: true, pos: versGeo(q.n, q.e), ecartM: q.d, libelle: adresse.libelle };
}
