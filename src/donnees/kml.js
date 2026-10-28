// @ts-check
/**
 * Couches personnelles : lecture locale d'un fichier KMZ (archive ZIP) ou KML, jamais envoyé nulle part. Seuls les points (Placemark/Point) sont retenus ;
 * lignes et polygones sont comptés « ignorés ». Les champs (ExtendedData, SimpleData, tableau de la description) deviennent des colonnes (60 au plus).
 * Pur, sauf l'analyseur XML/HTML, injectable (`dom`) : le navigateur fournit DOMParser. Entrées : octets ou texte du fichier. Sortie : points compacts
 * [lat, lon, nom, description, liens, valeurs], puis une couche {items…} prête à classer. Reprend `kmzToKml`, `parseKml`, `userMake`, `userFlag`, `userRecompute` de la v1.
 * Dépend de : noyau/geo.js.
 */
import { distanceEtCap } from '../noyau/geo.js';

/** @typedef {{xml: (texte: string) => Document, html: (texte: string) => Document}} AnalyseurDom */
/** @typedef {[number, number, string, string, string[], string[]]} PointKml */
/**
 * @typedef {object} ItemPerso
 * @property {string} name @property {number} lat @property {number} lon @property {string} desc @property {string[]} links @property {string[]} vals @property {string[]} cols
 * @property {'user'} kind @property {'pin'} icon @property {string} layer @property {string} lname @property {string} col @property {number | null} dist @property {number | null} brg
 * @property {boolean} hl @property {string} lab @property {string} [_h]
 */
/**
 * @typedef {object} CouchePerso
 * @property {string} id @property {string} name @property {string} color @property {boolean} on @property {number} max @property {PointKml[]} pts @property {string[]} cols
 * @property {string} field @property {number} ignored @property {number} added @property {string} [diag] @property {ItemPerso[]} items @property {ItemPerso[]} shown @property {boolean} hasDesc
 */

/** Couleurs proposées pour les couches successives. */
export const COULEURS_PERSO = Object.freeze(['#FF8A3D', '#A98BFF', '#4FD1C5', '#FF6FB5', '#9BE564', '#FFD23F']);
/** Sites affichés au plus par couche, hors sites trouvés par la recherche (60 au plus). Points conservés au plus par fichier. Taille maximale d'un fichier. */
export const PERSO_AFFICHES = 300, PERSO_TROUVES = 60, PERSO_POINTS_MAX = 60000, PERSO_OCTETS_MAX = 40e6;
/** Distances proposées (km) pour l'éloignement maximal d'une couche. */
export const PERSO_DISTANCES_KM = Object.freeze([2, 5, 10, 20, 50, 100, 200]);
/** Nombre de caractères de la valeur d'un champ qui précèdent le nom. */
const PREFIXE_CAR = 10;

/** @type {AnalyseurDom} */
export const domNavigateur = { xml: (t) => new DOMParser().parseFromString(t, 'application/xml'), html: (t) => new DOMParser().parseFromString(t, 'text/html') };

/** Texte sans accent ni majuscule, espaces simples (recherche). @param {unknown} x */
export const normaliser = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Décompresse un flux deflate brut (entrée d'archive ZIP, méthode 8). @param {Uint8Array} u8 */
async function inflateRaw(u8) {
  const ds = new DecompressionStream('deflate-raw'), w = ds.writable.getWriter();
  w.write(/** @type {BufferSource} */ (u8)); w.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

/**
 * Texte du KML contenu dans un KMZ (archive ZIP : répertoire central, entrées stockées ou deflate).
 * @param {ArrayBuffer} buf @param {(entrees: {name: string, meth: number, csz: number, off: number}[], choisi: string | undefined) => void} [info]
 */
export async function kmzVersKml(buf, info) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf);
  let e = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('archive KMZ illisible (fin de répertoire introuvable)');
  const n = dv.getUint16(e + 10, true), td = new TextDecoder();
  let p = dv.getUint32(e + 16, true);
  const ents = [];
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const meth = dv.getUint16(p + 10, true), csz = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    ents.push({ name: td.decode(u8.subarray(p + 46, p + 46 + nl)), meth, csz, off });
    p += 46 + nl + el + cl;
  }
  const kmls = ents.filter((x) => /\.kml$/i.test(x.name)), choisi = kmls.find((x) => /(^|\/)doc\.kml$/i.test(x.name)) || kmls[0];
  if (info) info(ents, choisi && choisi.name);
  if (!choisi) throw new Error('aucun fichier .kml dans cette archive');
  const nl = dv.getUint16(choisi.off + 26, true), el = dv.getUint16(choisi.off + 28, true), st = choisi.off + 30 + nl + el, data = u8.subarray(st, st + choisi.csz);
  if (choisi.meth === 0) return td.decode(data);
  if (choisi.meth === 8) {
    if (typeof DecompressionStream === 'undefined') throw new Error('ce navigateur ne sait pas décompresser les KMZ (exportez en .kml)');
    return td.decode(await inflateRaw(data));
  }
  throw new Error('compression ZIP non gérée (' + choisi.meth + ')');
}

