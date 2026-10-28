// Aides de test : faux CacheStorage en mémoire.
/** Faux CacheStorage minimal. */
export function fauxCaches() {
  /** @type {Map<string, Map<string, Response>>} */
  const noms = new Map();
  return { noms, open: async (/** @type {string} */ n) => {
    /** @type {Map<string, Response>} */
    const m = noms.get(n) ?? new Map();
    noms.set(n, m);
    return { match: async (/** @type {string} */ u) => m.get(u)?.clone(), put: async (/** @type {string} */ u, /** @type {Response} */ r) => { m.set(u, r); },
      keys: async () => [...m.keys()].map((url) => ({ url })), delete: async (/** @type {{url: string}} */ k) => m.delete(k.url) };
  } };
}

