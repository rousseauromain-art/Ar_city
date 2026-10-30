// @ts-check
/**
 * Mémoire des couches personnelles sur l'appareil (Cache API `vh2-couches-perso`, séparée du cache de données : « Vider le cache » ne les efface pas).
 * La v1 garde son propre cache (`vh-user-v1`) : les deux cohabitent sans se gêner. Rien n'est jamais envoyé sur le réseau.
 * Entrées : couches (créées par donnees/kml.js). Sortie : couches relues. Reprend `userSave`, `userDelete`, `userLoad` de la v1.
 */
import { creerCouche } from './kml.js';

/** @typedef {import('./kml.js').CouchePerso} CouchePerso */

const NOM_CACHE_COUCHES = 'vh2-couches-perso';
const BASE = 'https://vh.user/';

/** @param {{caches?: CacheStorage, journal?: {avert: (m: string, msg: string, d?: unknown) => unknown}}} [deps] */
export function creerMemoireCouches({ caches: stockage = globalThis.caches, journal } = {}) {
  /** @param {string} msg @param {unknown} e */
  const avert = (msg, e) => { if (journal) journal.avert('couches-perso', msg, e); };
  return {
    /** Enregistre (ou remplace) une couche ; faux si le stockage est plein ou absent. @param {CouchePerso} L */
    async enregistrer(L) {
      try {
        if (!stockage) return false;
        const c = await stockage.open(NOM_CACHE_COUCHES);
        await c.put(BASE + L.id, new Response(JSON.stringify({ id: L.id, name: L.name, color: L.color, on: L.on, max: L.max, pts: L.pts, cols: L.cols, field: L.field || '', ignored: L.ignored, added: L.added, diag: L.diag || '' }), { headers: { 'content-type': 'application/json' } }));
        return true;
      } catch (e) { avert(`enregistrement de « ${L.name} » impossible (stockage plein ?)`, e); return false; }
    },
    /** @param {string} id */
    async supprimer(id) {
      try { if (stockage) await (await stockage.open(NOM_CACHE_COUCHES)).delete(BASE + id); } catch (e) { avert('suppression impossible', e); }
    },
    /** Toutes les couches, dans l'ordre d'ajout. @param {string} [requete] */
    async charger(requete = '') {
      /** @type {CouchePerso[]} */
      const out = [];
      try {
        if (!stockage) return out;
        const c = await stockage.open(NOM_CACHE_COUCHES);
        for (const k of await c.keys()) {
          try { const rep = await c.match(k.url), o = rep && await rep.json(); if (o && Array.isArray(o.pts)) out.push(creerCouche(o, requete)); } catch (e) { avert('couche illisible ignorée', e); }
        }
      } catch (e) { avert('lecture des couches impossible', e); }
      return out.sort((a, b) => (a.added || 0) - (b.added || 0));
    },
  };
}
