// @ts-check
/**
 * OpenFreeMap : villes et sommets par tuiles vectorielles pré-calculées (CDN, sans clé), en parallèle d'Overpass (calculé à la volée,
 * fragile). Découpage fixe par zoom, moins fin qu'Overpass sur les petits lieux. Entrées : position, rayon, réseau. Sortie : lieux.
 * Reprend `loadFromOpenFreeMap` de la v1. Dépend de : donnees/mvt.js.
 */
import { decoderTuileMVT, pointsDeFeature, etiquettesDeFeature, localVersLonLat, tuilesDeBoite } from './mvt.js';

/** @typedef {import('./overpass.js').Lieu} Lieu */
/** @typedef {import('./overpass.js').ReseauRequeter} ReseauRequeter */

/** Classes OpenMapTiles retenues, et type correspondant. */
const CLASSES_LIEU = /** @type {Record<string, string>} */ ({ city: 'city', town: 'town', village: 'village', hamlet: 'hamlet', isolated_dwelling: 'isolated_dwelling', island: 'island', islet: 'island' });
/** Mémoire de tuiles décodées (pas de stockage durable : trop volumineux). */
const TUILES_EN_MEMOIRE = 500;

/** Zoom visant ~5 tuiles sur le côté le plus large, la longitude s'étirant avec la latitude. @param {number} rKm @param {number} lat */
export function zoomPourRayon(rKm, lat) {
  const latFactor = Math.max(0.35, Math.cos(((lat || 0) * Math.PI) / 180));
  return Math.max(5, Math.min(13, Math.round(Math.log2((5 * 19980 * latFactor) / rKm))));
}

/**
 * @param {{reseau: ReseauRequeter, journal?: {avert: (m: string, msg: string, d?: unknown) => unknown}}} deps
 */
export function creerOpenFreeMap({ reseau, journal }) {
  /** @type {string | null} */
  let gabarit = null;
  /** @type {Map<string, {t: {x: number, y: number, z: number}, layers: ReturnType<typeof decoderTuileMVT>}>} */
  const memoire = new Map();

  /** Gabarit d'adresse des tuiles (TileJSON). */
  async function gabaritTuiles() {
    if (gabarit) return gabarit;
    const j = /** @type {{tiles?: string[]}} */ (await reseau.requeter('https://tiles.openfreemap.org/planet', { delaiMs: 8000 }));
    if (!j.tiles || !j.tiles[0]) throw new Error('TileJSON sans gabarit de tuiles');
    gabarit = j.tiles[0];
    return gabarit;
  }

  return {
    gabaritTuiles,
    /**
     * @param {{lat: number, lon: number}} p centre @param {number} rKm rayon @param {boolean} hameaux garder hameaux et lieux-dits
     * @returns {Promise<Lieu[]>}
     */
    async charger(p, rKm, hameaux) {
      const tpl = await gabaritTuiles(), z = zoomPourRayon(rKm, p.lat);
      const dLat = rKm / 111, dLon = rKm / (111 * Math.max(0.2, Math.cos((p.lat * Math.PI) / 180)));
      const tiles = tuilesDeBoite({ la1: p.lat - dLat, la2: p.lat + dLat, lo1: p.lon - dLon, lo2: p.lon + dLon }, z);
      if (tiles.length > 150) throw new Error(`trop de tuiles (${tiles.length}) pour ce rayon à ce zoom`);
      const voulues = ['place', 'mountain_peak'];
      const results = await Promise.all(tiles.map(async (t) => {
        const key = `${z}/${t.x}/${t.y}`, deja = memoire.get(key);
        if (deja) return deja;
        const url = tpl.replace('{z}', String(t.z)).replace('{x}', String(t.x)).replace('{y}', String(t.y));
        try {
          const buf = /** @type {Uint8Array} */ (await reseau.requeter(url, { analyse: 'octets', delaiMs: 8000 }));
          const out = { t, layers: decoderTuileMVT(buf, voulues) };
          memoire.set(key, out);
          if (memoire.size > TUILES_EN_MEMOIRE) memoire.delete(/** @type {string} */ (memoire.keys().next().value));
          return out;
        } catch (e) { if (journal) journal.avert('openfreemap', `tuile ${key} indisponible`, e); return null; }
      }));
      const echecs = results.filter((r) => r === null).length;
      const seen = new Set(), got = [];
      for (const res of results) {
        if (!res) continue;
        for (const lname of voulues) {
          const layer = res.layers[lname];
          if (!layer) continue;
          for (const f of layer.features) {
            const pts = pointsDeFeature(f);
            if (!pts.length) continue;
            const tags = etiquettesDeFeature(f, layer), name = tags['name:fr'] || tags.name;
            if (!name) continue;
            const [lx, ly] = pts[0], { lon, lat } = localVersLonLat(res.t.z, res.t.x, res.t.y, lx, ly, layer.extent);
            let kind, ele = null;
            if (lname === 'place') {
              kind = CLASSES_LIEU[tags.class] || null;
              if (!kind) continue;
              if ((kind === 'hamlet' || kind === 'isolated_dwelling') && !hameaux) continue;
            } else { kind = 'peak'; const ev = parseFloat(tags.ele); ele = isFinite(ev) ? ev : null; }
            const key = name + '@' + lat.toFixed(4) + ',' + lon.toFixed(4);
            if (seen.has(key)) continue;
            seen.add(key);
            got.push({ name, lat, lon, kind, pop: +(tags.population || 0), ele });
          }
        }
      }
      if (!got.length && echecs === tiles.length) throw new Error(`${tiles.length} tuile(s), toutes en échec`);
      return got;
    },
  };
}
