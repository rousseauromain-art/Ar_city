// @ts-check
/**
 * Chargement des monuments Wikidata. Quatre chemins, dans l'ordre :
 *  1. le relais, par tuiles : /wdtile (tuiles de 0,1°, jusqu'à 15 km : tout lieu Wikidata avec un article, trié ICI par wdClassify) et, au-delà de
 *     15 km ou si le relais est ancien, /monuments (tuiles de 0,2°, les plus célèbres) ; 3 requêtes à la fois, la plus proche d'abord,
 *     application au fur et à mesure, mémoire de 30 jours par tuile, mémoire périmée en secours ;
 *  2. Wikidata en direct (zone entière, requête complète puis légère) ;
 *  3. la dernière réponse mémorisée pour la zone (6 zones).
 * Entrées : position, rayon, relais. Sortie : { statut, fabrication, comment, erreurs }. Tout passe par donnees/reseau.js. Reprend `loadMonuments` de la v1
 * (mêmes clés de mémoire `wd/<i>,<j>`). Dépend de : donnees/{monuments-wikidata,wikidata,cache-donnees}.js, noyau/geo.js.
 */
import { distanceEtCap } from '../noyau/geo.js';
import { RAD } from '../noyau/constantes.js';
import { MON_LOW_LINKS, MON_MIN_LINKS, MON_STAR_LINKS, fabriquerMonuments } from './monuments-wikidata.js';
import { sparqlMon, normWdqs } from './wikidata.js';
import { baseRelais } from './relais-lieux.js';
import { SECOURS_PAR_DEFAUT_MS } from './cache-donnees.js';

/** @typedef {import('./monuments-wikidata.js').LigneWikidata} LigneWikidata */
/** @typedef {ReturnType<typeof fabriquerMonuments>} Fabrication */
/** @typedef {{key: string, lat: number, lon: number, d: number, rk?: number}} TuileWikidata */

/** Tuile Wikidata (degrés), mémoire 30 jours. */
export const WD_TUILE_DEG = 0.1;
export const WD_MEMOIRE_MS = 30 * 86400000;
/** Anciennes tuiles du relais (degrés), mémoire 30 jours. */
export const ANCIENNE_TUILE_DEG = 0.2;
export const ANCIENNE_MEMOIRE_MS = 30 * 86400000;
/** Au plus près de cette distance (km), les tuiles /wdtile ; au-delà, les anciennes tuiles. */
export const PROCHE_KM = 15;

/** Rayon de recherche des monuments : 15 à 30 km (au-delà la requête Wikidata dépasse le délai autour de Paris). @param {number} rayonKm */
export const rayonMonuments = (rayonKm) => Math.min(30, Math.max(15, rayonKm));

/** Tuiles /wdtile à moins de `Rn` km, la plus proche d'abord. @param {{lat: number, lon: number}} pos @param {number} Rn @returns {TuileWikidata[]} */
export function tuilesWikidataProches(pos, Rn) {
  const kmLat = 111.19, kmLon = 111.19 * Math.cos(pos.lat * RAD);
  /** @type {TuileWikidata[]} */
  const out = [];
  const di = Math.ceil(Rn / (WD_TUILE_DEG * kmLat)) + 1, dj = Math.ceil(Rn / (WD_TUILE_DEG * Math.max(0.2, kmLon))) + 1;
  const i0 = Math.floor(pos.lat / WD_TUILE_DEG), j0 = Math.floor(pos.lon / WD_TUILE_DEG);
  for (let i = i0 - di; i <= i0 + di; i++) for (let j = j0 - dj; j <= j0 + dj; j++) {
    const s = i * WD_TUILE_DEG, w = j * WD_TUILE_DEG;
    const d = distanceEtCap(pos, { lat: Math.min(s + WD_TUILE_DEG, Math.max(s, pos.lat)), lon: Math.min(w + WD_TUILE_DEG, Math.max(w, pos.lon)) }).distKm; // point le plus proche de la tuile
    if (d <= Rn) out.push({ key: i + ',' + j, lat: s + WD_TUILE_DEG / 2, lon: w + WD_TUILE_DEG / 2, d });
  }
  return out.sort((x, y) => x.d - y.d);
}

