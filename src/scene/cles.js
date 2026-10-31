// @ts-check
/** Clés stables des éléments de la scène (lissages d'une image à l'autre, jointures). Pur. */

/** Clé stable d'un monument (pour le lissage du calage d'une image à l'autre). @param {{name: string, lat: number, lon: number}} m */
export const cleMonument = (m) => `${m.name}|${m.lat}|${m.lon}`;
