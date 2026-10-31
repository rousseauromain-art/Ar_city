// @ts-check
/**
 * Position de l'observateur : quand deux positions sont-elles « le même endroit » ? Un GPS de téléphone renvoie une position légèrement différente à chaque fix (quelques mètres),
 * y compris à l'arrêt ; un chargement qui dure plusieurs secondes ne doit pas être jeté pour si peu. Pur : aucune horloge, aucun réseau.
 * Dépend de : noyau/geo.js, scene/relief.js (PROCHE_KM).
 */
import { distanceEtCap } from '../noyau/geo.js';
import { PROCHE_KM } from '../scene/relief.js';

/** En dessous de ce déplacement (km), un nouveau fix GPS est du bruit : il ne relance rien. */
export const BRUIT_GPS_KM = 0.01;
/** Un résultat chargé pour une position vaut pour toute position plus proche que cela (km) : le seuil de recalcul du relief. */
export const MEME_ENDROIT_KM = PROCHE_KM;

/** @typedef {{lat: number, lon: number}} Point */

/** Les deux positions désignent-elles le même endroit (moins de 300 m) ? @param {Point | null | undefined} a @param {Point | null | undefined} b */
export const memeEndroit = (a, b) => !!a && !!b && distanceEtCap(a, b).distKm < MEME_ENDROIT_KM;

/** Un nouveau fix GPS est-il du simple bruit (moins de 10 m depuis la position courante) ? @param {Point | null | undefined} courante @param {Point} nouvelle */
export const estBruitGps = (courante, nouvelle) => !!courante && distanceEtCap(courante, nouvelle).distKm < BRUIT_GPS_KM;
