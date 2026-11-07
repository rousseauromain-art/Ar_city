// @ts-check
/**
 * Catégories de repères (phares, caps, îlots…) : requêtes OpenStreetMap et portées de recherche. Constantes, aucune dépendance.
 * Reprend le tableau `POI` de la v1 : `q` = sélecteurs Overpass ; un élément `[sélecteur, km]` remplace la portée commune (les îles ont la leur).
 */

/** @typedef {{libelle: string, maxKm: number, q: (string | [string, number])[], note?: string}} CategorieRepere */

/** @type {Readonly<Record<string, CategorieRepere>>} */
export const CATEGORIES_REPERES = Object.freeze({
  lighthouse: { libelle: 'Phares, feux et balises', maxKm: 40, q: ['nwr["man_made"="lighthouse"]', 'nwr["seamark:type"~"^light"]'] },
  cape: { libelle: 'Pointes, caps et sommets', maxKm: 30, q: ['nwr["natural"~"^(cape|peak)$"]'] },
  rock: { libelle: 'Rochers, îlots et îles', maxKm: 20, q: ['nwr["natural"~"^(rock|stone|arch)$"]', ['nwr["place"~"^(island|islet)$"]', 60]], note: 'îles ≤ 60 km' },
  view: { libelle: 'Points de vue et curiosités', maxKm: 20, q: ['nwr["tourism"~"^(viewpoint|attraction)$"]'] },
  heritage: { libelle: 'Châteaux, forts, menhirs, moulins', maxKm: 15, q: ['nwr["historic"~"^(castle|fort|ruins|monument|memorial|standing_stone|archaeological_site)$"]', 'nwr["man_made"="windmill"]'] },
  beach: { libelle: 'Plages', maxKm: 12, q: ['nwr["natural"="beach"]'] },
});

/** Établissements humains : les « lieux » (v1 : `SETTLE`). */
export const TYPES_LIEUX = Object.freeze(new Set(['city', 'town', 'village', 'hamlet', 'isolated_dwelling']));
