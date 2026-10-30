// @ts-check
/**
 * Monuments tirés d'OpenStreetMap : tours de télécommunications (TDF, mâts), clochers et bâtiments hauts, statues et monuments commémoratifs,
 * puis fusion avec la base Wikidata sans doubler ce qui est déjà connu. Fonctions pures (v1 : `towerRel`, `parseTowers`, `towerMonuments`,
 * `tallMonuments`, `statueMonuments`, `monCombine`, `markBuildingDupes`). Les mutations de la v1 (un monument Wikidata reçoit la hauteur OSM)
 * deviennent des copies. Entrées : objets OSM bruts, base Wikidata, lieux, supports ANFR, bâtiments hauts. Dépend de : noyau/geo.js, monuments-wikidata.js.
 */
import { distanceEtCap } from '../noyau/geo.js';
import { MON_LOW_LINKS, MON_DEF_H } from './monuments-wikidata.js';

/** @typedef {import('./monuments-wikidata.js').Monument} Monument */
/** @typedef {{lat: number, lon: number}} Point */
/** @typedef {{id: string, lat: number, lon: number, tags: Record<string, string>, rel: boolean, why: string}} Tour */
/** @typedef {{type: string, id: number, lat: number, lon: number, tags: Record<string, string>}} ObjetOsm */

/** Hauteur supposée (m) par sous-type de statue ou de monument commémoratif. */
const STATUE_H = Object.freeze(/** @type {Record<string, number>} */ ({ statue: 8, bust: 4, sculpture: 6, obelisk: 15, column: 15, monument: 10 }));
/** Hauteur minimale (m) d'une tour ou d'un clocher reconnu(e) comme monument, et d'un immeuble de grande hauteur. */
const TALL_MIN_H = 40;
const TALL_BLD_MIN_H = 60;
/** Une tour OSM à moins de 120 m d'un monument Wikidata lui donne sa hauteur au lieu d'être doublée. */
const TALL_MERGE_KM = 0.12;
/** Étiquettes OSM conservées sur une tour. */
export const TW_TAGS = ['name', 'name:fr', 'official_name', 'alt_name', 'operator', 'owner', 'brand', 'height', 'wikidata', 'wikipedia', 'website', 'contact:website', 'ref', 'tower:type', 'man_made', 'description'];
/** Étiquettes conservées sur un objet des tuiles (tours + statues). */
export const OT_KEEP = [...TW_TAGS, 'building:levels', 'historic', 'memorial', 'tourism', 'artwork_type', 'subject'];

/** Exploitant TDF (Télédiffusion de France). @param {Record<string, string|undefined>} t */
export const isTdf = (t) => /(^|[^a-z])TDF([^a-z]|$)|t[ée]l[ée]diffusion/i.test([t.operator, t.owner, t.brand, t.name].filter(Boolean).join(' '));

/** Statue, buste, monument commémoratif (et pas une tour). @param {{tags?: Record<string, string>}} e */
export const isStatueEl = (e) => { const t = e.tags || {}; return !t.man_made && (t.historic === 'memorial' || t.historic === 'monument' || t.tourism === 'artwork'); };

/**
 * Une tour relève-t-elle du télécom ? Renvoie le motif, ou '' si elle est écartée. Les écartés sont conservés pour le diagnostic.
 * @param {Record<string, string>} t
 */
export function towerRel(t) {
  const mm = t.man_made, ty = t['tower:type'], h = parseFloat(t.height), hasH = isFinite(h);
  if (mm === 'communications_tower') return 'communications_tower';
  if (ty === 'communication') return 'tower:type=communication';
  if (isTdf(t)) return 'exploitant TDF';
  if (Object.keys(t).some((k) => k.startsWith('communication:'))) return 'tag communication:*';
  if (mm === 'mast' && !ty && (!hasH || h >= 20)) return 'mât' + (hasH ? '' : ' (hauteur inconnue)');
  if (mm === 'tower' && !ty && hasH && h >= 40) return 'tour haute (' + Math.round(h) + ' m)';
  return '';
}

