// @ts-check
/**
 * Worker de la position par les toits : reçoit { id, entree } (voir calage/position-toits.js), renvoie { id, resultat }.
 * 121 positions candidates × la silhouette de tous les bâtiments à moins de 500 m : hors du fil principal (règle 9). Arête `workers → calage` ajoutée à docs/dependances.json (décision d'architecture : le calcul est dans calage/).
 */
import { corrigerPositionParToits } from '../calage/position-toits.js';

self.onmessage = (/** @type {MessageEvent} */ ev) => {
  const { id, entree } = ev.data;
  try { self.postMessage({ id, resultat: corrigerPositionParToits(entree) }); } catch (e) { self.postMessage({ id, erreur: e instanceof Error ? e.message : String(e) }); }
};
