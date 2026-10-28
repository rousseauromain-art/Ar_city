// @ts-check
/**
 * Atlas local cumulatif : chaque chargement réussi de lieux s'ajoute au précédent, pour continuer à fonctionner sans réseau.
 * Plafonné à 12 000 lieux (les plus anciens oubliés). Entrées : stockage injecté { lire, ecrire }. Reprend l'atlas de la v1,
 * sous une clé v2 (la v1 garde la sienne : aucune collision).
 */

/** @typedef {import('./overpass.js').Lieu} Lieu */
/** @typedef {{zones: {c: {lat: number, lon: number}, r: number, saved: number, count: number, auto?: boolean}[], items: Record<string, Lieu & {t?: number}>}} Atlas */

export const ATLAS_MAX = 12000;
const ZONES_MAX = 50;

/** Clé d'un lieu dans l'atlas. @param {Lieu} it */
export const cleLieu = (it) => it.name + '@' + it.lat.toFixed(3) + ',' + it.lon.toFixed(3);

/** @param {{lire: (nom: string, defaut?: any) => any, ecrire: (nom: string, v: unknown) => boolean}} stockage */
export function creerAtlas(stockage) {
  /** @returns {Atlas} */
  const vide = () => ({ zones: [], items: {} });
  /** @type {Atlas} */
  let atlas = (() => { const a = stockage.lire('atlas', null); return a && a.items && a.zones ? a : vide(); })();
  return {
    nombre: () => Object.keys(atlas.items).length,
    zones: () => atlas.zones.slice(),
    /** Tous les lieux mémorisés. @returns {Lieu[]} */
    lieux: () => Object.values(atlas.items),
    /**
     * Mémorise un chargement (copies propres, sans les champs de calcul). Renvoie le nombre de lieux NOUVEAUX.
     * @param {Lieu[]} liste @param {{lat: number, lon: number} | null} centre @param {number} rKm @param {number} [maintenant]
     */
    absorber(liste, centre, rKm, maintenant = Date.now()) {
      let ajoutes = 0;
      for (const it of liste) {
        const k = cleLieu(it);
        if (!atlas.items[k]) ajoutes++;
        atlas.items[k] = { name: it.name, lat: it.lat, lon: it.lon, kind: it.kind, pop: it.pop || 0, ele: it.ele ?? null, t: maintenant };
      }
      const cles = Object.keys(atlas.items);
      if (cles.length > ATLAS_MAX) {
        cles.sort((a, b) => (atlas.items[a].t || 0) - (atlas.items[b].t || 0));
        for (const k of cles.slice(0, cles.length - ATLAS_MAX)) delete atlas.items[k];
      }
      if (centre && ajoutes) {
        atlas.zones.push({ c: { lat: centre.lat, lon: centre.lon }, r: rKm, saved: maintenant, count: liste.length, auto: true });
        if (atlas.zones.length > ZONES_MAX) atlas.zones.splice(0, atlas.zones.length - ZONES_MAX);
      }
      if (!stockage.ecrire('atlas', atlas)) { // stockage plein : on libère le quart le plus ancien et on réessaie une fois
        const ks = Object.keys(atlas.items).sort((a, b) => (atlas.items[a].t || 0) - (atlas.items[b].t || 0));
        for (const k of ks.slice(0, Math.ceil(ks.length / 4))) delete atlas.items[k];
        stockage.ecrire('atlas', atlas);
      }
      return ajoutes;
    },
    effacer() { atlas = vide(); stockage.ecrire('atlas', atlas); },
  };
}
