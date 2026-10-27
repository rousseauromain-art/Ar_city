// @ts-check
/**
 * Débogage sur téléphone : avec `?debug=1`, charge Eruda (console, réseau, stockage) en version figée.
 * Sans réseau ou si le chargement échoue : l'avertissement va au journal, la page continue de fonctionner.
 * Entrées : chaîne de recherche, document, journal. Sortie : promesse du résultat (true si Eruda est lancée).
 */

export const VERSION_ERUDA = '3.4.3';
export const URL_ERUDA = `https://cdn.jsdelivr.net/npm/eruda@${VERSION_ERUDA}/eruda.min.js`;

/** @param {string} recherche */
export const debugDemande = (recherche) => new URLSearchParams(recherche).get('debug') === '1';

/**
 * @param {{recherche?: string, document?: Document, journal?: {info: (m: string, msg: string, d?: unknown) => unknown, avert: (m: string, msg: string, d?: unknown) => unknown}, url?: string, delaiMs?: number}} [options]
 * @returns {Promise<boolean>}
 */
export function chargerEruda({ recherche = '', document: doc = globalThis.document, journal, url = URL_ERUDA, delaiMs = 8000 } = {}) {
  if (!debugDemande(recherche)) return Promise.resolve(false);
  return new Promise((resoudre) => {
    const s = doc.createElement('script');
    const fin = setTimeout(() => { if (journal) journal.avert('debug', `Eruda : délai de ${delaiMs} ms dépassé`); resoudre(false); }, delaiMs);
    s.src = url;
    s.onload = () => {
      clearTimeout(fin);
      try { /** @type {any} */ (globalThis).eruda.init(); if (journal) journal.info('debug', `Eruda ${VERSION_ERUDA} lancée`); resoudre(true); }
      catch (e) { if (journal) journal.avert('debug', 'Eruda chargée mais non lancée', String(e)); resoudre(false); }
    };
    s.onerror = () => { clearTimeout(fin); if (journal) journal.avert('debug', 'Eruda non chargée (pas de réseau ?)'); resoudre(false); };
    doc.head.appendChild(s);
  });
}
