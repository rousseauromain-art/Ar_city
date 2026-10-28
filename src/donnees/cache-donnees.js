// @ts-check
/**
 * Couche de cache générique pour toute donnée réseau qui change peu (lieux, monuments, tours, bâtiments, pylônes) — UNE seule politique :
 *   1. mémoire de l'appareil encore fraîche (ttl) → aucune requête ;
 *   2. sinon requête, enregistrée au retour ;
 *   3. requête en échec → dernière mémoire connue, MÊME périmée (secours), plutôt qu'un calque vide.
 * Entrées : genre (compteurs), clé, options { ttlMs, charger, binaire, secoursMs, elaguer }. Sortie : { donnees, source, t }.
 * Périphérie : Cache API (nom préfixé `vh2-` en production ; le test rejoue celui de la v1). Reprend `dcFetch` de la v1.
 */

/** @typedef {{donnees: any, source: 'cache' | 'reseau' | 'secours', t: number, erreur?: unknown}} ResultatDonnees */
/** @typedef {{hit: number, net: number, stale: number, fail: number}} CompteursDonnees */

const BASE = 'https://vh.cache/';
/** Mémoire de secours : un an (v1 : `DC_STALE`). */
export const SECOURS_PAR_DEFAUT_MS = 365 * 86400000;

/**
 * @param {string} nom nom du cache
 * @param {{caches?: CacheStorage, maintenant?: () => number, journal?: {avert: (m: string, msg: string, d?: unknown) => unknown}}} [deps]
 */
export function creerCacheDonnees(nom, { caches: stockage = globalThis.caches, maintenant = Date.now, journal } = {}) {
  /** @type {Record<string, CompteursDonnees>} */
  const compteurs = {};
  /** @type {Record<string, number>} */
  const ecritures = {};
  let contourneJusqua = 0;
  const compter = (/** @type {string} */ genre, /** @type {keyof CompteursDonnees} */ ev) => { (compteurs[genre] || (compteurs[genre] = { hit: 0, net: 0, stale: 0, fail: 0 }))[ev]++; };

  /** @param {string} cle @param {number} ttlMs @param {boolean} binaire @returns {Promise<{donnees: any, t: number} | null>} */
  async function lire(cle, ttlMs, binaire) {
    try {
      if (!stockage) return null;
      const rep = await (await stockage.open(nom)).match(BASE + cle);
      if (!rep) return null;
      const t = +(rep.headers.get('x-t') || 0);
      if (maintenant() - t > ttlMs) return null;
      const d = binaire ? new Uint8Array(await rep.arrayBuffer()) : await rep.json();
      return d === null || d === undefined ? null : { donnees: d, t };
    } catch (e) { if (journal) journal.avert('cache', `lecture ${cle} impossible`, e); return null; }
  }
  /** @param {string} cle @param {BodyInit} corps @param {string} type */
  async function ecrire(cle, corps, type) {
    try {
      if (!stockage) return false;
      await (await stockage.open(nom)).put(BASE + cle, new Response(corps, { headers: { 'x-t': String(maintenant()), 'content-type': type } }));
      return true;
    } catch (e) { if (journal) journal.avert('cache', `écriture ${cle} impossible (stockage plein ?)`, e); return false; }
  }
  /** Garde les `max` entrées les plus récentes d'un préfixe (les plus anciennes d'abord supprimées). @param {string} prefixe @param {number} max */
  async function elaguer(prefixe, max) {
    try {
      if (!stockage) return;
      const c = await stockage.open(nom), ks = (await c.keys()).filter((k) => k.url.startsWith(BASE + prefixe));
      for (const k of ks.slice(0, Math.max(0, ks.length - max))) await c.delete(k);
    } catch (e) { if (journal) journal.avert('cache', `élagage ${prefixe} impossible`, e); }
  }

  return {
    lire, ecrire, elaguer, compter,
    /** Élague tous les 10 enregistrements d'un genre (v1 : `dcPuts[kind] % 10 === 1`). @param {string} genre @param {string} prefixe @param {number} max */
    async elaguerSiBesoin(genre, prefixe, max) { if ((ecritures[genre] = (ecritures[genre] || 0) + 1) % 10 === 1) await elaguer(prefixe, max); },
    /**
     * @param {string} genre compteur de diagnostic @param {string} cle
     * @param {{ttlMs: number, charger: () => Promise<any>, binaire?: boolean, secoursMs?: number, contourner?: boolean, elaguer?: [string, number]}} o
     * @returns {Promise<ResultatDonnees>}
     */
    async obtenir(genre, cle, o) {
      const binaire = !!o.binaire, contourner = o.contourner === undefined ? maintenant() < contourneJusqua : o.contourner;
      if (!contourner) { const h = await lire(cle, o.ttlMs, binaire); if (h) { compter(genre, 'hit'); return { donnees: h.donnees, source: 'cache', t: h.t }; } }
      try {
        const d = await o.charger();
        compter(genre, 'net');
        const ok = await ecrire(cle, binaire ? d : JSON.stringify(d), binaire ? 'application/octet-stream' : 'application/json');
        if (ok && o.elaguer && (ecritures[genre] = (ecritures[genre] || 0) + 1) % 10 === 1) await elaguer(o.elaguer[0], o.elaguer[1]);
        return { donnees: d, source: 'reseau', t: maintenant() };
      } catch (e) {
        const h = await lire(cle, o.secoursMs ?? SECOURS_PAR_DEFAUT_MS, binaire);
        if (h) { compter(genre, 'stale'); return { donnees: h.donnees, source: 'secours', t: h.t, erreur: e }; }
        compter(genre, 'fail');
        throw e;
      }
    },
    /** Contourne la mémoire fraîche pendant `ms` (bouton « Recharger »). @param {number} ms */
    contournerPendant(ms) { contourneJusqua = maintenant() + ms; },
    compteurs: () => JSON.parse(JSON.stringify(compteurs)),
  };
}