/** Réduit un élément OSM à ses étiquettes utiles. @param {any} n @param {string[]} gardees @returns {Record<string, string>} */
function etiquettesUtiles(n, gardees) {
  /** @type {Record<string, string>} */
  const tags = {};
  for (const k of gardees) if (n.tags[k] !== undefined && n.tags[k] !== null) tags[k] = n.tags[k];
  for (const k in n.tags) if (k.startsWith('communication:') && Object.keys(tags).length < 30) tags[k] = n.tags[k];
  return tags;
}

/**
 * Objets OSM d'une tuile (réponse Overpass) → objets compacts (v1 : `otParse`).
 * @param {{elements?: any[]}} j @returns {ObjetOsm[]}
 */
export function lireTuileOsm(j) {
  /** @type {ObjetOsm[]} */
  const out = [];
  const seen = new Set();
  for (const n of (j.elements || [])) {
    const lat = n.lat ?? (n.center && n.center.lat), lon = n.lon ?? (n.center && n.center.lon);
    if (lat === undefined || lat === null || lon === undefined || lon === null || !n.tags) continue;
    const id = n.type + '/' + n.id;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ type: n.type, id: n.id, lat, lon, tags: etiquettesUtiles(n, OT_KEEP) });
  }
  return out;
}

/**
 * Tours (rel = télécom retenue ou non, avec motif). @param {{elements?: any[]}} j @returns {Tour[]}
 */
export function parseTowers(j) {
  const seen = new Set();
  /** @type {Tour[]} */
  const got = [];
  for (const n of (j.elements || [])) {
    const lat = n.lat ?? (n.center && n.center.lat), lon = n.lon ?? (n.center && n.center.lon);
    if (lat === undefined || lat === null || lon === undefined || lon === null || !n.tags) continue;
    const id = n.type + '/' + n.id;
    if (seen.has(id)) continue;
    seen.add(id);
    const tags = etiquettesUtiles(n, TW_TAGS), why = towerRel(tags);
    got.push({ id, lat, lon, tags, rel: !!why, why: why || `écarté : ${tags.man_made || '?'}${tags['tower:type'] ? ' / ' + tags['tower:type'] : ''}${tags.height ? ' / ' + tags.height + ' m' : ' / sans hauteur'}` });
  }
  return got;
}

/** Sépare les objets des tuiles en statues et en tours. @param {ObjetOsm[]} els */
export function separerTuilesOsm(els) {
  return { statues: els.filter(isStatueEl), tours: parseTowers({ elements: els.filter((e) => !isStatueEl(e)).map((e) => ({ type: e.type, id: e.id, lat: e.lat, lon: e.lon, tags: e.tags })) }) };
}

/** Localité (ville, bourg, village) la plus proche, à moins de 8 km. @param {Point} p @param {{name: string, kind: string, lat: number, lon: number}[]} cities */
export function nearestLocality(p, cities) {
  let best = null, bd = 8;
  for (const c of cities) {
    if (c.kind !== 'city' && c.kind !== 'town' && c.kind !== 'village') continue;
    if (Math.abs(c.lat - p.lat) > 0.1 || Math.abs(c.lon - p.lon) > 0.15) continue;
    const d = distanceEtCap(p, c).distKm;
    if (d < bd) { bd = d; best = c; }
  }
  return best ? best.name : '';
}

/**
 * Nom d'usage tiré du commentaire de dernière modification d'un objet OSM sans nom (« updated Mabilay » → « Mabilay »), ou ''.
 * @param {unknown} commentaire
 */
export function osmHintFrom(commentaire) {
  const c = String(commentaire || '').trim();
  const t = c.replace(/^\s*(updated?|added?|created?|fix(ed)?|edit(ed)?|modif(i[ée]e?|ied)|mise?\s+[àa]\s+jour|maj|ajout(é|ée|e)?)\s*:?\s+/i, '').trim();
  return t !== c && t.length >= 3 && t.length < 41 && !/#|https?:|^\d+$/.test(t) && !/^(survey|tags?|tower|mast|tour|m[âa]t|pyl[ôo]ne|antenne|communication|data|info)$/i.test(t) ? t : '';
}

