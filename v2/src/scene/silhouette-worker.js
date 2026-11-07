// @ts-check
/**
 * Client du Worker de la silhouette des bâtiments : même résultat que `profilBatiments` + `lisserCouches`, calculé hors du fil principal.
 * Périphérie : dépend de `Worker`. Repli sur le fil principal si le Worker est indisponible (fait par l'appelant).
 */

/** @typedef {{profil: import('./silhouette-batiments.js').Profil, ls: Float32Array[]}} ResultatSilhouette */

/** @param {string | URL} urlWorker adresse de workers/silhouette-batiments.js @returns {((batiments: import('./silhouette-batiments.js').Batiment[], opts: import('./silhouette-batiments.js').OptionsProfil, lisser: boolean) => Promise<ResultatSilhouette>) & {arreter: () => void}} */
export function creerSilhouetteWorker(urlWorker) {
  const worker = new Worker(urlWorker, { type: 'module' });
  /** @type {Map<number, {ok: (v: ResultatSilhouette) => void, ko: (e: Error) => void}>} */
  const attente = new Map();
  let compteur = 0;
  worker.onmessage = (ev) => {
    const { id, profil, ls, erreur } = ev.data, a = attente.get(id);
    if (!a) return;
    attente.delete(id);
    if (erreur) a.ko(new Error(erreur)); else a.ok({ profil, ls });
  };
  worker.onerror = (ev) => { for (const a of attente.values()) a.ko(new Error(ev.message || 'erreur du Worker')); attente.clear(); };
  const calcul = (/** @type {any} */ batiments, /** @type {any} */ opts, /** @type {boolean} */ lisser) => new Promise((ok, ko) => { const id = ++compteur; attente.set(id, { ok, ko }); worker.postMessage({ id, batiments, opts, lisser }); });
  return Object.assign(/** @type {any} */ (calcul), { arreter: () => worker.terminate() });
}
