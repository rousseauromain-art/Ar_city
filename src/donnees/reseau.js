// @ts-check
/**
 * SEUL accès réseau de la v2 (règle 7 de REFONTE.md) : délai maximal, nouvelles tentatives avec attente croissante, requêtes GET
 * identiques en vol fusionnées, cache en lecture/écriture (secours périmé si le réseau échoue), mode hors ligne.
 * Les sources de données ne font jamais `fetch` elles-mêmes : elles passent par obtenir().
 * Entrées : url, options. Sortie : { donnees, source }. Dépendances injectées : fetch, minuteurs, journal, cache.
 */

/**
 * @typedef {object} CacheReseau
 * @property {(cle: string) => Promise<{donnees: unknown, t: number} | null>} lire
 * @property {(cle: string, donnees: unknown) => Promise<void>} ecrire
 */

/**
 * @typedef {object} ResultatReseau
 * @property {unknown} donnees
 * @property {'reseau' | 'cache' | 'cache-perime'} source
 */

/** Erreur réseau : `statut` vaut 0 pour un échec de connexion, une coupure ou un délai dépassé. */
export class ErreurReseau extends Error {
  /** @param {string} message @param {number} statut @param {string} url */
  constructor(message, statut, url) { super(message); this.name = 'ErreurReseau'; this.statut = statut; this.url = url; }
}

const attendreReel = (/** @type {number} */ ms) => new Promise((ok) => setTimeout(ok, ms));

/**
 * @param {{
 *   fetchImpl?: (url: string, init: {signal: AbortSignal, method?: string, body?: string, headers?: Record<string, string>}) => Promise<Response>,
 *   attendre?: (ms: number) => Promise<void>,
 *   minuteur?: {setTimeout: (fn: () => void, ms: number) => any, clearTimeout: (id: any) => void},
 *   maintenant?: () => number,
 *   journal?: {info: (m: string, msg: string, d?: unknown) => unknown, avert: (m: string, msg: string, d?: unknown) => unknown, erreur: (m: string, msg: string, d?: unknown) => unknown},
 *   cache?: CacheReseau | null,
 *   delaiMs?: number, tentatives?: number, attenteBaseMs?: number
 * }} [options]
 */