/**
 * @typedef {object} EntreesOsm
 * @property {Point} pos @property {number} rayonKm rayon des monuments (15 à 30 km) @property {{name: string, kind: string, lat: number, lon: number}[]} cities
 * @property {Tour[]} tours @property {ObjetOsm[]} statues @property {Record<string, string>} hints noms d'usage appris (id OSM → nom)
 * @property {{icon?: string, height_m?: number | string, owner?: string, lat: number, lon: number}[]} supportsAnfr supports ANFR (calque télécom)
 * @property {{id?: string | null, lat: number, lon: number, kind?: string, height_m?: number, named?: boolean, name?: string}[]} batiments bâtiments hauts (calque bâtiments)
 * @property {boolean} avecAnfr les supports ANFR sont-ils ajoutés ? (calque monuments actif)
 */

/**
 * Tours de télécoms comme monuments, plus les supports ANFR non déjà présents dans OSM à moins de 120 m.
 * @param {EntreesOsm} e @returns {Monument[]}
 */
export function towerMonuments({ pos, rayonKm: R, cities, tours, hints, supportsAnfr, avecAnfr }) {
  /** @type {Monument[]} */
  const towerMons = tours.filter((t) => t.rel !== false && distanceEtCap(pos, t).distKm <= R).map((t) => {
    const tg = t.tags, tdf = isTdf(tg), h = parseFloat(tg.height), hOk = isFinite(h) && h > 0;
    const real = (tg['name:fr'] || tg.name || tg.official_name || tg.alt_name || '').trim(), named = real && !/^(tdf|tour|m[âa]t|pyl[ôo]ne|antenne)$/i.test(real);
    const loc = nearestLocality(t, cities), base = tg.man_made === 'mast' ? 'Mât' : 'Tour', hint = !real ? hints[t.id] : '', place = hint || loc;
    const name = named ? real : `${base}${tdf ? ' TDF' : ''}${tg.ref ? ' ' + tg.ref : ''}${place ? ' · ' + place : ''}${hOk ? ` (${Math.round(h)} m)` : ''}`;
    return { name, lat: t.lat, lon: t.lon, kind: /** @type {'monument'} */ ('monument'), cat: /** @type {'monument'} */ ('monument'), qid: null, src: 'osm', osm: t.id, tdf, loc, tags: tg, type: 'tour', unnamed: !named, hint,
      links: MON_LOW_LINKS, prot: false, htWd: null, htOsm: hOk ? h : null, ht: hOk ? h : (MON_DEF_H.tour || 40),
      types: 'tour de télécommunications (OpenStreetMap)' + (tdf ? ' · exploitant TDF' : ''), why: 'tour TDF / télécom (OpenStreetMap)' };
  });
  if (avecAnfr) {
    const osmT = towerMons.slice();
    for (const s of supportsAnfr) {
      if (s.icon !== 'pylone' && s.icon !== 'mat') continue;
      const h = +(s.height_m ?? NaN), hOk = isFinite(h) && h > 0;
      if (s.icon === 'pylone' ? (hOk && h < 20) : !(hOk && h >= 30)) continue;
      if (distanceEtCap(pos, s).distKm > R || osmT.some((t) => Math.abs(t.lat - s.lat) < 0.002 && Math.abs(t.lon - s.lon) < 0.003 && distanceEtCap(t, s).distKm < 0.12)) continue;
      const tdf = isTdf({ operator: s.owner }), loc = nearestLocality(s, cities), place = loc, base = s.icon === 'mat' ? 'Mât' : 'Tour';
      towerMons.push({ name: `${base}${tdf ? ' TDF' : ''}${place ? ' · ' + place : ''}${hOk ? ` (${Math.round(h)} m)` : ''}`, lat: s.lat, lon: s.lon, kind: 'monument', cat: 'monument', qid: null, src: 'osm', anfr: true, osm: null,
        tdf, loc, tags: { operator: s.owner || '', height: hOk ? String(h) : '', man_made: s.icon === 'mat' ? 'mast' : 'tower' }, type: 'tour', unnamed: false, hint: '',
        links: MON_LOW_LINKS, prot: false, htWd: null, htOsm: hOk ? h : null, ht: hOk ? h : (MON_DEF_H.tour || 40),
        types: 'support télécom (ANFR)' + (s.owner ? ' · ' + s.owner : ''), why: "support télécom référencé par l'ANFR" });
    }
  }
  return towerMons;
}

