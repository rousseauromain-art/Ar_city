// @ts-check
/**
 * Cache des octets bruts (tuiles) dans la Cache API du navigateur, sous un nom préfixé `vh2-` (règle 8) : branché sur donnees/reseau.js.
 * Périphérie : dépend de `caches`. Le nom du cache est un paramètre, pour qu'un test rejoue celui de la v1.
 */

/**
 * @param {string} nom nom du cache (`vh2-terrain` en production)
 * @param {{caches?: CacheStorage, maintenant?: () => number, journal?: {avert: (m: string, msg: string, d?: unknown) => unknown}, secours?: string[]}} [deps]
 *   `secours` : noms de caches lus en dernier recours, jamais écrits (la v2 relit les tuiles de relief de la v1, `vh-terrain-v1`).
 * @returns {import('./reseau.js').CacheReseau}
 */
export function creerCacheOctets(nom, { caches: stockage = globalThis.caches, maintenant = Date.now, journal, secours = [] } = {}) {
  /** @param {string} cle */
  const url = (cle) => cle;
  return {
    async lire(cle) {
      if (!stockage) return null;
      try {
        let rep = await (await stockage.open(nom)).match(url(cle));
        for (const autre of secours) {
          if (rep) break;
          if (stockage.has && !(await stockage.has(autre))) continue; // pas de création d'un cache vide dans l'espace de la v1
          rep = await (await stockage.open(autre)).match(url(cle));
        }
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