export function creerReseau({
  fetchImpl = (url, init) => fetch(url, init),
  attendre = attendreReel,
  minuteur = { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (id) => clearTimeout(id) },
  maintenant = Date.now,
  journal,
  cache = null,
  delaiMs = 15000,
  tentatives = 3,
  attenteBaseMs = 500,
} = {}) {
  /** @type {Map<string, Promise<ResultatReseau>>} */
  const enVol = new Map();
  let horsLigne = false;

  /** Une tentative : GET avec délai maximal. @param {string} url @param {'json'|'texte'|'octets'} analyse @param {number} delai */
  async function unEssai(url, analyse, delai) {
    const ctrl = new AbortController();
    let delaiDepasse = false;
    const id = minuteur.setTimeout(() => { delaiDepasse = true; ctrl.abort(); }, delai);
    try {
      const rep = await fetchImpl(url, { signal: ctrl.signal });
      if (!rep.ok) throw new ErreurReseau(`HTTP ${rep.status}`, rep.status, url);
      return analyse === 'json' ? await rep.json() : analyse === 'texte' ? await rep.text() : new Uint8Array(await rep.arrayBuffer());
    } catch (e) {
      if (e instanceof ErreurReseau) throw e;
      throw new ErreurReseau(delaiDepasse ? `délai de ${delai} ms dépassé` : `échec réseau : ${e instanceof Error ? e.message : String(e)}`, 0, url);
    } finally { minuteur.clearTimeout(id); }
  }

  /** Réessayer seulement ce qui peut passer : coupure, délai, 429, 5xx. Jamais un 4xx. @param {ErreurReseau} e */
  const reessayable = (e) => e.statut === 0 || e.statut === 429 || e.statut >= 500;

  /** @param {string} url @param {{cle: string, analyse: 'json'|'texte'|'octets', delaiMs: number, tentatives: number, ttlMs?: number}} o @returns {Promise<ResultatReseau>} */
  async function executer(url, o) {
    if (cache && o.ttlMs !== undefined) {
      const c = await cache.lire(o.cle);
      if (c && maintenant() - c.t < o.ttlMs) return { donnees: c.donnees, source: 'cache' };
    }
    /** @type {ErreurReseau | null} */
    let derniere = null;
    if (!horsLigne) {
      for (let i = 0; i < o.tentatives; i++) {
        try {
          const donnees = await unEssai(url, o.analyse, o.delaiMs);
          if (cache) await cache.ecrire(o.cle, donnees);
          return { donnees, source: 'reseau' };
        } catch (e) {
          derniere = e instanceof ErreurReseau ? e : new ErreurReseau(String(e), 0, url);
          if (journal) journal.avert('reseau', `${url} : ${derniere.message} (essai ${i + 1}/${o.tentatives})`);
          if (!reessayable(derniere) || i === o.tentatives - 1) break;
          await attendre(attenteBaseMs * 2 ** i);
        }
      }
    } else derniere = new ErreurReseau('mode hors ligne', 0, url);
    if (cache) { // secours : la dernière donnée connue, même périmée, plutôt qu'une couche vide
      const c = await cache.lire(o.cle);
      if (c) { if (journal) journal.info('reseau', `${url} : mémoire périmée utilisée en secours`); return { donnees: c.donnees, source: 'cache-perime' }; }
    }
    throw derniere ?? new ErreurReseau("aucune tentative effectuée", 0, url);
  }

  return {
    /**
     * @param {string} url
     * @param {{analyse?: 'json'|'texte'|'octets', cle?: string, delaiMs?: number, tentatives?: number, ttlMs?: number}} [options]
     *   ttlMs : si défini et que le cache a une donnée plus récente, aucune requête n'est faite.
     * @returns {Promise<ResultatReseau>}
     */
    obtenir(url, options = {}) {
      const cle = options.cle ?? url;
      const dejaEnVol = enVol.get(cle);
      if (dejaEnVol) return dejaEnVol; // pas de requête en double
      const p = executer(url, { cle, analyse: options.analyse ?? 'json', delaiMs: options.delaiMs ?? delaiMs, tentatives: options.tentatives ?? tentatives, ttlMs: options.ttlMs })
        .finally(() => { enVol.delete(cle); });
      enVol.set(cle, p);
      return p;
    },
    /**
     * Une requête unique (GET ou POST) : délai maximal, AUCUNE nouvelle tentative, pas de fusion, pas de cache. Pour les appelants qui gèrent
     * eux-mêmes la concurrence (course entre miroirs Overpass, tuiles en parallèle). `signal` externe : annule la requête.
     * @param {string} url
     * @param {{methode?: 'GET'|'POST', corps?: string, entetes?: Record<string, string>, analyse?: 'json'|'texte'|'octets', delaiMs?: number, signal?: AbortSignal}} [options]
     * @returns {Promise<unknown>}
     */
    async requeter(url, options = {}) {
      if (horsLigne) throw new ErreurReseau('mode hors ligne', 0, url);
      const delai = options.delaiMs ?? delaiMs, analyse = options.analyse ?? 'json';
      const ctrl = new AbortController();
      let delaiDepasse = false;
      const id = minuteur.setTimeout(() => { delaiDepasse = true; ctrl.abort(); }, delai);
      const externe = options.signal;
      const relais = () => ctrl.abort();
      if (externe) { if (externe.aborted) ctrl.abort(); else externe.addEventListener('abort', relais, { once: true }); }
      try {
        const rep = await fetchImpl(url, { signal: ctrl.signal, ...(options.methode === 'POST' ? { method: 'POST', body: options.corps, headers: options.entetes } : {}) });
        if (!rep.ok) throw new ErreurReseau(`HTTP ${rep.status}`, rep.status, url);
        return analyse === 'json' ? await rep.json() : analyse === 'texte' ? await rep.text() : new Uint8Array(await rep.arrayBuffer());
      } catch (e) {
        if (e instanceof ErreurReseau) throw e;
        throw new ErreurReseau(delaiDepasse ? `délai de ${delai} ms dépassé` : externe && externe.aborted ? 'requête annulée' : `échec réseau : ${e instanceof Error ? e.message : String(e)}`, 0, url);
      } finally { minuteur.clearTimeout(id); if (externe) externe.removeEventListener('abort', relais); }
    },
    /** @param {boolean} actif */
    definirHorsLigne(actif) { horsLigne = !!actif; },
    estHorsLigne: () => horsLigne,
    /** Nombre de requêtes en cours (diagnostic). */
    enCours: () => enVol.size,
  };
}
