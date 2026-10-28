// @ts-check
/**
 * Cache des octets bruts (tuiles) dans la Cache API du navigateur, sous un nom préfixé `vh2-` (règle 8) : branché sur donnees/reseau.js.
 * Périphérie : dépend de `caches`. Le nom du cache est un paramètre, pour qu'un test rejoue celui de la v1.
 */

/**
 * @param {string} nom nom du cache (`vh2-terrain` en production)
 * @param {{caches?: CacheStorage, maintenant?: () => number, journal?: {avert: (m: string, msg: string, d?: unknown) => unknown}}} [deps]
 * @returns {import('./reseau.js').CacheReseau}
 */
export function creerCacheOctets(nom, { caches: stockage = globalThis.caches, maintenant = Date.now, journal } = {}) {
  /** @param {string} cle */
  const url = (cle) => cle;
  return {
    async lire(cle) {
      if (!stockage) return null;
      try {
        const rep = await (await stockage.open(nom)).match(url(cle));
        return rep ? { donnees: new Uint8Array(await rep.arrayBuffer()), t: maintenant() } : null;
      } catch (e) { if (journal) journal.avert('cache', `lecture ${nom} impossible`, e); return null; }
    },
    async ecrire(cle, donnees) {
      if (!stockage) return;
      try { await (await stockage.open(nom)).put(url(cle), new Response(/** @type {BodyInit} */ (donnees))); }
      catch (e) { if (journal) journal.avert('cache', `écriture ${nom} impossible (stockage plein ?)`, e); }
    },
  };
}