/** Tours non télécom et bâtiments hauts candidats (clocher, tour, immeuble de grande hauteur), un seul par position. @param {Tour[]} tours @param {EntreesOsm['batiments']} batiments */
function tallCandidates(tours, batiments) {
  /** @type {{id: string | null | undefined, lat: number, lon: number, name: string, h: number | null, kind: string}[]} */
  const out = [];
  /** @type {Point[]} */
  const seenPos = [];
  const add = (/** @type {string | null | undefined} */ id, /** @type {number} */ lat, /** @type {number} */ lon, /** @type {string} */ name, /** @type {number | null} */ h, /** @type {string} */ kind) => {
    if (seenPos.some((p) => Math.abs(p.lat - lat) < 0.0004 && Math.abs(p.lon - lon) < 0.0006)) return;
    seenPos.push({ lat, lon });
    out.push({ id, lat, lon, name, h, kind });
  };
  for (const t of tours) {
    if (t.rel) continue;
    const tg = t.tags || {};
    if (tg.man_made !== 'tower') continue;
    const ty = tg['tower:type'] || '', bell = /bell_tower|church|campanile/.test(ty), h = parseFloat(tg.height);
    if (/communication|cooling|lighting|observation|watchtower|defensive/.test(ty) && !(isFinite(h) && h >= TALL_MIN_H)) continue;
    if (!(bell || (isFinite(h) && h >= TALL_MIN_H))) continue;
    add(t.id, t.lat, t.lon, (tg['name:fr'] || tg.name || '').trim(), isFinite(h) ? h : null, bell ? 'clocher' : 'tour');
  }
  for (const b of batiments) {
    const h = b.height_m;
    if (b.kind === 'immeuble' ? !(/** @type {number} */ (h) >= TALL_BLD_MIN_H) : !(b.kind === 'clocher' || (b.kind === 'tour' && /** @type {number} */ (h) >= TALL_MIN_H))) continue;
    add(b.id || null, b.lat, b.lon, b.named ? /** @type {string} */ (b.name) : '', h || null, b.kind === 'clocher' ? 'clocher' : b.kind === 'immeuble' ? 'immeuble' : 'tour');
  }
  return out;
}

/**
 * Bâtiments hauts OSM comme monuments. Près d'un monument Wikidata (< 120 m) : on lui donne la hauteur OSM (s'il n'en a pas) — ici sur une COPIE
 * de la base, renvoyée avec la liste. Sinon : nouveau monument, nom OSM ou nom générique + localité.
 * @param {EntreesOsm} e @param {Monument[]} base @returns {{tall: Monument[], base: Monument[]}}
 */
export function tallMonuments({ tours, batiments, cities }, base) {
  /** @type {Monument[]} */
  const base2 = base.map((m) => ({ ...m }));
  /** @type {Monument[]} */
  const tall = [];
  for (const T of tallCandidates(tours, batiments)) {
    const M = base2.find((m) => m.cat !== 'equip' && Math.abs(m.lat - T.lat) < 0.0015 && Math.abs(m.lon - T.lon) < 0.002 && distanceEtCap(m, T).distKm < TALL_MERGE_KM);
    if (M) {
      if (T.h && !M.htWd) { M.ht = T.h; M.htOsm = T.h; }
      if (T.kind === 'clocher' && /^(musee|maison|edifice)$/.test(M.type)) M.type = 'clocher';
      M.osmTall = /** @type {string} */ (T.id);
      continue;
    }
    const loc = nearestLocality(T, cities), baseNom = T.kind === 'clocher' ? 'Clocher' : T.kind === 'immeuble' ? 'Immeuble' : 'Tour';
    const name = T.name || `${baseNom}${T.h ? ` (${Math.round(T.h)} m)` : ''}${loc ? ' · ' + loc : ''}`;
    tall.push({ name, lat: T.lat, lon: T.lon, kind: 'monument', cat: 'monument', qid: null, src: 'osmh', osm: T.id, loc, type: T.kind === 'clocher' ? 'clocher' : 'tour', unnamed: !T.name,
      links: MON_LOW_LINKS, prot: false, htWd: null, htOsm: T.h, ht: T.h || (T.kind === 'clocher' ? MON_DEF_H.clocher : TALL_MIN_H),
      types: (T.kind === 'clocher' ? 'clocher' : T.kind === 'immeuble' ? 'immeuble de grande hauteur' : 'tour') + ' (OpenStreetMap)', why: 'bâtiment haut repéré dans OpenStreetMap' });
  }
  return { tall, base: base2 };
}

