// @ts-check
/**
 * Worker de la silhouette des bâtiments : reçoit { id, batiments, opts, lisser }, renvoie { id, profil, ls } (tampons transférés, sans copie).
 * Le calcul est celui de scene/silhouette-batiments.js ; seul l'emplacement d'exécution change, l'affichage reste fluide (règle 9).
 */
import { profilBatiments, lisserCouches } from '../scene/silhouette-batiments.js';

self.onmessage = (/** @type {MessageEvent} */ ev) => {
  const { id, batiments, opts, lisser } = ev.data;
  try {
    const profil = profilBatiments(batiments, opts), ls = lisserCouches(profil.la, lisser);
    const tampons = new Set([profil.ang.buffer, profil.dist.buffer, ...profil.la.map((a) => a.buffer), ...profil.ld.map((a) => a.buffer), ...ls.map((a) => a.buffer)]);
    self.postMessage({ id, profil, ls }, { transfer: [...tampons] });
  } catch (e) { self.postMessage({ id, erreur: e instanceof Error ? e.message : String(e) }); }
};