/** Lit un fichier .kmz ou .kml (octets) → { txt, meta } ; meta décrit l'archive pour le diagnostic. @param {ArrayBuffer} buf @param {number} [taille] */
export async function lireFichierKml(buf, taille = buf.byteLength) {
  const u8 = new Uint8Array(buf), zip = u8[0] === 0x50 && u8[1] === 0x4b;
  /** @type {{name: string, meth: number, csz: number, off: number}[] | null} */
  let ents = null;
  let pick = '';
  const txt = zip ? await kmzVersKml(buf, (e, p) => { ents = e; pick = p || ''; }) : new TextDecoder('utf-8').decode(u8);
  return { txt, meta: { zip, size: taille, ents, pick } };
}

/** Description KML (souvent du HTML) → texte, liens http(s) et lignes « champ | valeur ». @param {unknown} html @param {AnalyseurDom} [dom] */
export function texteKml(html, dom = domNavigateur) {
  const h = String(html || '').replace(/<br\s*\/?>|<\/p>|<\/div>|<\/tr>/gi, '\n'), d = dom.html(h), links = /** @type {string[]} */ ([]);
  for (const a of d.querySelectorAll('a[href]')) { const u = /** @type {string} */ (a.getAttribute('href')); if (/^https?:\/\//i.test(u) && !links.includes(u)) links.push(u); }
  for (const u of ((d.body.textContent || '').match(/https?:\/\/[^\s<>"']+/g) || [])) if (!links.includes(u)) links.push(u);
  /** @type {string[][]} */
  const rows = [];
  for (const tr of d.querySelectorAll('tr')) { const c = [...tr.children].filter((x) => /^t[dh]$/i.test(x.localName)); if (c.length === 2) rows.push([c[0].textContent || '', c[1].textContent || '']); }
  if (!rows.length) for (const ln of (d.body.textContent || '').split('\n')) { const m = ln.trim().match(/^([^:=]{1,40}?)\s*[:=]\s*(\S.*)$/); if (m && !/^\/\//.test(m[2])) rows.push([m[1], m[2]]); } // sans tableau : « libellé : valeur »
  return { text: (d.body.textContent || '').replace(/\n\s*\n+/g, '\n').trim().slice(0, 800), links: links.slice(0, 4), rows };
}

/** Tableau HTML simple (une table, lignes à 2 cellules) lu sans analyseur (25 000 descriptions : 20 fois plus rapide) ; null si plus complexe. @param {string} raw */
export function kmlRapide(raw) {
  if (!/<table/i.test(raw) || (raw.match(/<table/gi) || []).length !== 1) return null;
  const trN = (raw.match(/<tr[\s>]/gi) || []).length, rows = /** @type {string[][]} */ ([]), re = /<tr[^>]*>\s*<t[dh][^>]*>([\s\S]*?)<\/t[dh]>\s*<t[dh][^>]*>([\s\S]*?)<\/t[dh]>\s*<\/tr>/gi;
  const tx = (/** @type {string} */ h) => h.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  let m;
  while ((m = re.exec(raw))) rows.push([tx(m[1]), tx(m[2])]);
  if (!rows.length || rows.length !== trN) return null;
  const links = /** @type {string[]} */ ([]);
  for (const u of (raw.match(/https?:\/\/[^\s<>"']+/g) || [])) { const w = u.replace(/&amp;/g, '&'); if (!links.includes(w)) links.push(w); }
  return { text: '', links: links.slice(0, 4), rows };
}

/**
 * Points d'un KML. Chaque point : [lat, lon, nom, description, liens, valeurs] (valeurs dans l'ordre de `cols`).
 * @param {string} txt @param {Document} [doc] déjà analysé @param {AnalyseurDom} [dom]
 * @returns {{pts: PointKml[], ignored: number, cols: string[]}}
 */
export function analyserKml(txt, doc, dom = domNavigateur) {
  const d = doc || dom.xml(txt);
  if (d.getElementsByTagName('parsererror').length) throw new Error('KML invalide (XML illisible)');
  /** @type {any[][]} */
  const out = [];
  /** @type {string[]} */
  const cols = [];
  const colIx = new Map();
  let ignored = 0;
  const enfant = (/** @type {Element} */ el, /** @type {string} */ tag) => { for (const c of el.children) if (c.localName === tag) return (c.textContent || '').trim(); return ''; };
  for (const pm of d.getElementsByTagName('Placemark')) {
    const pts = pm.getElementsByTagName('Point');
    if (!pts.length) { ignored++; continue; }
    const name = enfant(pm, 'name').slice(0, 120), rawD = enfant(pm, 'description'), desc = kmlRapide(rawD) || texteKml(rawD, dom), vals = /** @type {string[]} */ ([]);
    const poser = (/** @type {unknown} */ k, /** @type {unknown} */ v) => {
      const kk = String(k || '').replace(/\s+/g, ' ').trim().slice(0, 40), vv = String(v || '').replace(/\s+/g, ' ').trim().slice(0, 200);
      if (!kk || kk[0] === '@') return;
      let i = colIx.get(kk);
      if (i === undefined) { if (cols.length >= 60) return; i = cols.length; colIx.set(kk, i); cols.push(kk); }
      if (vals[i] === undefined) vals[i] = vv;
    };
    for (const e of pm.getElementsByTagName('*')) {
      if (e.localName === 'Data') poser(e.getAttribute('name'), enfant(e, 'value') || e.textContent);
      else if (e.localName === 'SimpleData') poser(e.getAttribute('name'), e.textContent);
    }
    for (const [k, v] of desc.rows) poser(k, v);
    const description = desc.rows.length >= 2 ? '' : desc.text; // les champs repris d'un tableau remplacent la description (sinon doublon × 25 000)
    for (const pt of pts) {
      const c = ((pt.getElementsByTagName('coordinates')[0] || { textContent: '' }).textContent || '').trim().split(/\s+/)[0].split(','), lon = +c[0], lat = +c[1];
      if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) continue;
      out.push([+lat.toFixed(6), +lon.toFixed(6), name, description, desc.links, vals]);
    }
  }
  for (const q of out) { const v = /** @type {string[]} */ (q[5]); q[5] = cols.map((_, i) => v[i] || ''); }
  return { pts: /** @type {PointKml[]} */ (out), ignored, cols };
}

/** Valeur d'un champ d'un item (nom, description ou colonne). @param {ItemPerso} it @param {number} fi @param {string} f */
const valeurChamp = (it, fi, f) => (f === '@name' ? it.name : f === '@desc' ? it.desc : (fi >= 0 && it.vals[fi]) || '');

/** Libellé court de chaque item : les 10 premiers caractères du champ choisi précèdent le nom. @param {CouchePerso} L */
export function libellesCouche(L) {
  const fi = L.field && L.field[0] !== '@' ? L.cols.indexOf(L.field) : -1;
  for (const it of L.items) {
    const v = Array.from(String(valeurChamp(it, fi, L.field)).replace(/\s+/g, ' ').trim()).slice(0, PREFIXE_CAR).join('');
    it.lab = !L.field || !v ? '' : L.field === '@name' ? v : (it.name ? `${v} · ${it.name}` : v);
  }
}

/**
 * Recherche : tous les mots doivent se trouver (nom, description ou n'importe quel champ), sans accents ni majuscules ; les sites trouvés sont `hl`. Minimum 2 caractères.
 * @param {CouchePerso} L @param {string} requete
 */
export function marquerRecherche(L, requete) {
  const q = normaliser(requete), mots = q.split(' ').filter(Boolean), actif = q.length >= 2;
  for (const it of L.items) {
    if (!actif) { it.hl = false; continue; }
    const h = it._h || (it._h = normaliser([it.name, it.desc].concat(it.vals).join(' ')));
    it.hl = mots.every((w) => h.includes(w));
  }
}

/**
 * Couche prête à classer, depuis ses données enregistrées (v1 : `userMake`). Convertit l'ancien format de valeurs (objet {nom: valeur}).
 * @param {{id: string, name: string, color: string, on: boolean, max: number, pts: any[], cols?: string[], field?: string, ignored?: number, added?: number, diag?: string}} o
 * @param {string} [requete]
 * @returns {CouchePerso}
 */
export function creerCouche(o, requete = '') {
  const L = /** @type {any} */ (o);
  L.field = L.field || '';
  if (!Array.isArray(L.cols)) {
    const vus = new Set();
    L.cols = [];
    for (const q of L.pts) if (q[5] && !Array.isArray(q[5])) for (const k in q[5]) if (!vus.has(k)) { vus.add(k); L.cols.push(k); }
  }
  const cols = L.cols;
  L.items = L.pts.map((/** @type {any} */ q) => {
    let v = q[5];
    if (v && !Array.isArray(v)) v = cols.map((/** @type {string} */ k) => v[k] || '');
    return { name: q[2] || '', lat: q[0], lon: q[1], desc: q[3] || '', links: q[4] || [], vals: v || [], cols, kind: /** @type {'user'} */ ('user'), icon: /** @type {'pin'} */ ('pin'), layer: L.id, lname: L.name, col: L.color, dist: null, brg: null, hl: false, lab: '' };
  });
  L.hasDesc = L.pts.some((/** @type {any} */ q) => q[3]);
  if (L.field && L.field[0] !== '@' && !cols.includes(L.field)) L.field = '';
  libellesCouche(L);
  L.shown = [];
  marquerRecherche(L, requete);
  return L;
}

/**
 * Distance et cap de chaque item, puis les sites affichables : trouvés par la recherche (60 au plus, toujours, même au-delà de la distance) puis les plus proches
 * dans la distance réglée (300 au plus). Trié par distance (v1 : `userRecompute`). @param {CouchePerso} L @param {{lat: number, lon: number}} pos
 */
export function positionnerCouche(L, pos) {
  for (const it of L.items) { const r = distanceEtCap(pos, it); it.dist = r.distKm; it.brg = r.capDeg; }
  const dedans = L.items.filter((it) => /** @type {number} */ (it.dist) <= L.max || it.hl).sort((a, b) => /** @type {number} */ (a.dist) - /** @type {number} */ (b.dist));
  L.shown = dedans.filter((it) => it.hl).slice(0, PERSO_TROUVES).concat(dedans.filter((it) => !it.hl).slice(0, PERSO_AFFICHES)).sort((a, b) => /** @type {number} */ (a.dist) - /** @type {number} */ (b.dist));
}

/**
 * Importe un fichier : lit, analyse, construit la couche. Lève une erreur lisible (trop gros, aucun point…).
 * @param {{octets: ArrayBuffer, nom: string, taille?: number, rang: number, maintenant?: number, aleatoire?: () => number}} e
 * @param {AnalyseurDom} [dom]
 */
export async function importerCouche({ octets, nom, taille = octets.byteLength, rang, maintenant = Date.now(), aleatoire = Math.random }, dom = domNavigateur) {
  if (taille > PERSO_OCTETS_MAX) throw new Error('fichier trop gros (40 Mo maximum)');
  const { txt, meta } = await lireFichierKml(octets, taille), doc = dom.xml(txt), res = analyserKml(txt, doc, dom);
  if (!res.pts.length) throw new Error('aucun point trouvé' + (res.ignored ? ` (${res.ignored} ligne(s)/polygone(s) ignorés : seuls les points sont affichés)` : ''));
  const id = maintenant.toString(36) + aleatoire().toString(36).slice(2, 5);
  const L = creerCouche({ id, name: nom.replace(/\.(kmz|kml)$/i, '').slice(0, 60), color: COULEURS_PERSO[rang % COULEURS_PERSO.length], on: true, max: 50, pts: res.pts.slice(0, PERSO_POINTS_MAX), cols: res.cols, ignored: res.ignored, added: maintenant });
  return { couche: L, coupe: res.pts.length > PERSO_POINTS_MAX, txt, meta, doc, res };
}
