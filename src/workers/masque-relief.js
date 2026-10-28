// @ts-check
/**
 * Worker du masque du relief : reçoit { bands, c, oeilM } (tuiles TRANSFÉRÉES, sans copie), renvoie { pm, raw } et rend les tuiles.
 * Le calcul est celui de scene/masque.js ; seul l'emplacement d'exécution change, l'affichage reste fluide (règle 9).
 */
import { calculerMasque } from '../scene/masque.js';

self.onmessage = async (/** @type {MessageEvent} */ ev) => {
  const { id, bands, c, oeilM } = ev.data;
  try {
    const pm = await calculerMasque(bands, c, oeilM, async () => {});
    const raw = pm.raw ?? [];
    const tuiles = bands.map((/** @type {import('../scene/relief.js').Bande} */ b) => b.tiles);
    const tampons = new Set([...pm.map((r) => r.buffer), ...raw.map((r) => r.buffer)]);
    for (const t of tuiles.flat()) if (t) tampons.add(t.buffer);
    self.postMessage({ id, pm, raw, tuiles }, { transfer: [...tampons] });
  } catch (e) {
    const rendu = ev.data.bands.map((/** @type {import('../scene/relief.js').Bande} */ b) => b.tiles);
    self.postMessage({ id, erreur: e instanceof Error ? e.message : String(e), tuiles: rendu }, { transfer: [...new Set(rendu.flat().filter(Boolean).map((/** @type {Uint8ClampedArray} */ t) => t.buffer))] });
  }
};
