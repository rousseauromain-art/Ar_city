// @ts-check
/**
 * Objets OpenStreetMap autour de la position (tours, mâts, châteaux d'eau, cheminées, statues), en tuiles fixes : UNE source commune aux tours,
 * aux clochers et bâtiments hauts, aux statues et aux repères hauts. Chaque tuile est une petite requête Overpass, mémorisée 14 jours ;
 * se déplacer ne charge que les tuiles nouvelles, une tuile en échec n'empêche pas les autres, les plus proches d'abord.
 *  - proche (jusqu'à F km) : tuiles de 0,1° × 0,14° (~11 km), tous les tours, mâts, châteaux d'eau, cheminées et statues ;
 *  - lointain (F à R km) : tuiles de 0,3° × 0,42° (~33 km), seulement les vraies tours télécom.
 * Entrées : position, portées, Overpass (donnees/overpass.js), mémoire (donnees/cache-donnees.js). Sortie : objets OSM compacts. Reprend la v1.
 */
import { distanceEtCap } from '../noyau/geo.js';
import { lireTuileOsm } from './monuments-osm.js';

/** @typedef {import('./monuments-osm.js').ObjetOsm} ObjetOsm */
/** @typedef {{i: number, j: number, s: number, w: number, n: number, e: number, d: number}} TuileOsm */

/** Mémoire des tuiles : 14 jours. Délai par miroir pour une tuile proche (rapide) et lointaine. */
export const MEMOIRE_TUILES_OSM_MS = 14 * 86400000;
const DELAI_PROCHE_MS = 9000, DELAI_LOINTAIN_MS = 12000;
/** Tailles de grille [latitude, longitude] en degrés. */
export const GRILLE_PROCHE = Object.freeze([0.1, 0.14]);
export const GRILLE_LOINTAINE = Object.freeze([0.3, 0.42]);
const TOUT_MAN_MADE = '^(tower|communications_tower|water_tower|chimney|mast)$';
/** Statues et monuments commémoratifs nommés (de près seulement, 800 m). @param {string} bb */
const REQUETE_STATUES = (bb) => `nwr["historic"="memorial"]["memorial"~"^(statue|bust|obelisk|column|sculpture)$"]["name"]${bb};nwr["tourism"="artwork"]["artwork_type"~"^(statue|bust|sculpture|obelisk)$"]["name"]${bb};nwr["historic"="monument"]["name"]${bb};`;

/**
 * Tuiles de la grille `g` dont la distance à la position est dans [deKm, aKm], les plus proches d'abord.
 * @param {{lat: number, lon: number}} pos @param {readonly number[]} g @param {number} deKm @param {number} aKm
 * @returns {TuileOsm[]}
 */
export function tuilesOsm(pos, g, deKm, aKm) {
  /** @type {TuileOsm[]} */
  const out = [];
  const dLat = aKm / 111.32, dLon = aKm / (111.32 * Math.max(0.2, Math.cos((pos.lat * Math.PI) / 180)));
  for (let i = Math.floor((pos.lat - dLat) / g[0]); i <= Math.floor((pos.lat + dLat) / g[0]); i++) for (let j = Math.floor((pos.lon - dLon) / g[1]); j <= Math.floor((pos.lon + dLon) / g[1]); j++) {
    const s = i * g[0], w = j * g[1], n = s + g[0], e = w + g[1];
    const cl = { lat: Math.min(n, Math.max(s, pos.lat)), lon: Math.min(e, Math.max(w, pos.lon)) }, d = distanceEtCap(pos, cl).distKm;
    const far = { lat: pos.lat < (s + n) / 2 ? n : s, lon: pos.lon < (w + e) / 2 ? e : w }, dmax = distanceEtCap(pos, far).distKm;
    if (d <= aKm && dmax > deKm) out.push({ i, j, s, w, n, e, d });
  }
  return out.sort((a, b) => a.d - b.d);
}