/** Statues, bustes, obélisques, monuments commémoratifs nommés, non déjà connus de Wikidata (à moins de 60 m). @param {ObjetOsm[]} statues @param {Monument[]} base @returns {Monument[]} */
export function statueMonuments(statues, base) {
  /** @type {Monument[]} */
  const out = [];
  const near = (/** @type {Point} */ a, /** @type {Point} */ b) => Math.abs(a.lat - b.lat) < 0.001 && Math.abs(a.lon - b.lon) < 0.0015 && distanceEtCap(a, b).distKm < 0.06;
  for (const e of statues) {
    const t = e.tags || {}, nm = (t['name:fr'] || t.name || '').trim();
    if (!nm) continue;
    if (base.some((m) => m.cat !== 'equip' && near(m, e))) continue; // déjà connu de Wikidata
    const sub = t.historic === 'monument' ? 'monument' : (t.memorial || t.artwork_type || 'statue'), h = parseFloat(t.height), hOk = isFinite(h) && h > 0 && h < 120;
    const what = sub === 'bust' ? 'buste' : sub === 'obelisk' ? 'obélisque' : sub === 'column' ? 'colonne' : sub === 'monument' ? 'monument' : sub === 'sculpture' ? 'sculpture' : 'statue';
    const name = new RegExp(what, 'i').test(nm) ? nm : `${nm} (${what})`;
    out.push({ name, lat: e.lat, lon: e.lon, kind: 'monument', cat: 'monument', qid: null, src: 'osms', osm: e.type + '/' + e.id, type: 'colonne', unnamed: false,
      links: MON_LOW_LINKS, prot: false, htWd: null, htOsm: hOk ? h : null, ht: hOk ? h : (STATUE_H[sub] || 8),
      types: `${what} (OpenStreetMap)`, why: `${what} repéré(e) dans OpenStreetMap (visible de près seulement)` });
  }
  return out;
}

/**
 * Monuments Wikidata + tours OSM + immeubles hauts + statues ; une tour déjà connue de Wikidata (monument à moins de 150 m) n'est pas doublée.
 * @param {EntreesOsm} e @param {Monument[]} base base Wikidata (monuments et équipements) @returns {Monument[]}
 */
export function combinerMonuments(e, base) {
  const tw = towerMonuments(e), { tall, base: base2 } = tallMonuments(e, base), st = statueMonuments(e.statues, base);
  if (!tw.length && !tall.length && !st.length) return base2;
  const near = (/** @type {Point} */ a, /** @type {Point} */ b, /** @type {number} */ km) => Math.abs(a.lat - b.lat) < 0.002 && Math.abs(a.lon - b.lon) < 0.003 && distanceEtCap(a, b).distKm < km;
  const tw2 = tw.filter((t) => !base.some((m) => m.cat !== 'equip' && near(m, t, 0.15)));
  return base2.concat(tw2, tall.filter((t) => !tw2.some((o) => near(o, t, 0.05))), st);
}

/**
 * Un repère haut OSM qui EST un monument (Tour Eiffel, Montparnasse…) n'est dessiné qu'une fois : pour chaque bâtiment, vrai s'il y a un monument à moins de 250 m.
 * @param {Point[]} batiments @param {Monument[]} monuments @returns {boolean[]}
 */
export function doublonsBatiments(batiments, monuments) {
  return batiments.map((b) => monuments.some((m) => m.cat !== 'equip' && Math.abs(m.lat - b.lat) < 0.003 && Math.abs(m.lon - b.lon) < 0.004 && distanceEtCap(m, b).distKm < 0.25));
}
