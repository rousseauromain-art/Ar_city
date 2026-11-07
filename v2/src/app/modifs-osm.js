// @ts-check
/**
 * Dernière modification OpenStreetMap d'un objet (tour sans nom) et nom d'usage déduit de son commentaire (v1 : `osmLastEdit`, `osmHintFrom`, mémoire `vh-oshints`, l. 2270-2289).
 * Lu une fois tous les 30 jours (cache de l'appareil, clé `cs/<id>`, comme la v1) ; le nom appris est gardé sous `vh2:osmHints` et repris par les monuments (`hints`).
 */
import { osmHintFrom } from '../donnees/monuments-osm.js';

const OSM_API = 'https://api.openstreetmap.org/api/0.6/';
const TTL_MS = 30 * 864e5;

/**
 * @param {{reseau: {obtenir: (url: string, o?: any) => Promise<{donnees: any}>}, cache: {obtenir: (genre: string, cle: string, o: any) => Promise<{donnees: any}>}, stockage: {lire: (n: string, d: any) => any, ecrire: (n: string, v: unknown) => void}}} o
 */
export function creerModifsOsm({ reseau, cache, stockage }) {
  /** @type {Record<string, string>} */
  const hints = stockage.lire('osmHints', {}) || {};
  return {
    /** Noms d'usage appris (id OSM → nom). */
    hints: () => hints,
    /**
     * Dernière modification de l'objet `id` (« node/123 ») : commentaire, date, auteur ; `nouveauNom` si un nom d'usage vient d'être appris.
     * @param {string} id @returns {Promise<{comment: string, ts: string, user: string, hint: string, nouveauNom: boolean}>}
     */
    async derniere(id) {
      const r = await cache.obtenir('cs', 'cs/' + id, { ttlMs: TTL_MS, charger: async () => {
        const a = await reseau.obtenir(OSM_API + id + '.json'), e = ((a.donnees && a.donnees.elements) || [])[0]; if (!e) throw new Error('objet introuvable');
        let comment = ''; try { const b = await reseau.obtenir(OSM_API + 'changeset/' + e.changeset + '.json'); const j = b.donnees || {}; comment = (((j.elements && j.elements[0]) || j.changeset || {}).tags || {}).comment || ''; } catch { /* commentaire indisponible */ }
        return { comment, cs: e.changeset, ts: e.timestamp, user: e.user, v: e.version }; } });
      const d = r.donnees || {}, hint = osmHintFrom(d.comment);
      let nouveauNom = false;
      if (hint && hints[id] !== hint) { hints[id] = hint; stockage.ecrire('osmHints', hints); nouveauNom = true; }
      return { comment: d.comment || '', ts: String(d.ts || ''), user: d.user || '', hint, nouveauNom };
    },
  };
}