/** Clé de mémoire et requête Overpass d'une tuile. @param {TuileOsm} t @param {boolean} complete */
export function requeteTuileOsm(t, complete) {
  const cle = complete ? `ot2/n/${t.i},${t.j}` : `ot1/f/${t.i},${t.j}`;
  const bb = `(${t.s.toFixed(4)},${t.w.toFixed(4)},${t.n.toFixed(4)},${t.e.toFixed(4)})`;
  const q = complete
    ? `[out:json][timeout:20];(nwr["man_made"~"${TOUT_MAN_MADE}"]${bb};${REQUETE_STATUES(bb)});out center qt;`
    : `[out:json][timeout:25];(nwr["man_made"="communications_tower"]${bb};nwr["tower:type"="communication"]${bb};nwr["man_made"="mast"]["height"~"^([3-9][0-9]|[0-9]{3,})"]${bb};nwr["man_made"="tower"]["height"~"^([4-9][0-9]|[0-9]{3,})"]${bb};nwr["man_made"~"^(mast|tower)$"]["operator"~"TDF"]${bb};);out center qt;`;
  return { cle, q };
}

/**
 * @param {{
 *   cache: ReturnType<typeof import('./cache-donnees.js').creerCacheDonnees>,
 *   overpass: ReturnType<typeof import('./overpass.js').creerOverpass>,
 * }} deps
 */
export function creerSourceOsm({ cache, overpass }) {
  /** Requêtes en cours par clé (pas de doublon). @type {Map<string, Promise<import('./cache-donnees.js').ResultatDonnees>>} */
  const enVol = new Map();
  /** @param {TuileOsm} t @param {boolean} complete */
  function tuile(t, complete) {
    const { cle, q } = requeteTuileOsm(t, complete), deja = enVol.get(cle);
    if (deja) return deja;
    const p = cache.obtenir('ot', cle, { ttlMs: MEMOIRE_TUILES_OSM_MS, elaguer: [complete ? 'ot2/' : 'ot1/', 160], charger: () => overpass.interroger(q, complete ? DELAI_PROCHE_MS : DELAI_LOINTAIN_MS, lireTuileOsm) })
      .finally(() => { enVol.delete(cle); });
    enVol.set(cle, p);
    return p;
  }
  return {
    tuile,
    /**
     * Objets OSM autour de la position : tuiles proches complètes jusqu'à F km, tuiles lointaines télécom jusqu'à R km. `quandTuile(objets)` est
     * appelée après chaque tuile pour afficher au fur et à mesure.
     * @param {{lat: number, lon: number}} pos @param {number} F @param {number} R @param {(objets: ObjetOsm[]) => void} [quandTuile]
     * @returns {Promise<{objets: ObjetOsm[], tuiles: number, echecs: number, secours: number, enMemoire: number, reseau: number, erreur: unknown}>}
     */
    async charger(pos, F, R, quandTuile) {
      const proches = tuilesOsm(pos, GRILLE_PROCHE, 0, F), lointaines = R > F ? tuilesOsm(pos, GRILLE_LOINTAINE, F, R) : [];
      /** @type {Map<string, ObjetOsm>} */
      const els = new Map();
      let echecs = 0, secours = 0, enMemoire = 0, reseau = 0;
      /** @type {unknown} */
      let erreur = null;
      const taches = /** @type {[TuileOsm, boolean][]} */ (proches.map((t) => [t, true])).concat(lointaines.map((t) => /** @type {[TuileOsm, boolean]} */ ([t, false])));
      for (const [t, complete] of taches) {
        try {
          const r = await tuile(t, complete);
          for (const e of (r.donnees || [])) els.set(e.type + '/' + e.id, e);
          if (r.source === 'secours') secours++; else if (r.source === 'cache') enMemoire++; else reseau++;
          if (r.erreur) erreur = r.erreur;
        } catch (e) { echecs++; erreur = e; }
        if (quandTuile && els.size) quandTuile([...els.values()]);
        if (echecs >= 1 && !els.size) break; // tous les miroirs ont échoué sur la 1re tuile : Overpass est injoignable, inutile d'insister
      }
      return { objets: [...els.values()], tuiles: taches.length, echecs, secours, enMemoire, reseau, erreur };
    },
  };
}