/** Anciennes tuiles de 0,2° autour de la position jusqu'à `R` km. @param {{lat: number, lon: number}} pos @param {number} R @returns {TuileWikidata[]} */
export function anciennesTuilesAutour(pos, R) {
  const kmLat = 111.19, kmLon = 111.19 * Math.cos(pos.lat * RAD);
  /** @type {TuileWikidata[]} */
  const out = [];
  const di = Math.ceil((R + 8) / (ANCIENNE_TUILE_DEG * kmLat)), dj = Math.ceil((R + 8) / (ANCIENNE_TUILE_DEG * Math.max(0.2, kmLon)));
  const i0 = Math.floor(pos.lat / ANCIENNE_TUILE_DEG), j0 = Math.floor(pos.lon / ANCIENNE_TUILE_DEG);
  for (let i = i0 - di; i <= i0 + di; i++) for (let j = j0 - dj; j <= j0 + dj; j++) {
    const lat = (i + 0.5) * ANCIENNE_TUILE_DEG, lon = (j + 0.5) * ANCIENNE_TUILE_DEG, d = distanceEtCap(pos, { lat, lon }).distKm;
    if (d <= R + 4) out.push({ key: i + ',' + j, lat, lon, d, rk: Math.ceil(Math.hypot((ANCIENNE_TUILE_DEG * kmLat) / 2, (ANCIENNE_TUILE_DEG * 111.19 * Math.cos(lat * RAD)) / 2)) });
  }
  return out.sort((x, y) => x.d - y.d);
}

/** @typedef {{ok: boolean, statut: number, donnees: any}} ReponseBrute */
/**
 * @param {{
 *   reseau: {requeter: (url: string, o?: any) => Promise<unknown>},
 *   cache: ReturnType<typeof import('./cache-donnees.js').creerCacheDonnees>,
 *   stockage: {lire: (nom: string, defaut?: any) => any, ecrire: (nom: string, v: unknown) => boolean},
 *   relais: string | undefined,
 *   maintenant?: () => number,
 *   journal?: {info: (m: string, msg: string, d?: unknown) => unknown, avert: (m: string, msg: string, d?: unknown) => unknown},
 * }} deps
 */
