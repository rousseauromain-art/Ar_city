// @ts-check
/**
 * Base Adresse Nationale (géocodage de l'IGN, service gratuit) : cherche une adresse ou une rue d'après le texte lu sur une plaque, à moins de 300 m de la position. Seul le TEXTE lu part vers le service : jamais l'image.
 * Entrées : texte, position, réseau (injecté). Sortie : adresses { type: 'numero' | 'rue', libelle, point, numero, rue, distM }, les plus proches d'abord.
 * Dépend de : noyau/geo.js.
 */
import { distanceEtCap } from '../noyau/geo.js';

/** Service de géocodage de l'IGN. */
export const URL_GEOCODAGE = 'https://data.geopf.fr/geocodage/search/';
/** Rayon (m) autour de la position nettoyée. */
export const RAYON_ADRESSE_M = 300;

/** @typedef {{type: 'numero' | 'rue', libelle: string, point: {lat: number, lon: number}, numero: string, rue: string, distM: number}} Adresse */

/**
 * @param {{reseau: {requeter: (url: string, o?: any) => Promise<unknown>}}} deps
 */
export function creerSourceAdresse({ reseau }) {
  return {
    /**
     * @param {{texte: string, pos: {lat: number, lon: number}, rayonM?: number}} p
     * @returns {Promise<Adresse[]>}
     */
    async chercher({ texte, pos, rayonM = RAYON_ADRESSE_M }) {
      const url = `${URL_GEOCODAGE}?q=${encodeURIComponent(texte)}&lat=${pos.lat.toFixed(6)}&lon=${pos.lon.toFixed(6)}&limit=5`;
      const j = /** @type {{features?: any[]}} */ (await reseau.requeter(url, { delaiMs: 8000 }));
      return (j.features || []).map((f) => {
        const [lon, lat] = (f.geometry && f.geometry.coordinates) || [NaN, NaN], p = f.properties || {};
        return /** @type {Adresse} */ (/** @type {unknown} */ ({ type: p.type === 'housenumber' ? 'numero' : p.type === 'street' ? 'rue' : '', libelle: String(p.label || ''), point: { lat, lon }, numero: String(p.housenumber || ''), rue: String(p.street || p.name || ''), distM: distanceEtCap(pos, { lat, lon }).distKm * 1000 }));
      }).filter((a) => Number.isFinite(a.point.lat) && a.distM <= rayonM && !!a.type).sort((a, b) => a.distM - b.distM);
    },
  };
}
