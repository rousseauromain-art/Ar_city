// @ts-check
/**
 * Client du Worker de la position par les toits : même résultat que `corrigerPositionParToits`, calculé hors du fil principal ; repli sur le fil principal si le Worker est indisponible.
 * Périphérie : dépend de `Worker`.
 */
import { corrigerPositionParToits } from './position-toits.js';

/** @typedef {Parameters<typeof corrigerPositionParToits>[0]} Entree */

/** @param {string | URL | undefined} urlWorker adresse de workers/position-toits.js @returns {(entree: Entree) => Promise<ReturnType<typeof corrigerPositionParToits>>} */
export function creerPositionToits(urlWorker) {
  /** @type {Worker | null} */
  let worker = null;
  try { if (urlWorker && typeof Worker !== 'undefined') worker = new Worker(urlWorker, { type: 'module' }); } catch { worker = null; }
  if (!worker) return async (entree) => corrigerPositionParToits(entree);
  const w = worker, attente = /** @type {Map<number, {ok: (v: any) => void, ko: (e: Error) => void}>} */ (new Map());
  let compteur = 0;
  w.onmessage = (ev) => { const a = attente.get(ev.data.id); if (!a) return; attente.delete(ev.data.id); if (ev.data.erreur) a.ko(new Error(ev.data.erreur)); else a.ok(ev.data.resultat); };
  w.onerror = (ev) => { for (const a of attente.values()) a.ko(new Error(ev.message || 'erreur du Worker')); attente.clear(); };
  return (entree) => new Promise((ok, ko) => { const id = ++compteur; attente.set(id, { ok, ko }); w.postMessage({ id, entree }); });
}