export function creerSourceMonuments({ reseau, cache, stockage, relais, maintenant = Date.now, journal }) {
  const base = baseRelais(relais);
  /** @type {Map<string, LigneWikidata[]>} */
  const wdTuiles = new Map();
  /** @type {Map<string, LigneWikidata[]>} */
  const anciennes = new Map();
  let wdAncienMode = false;
  /** @param {unknown} e */
  const msg = (e) => (e instanceof Error ? e.message : String(e));

  /** @param {string} url @param {number} delaiMs @returns {Promise<ReponseBrute>} */
  const brut = async (url, delaiMs) => /** @type {ReponseBrute} */ (await reseau.requeter(url, { brut: true, delaiMs }));

  /** Tuile /wdtile du relais ; une route absente (4xx sans `wdOk`) lève une erreur `noRoute`. @param {TuileWikidata} t */
  async function chargerTuileWd(t) {
    const r = await brut(`${base}/wdtile?lat=${t.lat.toFixed(3)}&lon=${t.lon.toFixed(3)}&min_links=1`, 95000), j = r.donnees || {};
    if (!r.ok || j.wdOk === false || j.wdOk === undefined) {
      const e = Object.assign(new Error(j.error || ('HTTP ' + r.statut)), { status: r.statut, noRoute: j.wdOk === undefined && r.statut >= 400 && r.statut < 500 });
      throw e;
    }
    if (!Array.isArray(j.rows)) throw new Error('réponse du relais inattendue');
    cache.compter('wd', 'net');
    cache.ecrire('wd/' + t.key, JSON.stringify({ rows: j.rows, minLinksUsed: j.minLinksUsed, truncated: !!j.truncated }), 'application/json')
      .then(() => cache.elaguerSiBesoin('wd', 'wd/', 250));
    return { rows: j.rows, cache: j.cache || '', used: j.minLinksUsed || 1, truncated: !!j.truncated };
  }

  /** Ancienne tuile /monuments du relais (célèbres seulement au-delà de 15 km). @param {TuileWikidata} t */
  async function chargerAncienneTuile(t) {
    const proche = t.d <= PROCHE_KM;
    const u = `${base}/monuments?lat=${t.lat.toFixed(3)}&lon=${t.lon.toFixed(3)}&radius_km=${t.rk}&pad=1&min_links=${proche ? MON_LOW_LINKS : MON_STAR_LINKS}${proche ? '&prot=1' : ''}`;
    const r = await brut(u, 70000), j = r.donnees || {};
    if (!r.ok || j.monumentsOk === false) throw Object.assign(new Error(j.error || ('HTTP ' + r.statut)), { status: r.statut });
    if (!Array.isArray(j.monuments)) throw new Error('réponse du relais inattendue');
    return { list: j.monuments, cache: j.cache || '' };
  }

  /** Union dédoublonnée des tuiles chargées (les tuiles Wikidata d'abord : données les plus complètes). @returns {LigneWikidata[]} */
  function fusionTuiles() {
    const seen = new Set();
    /** @type {LigneWikidata[]} */
    const out = [];
    for (const l of [...wdTuiles.values(), ...anciennes.values()]) for (const m of l) { if (!m || seen.has(m.qid)) continue; seen.add(m.qid); out.push(m); }
    return out;
  }

  /** Wikidata en direct (zone entière) : requête complète puis légère. @param {{lat: number, lon: number}} pos @param {number} R */
  async function wikidataDirect(pos, R) {
    /** @type {string[]} */
    const errs = [];
    for (const [full, ms] of /** @type {[boolean, number][]} */ ([[true, 30000], [false, 20000]])) {
      try {
        const j = await reseau.requeter('https://query.wikidata.org/sparql', { methode: 'POST', entetes: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/sparql-results+json' },
          corps: 'query=' + encodeURIComponent(sparqlMon(pos.lat, pos.lon, Math.min(45, R + 1), MON_MIN_LINKS, full)), delaiMs: ms });
        return { list: normWdqs(j), how: 'Wikidata direct' + (full ? '' : ' (requête légère)') };
      } catch (e) { errs.push((full ? 'complète' : 'légère') + ' : ' + msg(e)); }
    }
    throw new Error(errs.join(' | '));
  }

  /** Dernières réponses par zone (6 zones) : les monuments ne changent pas. @returns {{lat: number, lon: number, t: number, list: LigneWikidata[]}[]} */
  const zonesMemorisees = () => stockage.lire('monuments', []) || [];
  /** @param {{lat: number, lon: number}} pos @param {LigneWikidata[]} list */
  function memoriserZone(pos, list) {
    const all = zonesMemorisees().filter((z) => distanceEtCap(z, pos).distKm > 3);
    all.unshift({ lat: pos.lat, lon: pos.lon, t: maintenant(), list });
    stockage.ecrire('monuments', all.slice(0, 6));
  }

  return {
    /** Oublie les tuiles chargées pendant cette session. */
    vider() { wdTuiles.clear(); anciennes.clear(); },
    ancienMode: () => wdAncienMode,
    /**
     * @param {{pos: {lat: number, lon: number}, rayonKm: number, force?: boolean, pendantChargement?: (f: Fabrication, comment: string) => void}} p
     * `pendantChargement` : appelée au fur et à mesure (toutes les 1,5 s environ) avec ce qui est déjà chargé.
     * @returns {Promise<{statut: 'ok' | 'partiel' | 'direct' | 'memoire' | 'indisponible', fabrication: Fabrication | null, comment: string, erreurs: string[], tuilesEnEchec: number}>}
     */
    async charger({ pos, rayonKm, force, pendantChargement }) {
      const R = rayonMonuments(rayonKm);
      /** @type {string[]} */
      const errs = [];
      if (force) { wdTuiles.clear(); anciennes.clear(); }
      let tilesOk = 0, tilesKo = 0, fromStore = 0, staleN = 0, edge = 0, nTiles = 0, stop = false, truncated = 0, raised = 0;
      const progression = (/** @type {string} */ comment) => { if (pendantChargement) pendantChargement(fabriquerMonuments(fusionTuiles(), { pos, minLinks: MON_LOW_LINKS }), comment); };
      if (base) {
        /** @type {{k: 'wd' | 'old', t: TuileWikidata}[]} */
        const jobs = [];
        if (!wdAncienMode) for (const t of tuilesWikidataProches(pos, Math.min(PROCHE_KM, R))) jobs.push({ k: 'wd', t });
        for (const t of anciennesTuilesAutour(pos, R)) if (wdAncienMode || t.d > PROCHE_KM) jobs.push({ k: 'old', t });
        nTiles = jobs.length;
        /** @type {Record<string, {t: number, list: LigneWikidata[]}>} */
        const store = stockage.lire('tuilesAnciennes', {}) || {};
        /** @type {typeof jobs} */
        const todo = [];
        for (const j of jobs) {
          const t = j.t;
          if (j.k === 'wd') {
            if (wdTuiles.has(t.key)) { tilesOk++; continue; }
            const z = !force && await cache.lire('wd/' + t.key, WD_MEMOIRE_MS, false);
            if (z && z.donnees && Array.isArray(z.donnees.rows)) {
              wdTuiles.set(t.key, z.donnees.rows); tilesOk++; fromStore++; cache.compter('wd', 'hit');
              if (z.donnees.truncated) truncated++;
              if (z.donnees.minLinksUsed > 1) raised++;
              continue;
            }
          } else {
            if (anciennes.has(t.key)) { tilesOk++; continue; }
            const z = !force && store[t.key];
            if (z && maintenant() - z.t < ANCIENNE_MEMOIRE_MS) { anciennes.set(t.key, z.list); tilesOk++; fromStore++; continue; }
          }
          todo.push(j);
        }
        if (tilesOk) progression(`tuiles : ${tilesOk}/${nTiles}…`);
        let derniere = maintenant();
        const ouvrier = async () => {
          while (!stop && todo.length) {
            const j = /** @type {typeof jobs[number]} */ (todo.shift()), t = j.t;
            try {
              if (j.k === 'wd') { const r = await chargerTuileWd(t); wdTuiles.set(t.key, r.rows); if (r.truncated) truncated++; if (r.used > 1) raised++; if (r.cache) edge++; }
              else {
                const r = await chargerAncienneTuile(t); anciennes.set(t.key, r.list);
                const st = stockage.lire('tuilesAnciennes', {}) || {};
                st[t.key] = { t: maintenant(), list: r.list };
                for (const k of Object.keys(st).sort((x, y) => st[y].t - st[x].t).slice(150)) delete st[k];
                stockage.ecrire('tuilesAnciennes', st);
                if (r.cache) edge++;
              }
              tilesOk++;
            } catch (e) {
              const err = /** @type {any} */ (e);
              if (j.k === 'wd' && err && err.noRoute) { // relais pas encore mis à jour : on retombe sur l'ancienne route pour la zone proche
                if (!wdAncienMode) {
                  wdAncienMode = true; errs.push('relais sans /wdtile : ancien mode (mettre le relais à jour)');
                  for (let i = todo.length - 1; i >= 0; i--) if (todo[i].k === 'wd') { todo.splice(i, 1); nTiles--; }
                  for (const o of anciennesTuilesAutour(pos, R)) if (o.d <= PROCHE_KM && !anciennes.has(o.key)) { todo.unshift({ k: 'old', t: o }); nTiles++; }
                }
                nTiles--;
                continue;
              }
              if (j.k === 'wd') {
                const z = await cache.lire('wd/' + t.key, SECOURS_PAR_DEFAUT_MS, false); // réseau en échec : mémoire périmée plutôt qu'un trou
                if (z && z.donnees && Array.isArray(z.donnees.rows)) { wdTuiles.set(t.key, z.donnees.rows); tilesOk++; staleN++; cache.compter('wd', 'stale'); continue; }
                cache.compter('wd', 'fail');
              }
              tilesKo++; errs.push(`tuile ${t.key} : ${msg(e)}`);
              if ((err && err.status === 429) || (!tilesOk && tilesKo >= 3)) stop = true; // relais manifestement en panne : on n'insiste pas
            }
            if (maintenant() - derniere > 1500) { derniere = maintenant(); progression(`tuiles : ${tilesOk}/${nTiles}…`); }
          }
        };
        await Promise.all([ouvrier(), ouvrier(), ouvrier()]);
        if (tilesOk) { // au moins une tuile : on affiche ce qu'on a
          const how = `relais, ${tilesOk}/${nTiles} tuile(s)${fromStore ? ` dont ${fromStore} en mémoire` : ''}${staleN ? `, ${staleN} en mémoire périmée (réseau en échec)` : ''}${edge ? `, ${edge} en cache relais` : ''}${truncated ? `, ${truncated} tuile(s) très dense(s)` : ''}${raised ? `, seuil de langues relevé sur ${raised}` : ''}${wdAncienMode ? ', ancien mode' : ''}`;
          const fabrication = fabriquerMonuments(fusionTuiles(), { pos, minLinks: MON_LOW_LINKS });
          return { statut: tilesKo ? 'partiel' : 'ok', fabrication, comment: how, erreurs: errs.slice(0, 3), tuilesEnEchec: tilesKo };
        }
      }
      // relais absent ou aucune tuile obtenue : Wikidata en direct (zone entière), puis mémoire de l'appareil
      if (errs.length) errs.splice(3);
      /** @type {{list: LigneWikidata[], how: string} | null} */
      let got = null;
      try { got = await wikidataDirect(pos, R); } catch (e) { errs.push('direct : ' + msg(e)); }
      if (got && got.list.length) memoriserZone(pos, got.list);
      let depuisMemoire = false;
      if (!got) {
        const z = zonesMemorisees().find((zz) => distanceEtCap(zz, pos).distKm < 10);
        if (z) { got = { list: z.list, how: `mémoire de l'appareil (${new Date(z.t).toLocaleDateString('fr-FR')})` }; depuisMemoire = true; }
      }
      if (got) return { statut: depuisMemoire ? 'memoire' : 'direct', fabrication: fabriquerMonuments(got.list, { pos, minLinks: MON_MIN_LINKS }), comment: got.how, erreurs: errs, tuilesEnEchec: 0 };
      if (journal) journal.avert('monuments', 'aucune source disponible', errs);
      return { statut: 'indisponible', fabrication: null, comment: 'indispo : ' + (errs.join(' | ') || 'aucune source'), erreurs: errs, tuilesEnEchec: 0 };
    },
  };
}
