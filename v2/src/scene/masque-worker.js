// @ts-check
/**
 * Client du Worker du masque : même signature que `calculerMasque`, calcul hors du fil principal.
 * Les tuiles sont TRANSFÉRÉES au Worker (zéro copie : copier ~260 Mo prend plusieurs secondes) et rendues avec le résultat. Pendant le calcul,
 * les bandes passées sont inutilisables sur le fil principal (tuiles détachées) : n'appeler qu'avec des bandes que personne d'autre ne lit.
 * Périphérie : dépend de `Worker`.
 */

/** @typedef {import('./masque.js').CalculMasque} CalculMasque */

/**
 * @param {string | URL} urlWorker adresse de workers/masque-relief.js
 * @returns {CalculMasque & {arreter: () => void}}
 */
export function creerMasqueWorker(urlWorker) {
  const worker = new Worker(urlWorker, { type: 'module' });
  /** @type {Map<number, {bands: import('./relief.js').Bande[], ok: (v: any) => void, ko: (e: Error) => void}>} */
  const attente = new Map();
  let compteur = 0;
  worker.onmessage = (ev) => {
    const { id, pm, raw, erreur, tuiles } = ev.data, a = attente.get(id);
    if (!a) return;
    attente.delete(id);
    a.bands.forEach((/** @type {import('./relief.js').Bande} */ b, /** @type {number} */ i) => { b.tiles = tuiles[i]; }); // tuiles rendues, mêmes positions
    if (erreur) a.ko(new Error(erreur)); else { pm.raw = raw; a.ok(pm); }
  };
  worker.onerror = (ev) => { for (const a of attente.values()) a.ko(new Error(ev.message || 'erreur du Worker')); attente.clear(); };
  const calcul = /** @type {CalculMasque & {arreter: () => void}} */ (
    (bands, c, oeilM) => new Promise((ok, ko) => {
      const id = ++compteur;
      attente.set(id, { bands, ok, ko });
      const tampons = new Set(bands.flatMap((b) => b.tiles).filter((t) => t).map((t) => /** @type {Uint8ClampedArray} */ (t).buffer));
      worker.postMessage({ id, bands, c, oeilM }, { transfer: [...tampons] });
    })
  );
  calcul.arreter = () => worker.terminate();
  return calcul;
}
