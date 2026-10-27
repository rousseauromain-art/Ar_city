// Scènes de référence du harnais de caractérisation (REFONTE.md §3 et §9). Une scène = un instantané complet : position, cap, inclinaison,
// champ, taille d'écran, réglages, heure. Le même instantané sera rejoué dans la v1 (aujourd'hui) puis dans la v2 (dumps comparés par calque).
//
// Les photos et les exports de cache sont dans le dépôt PRIVÉ Ar_city-photos (dossier PHOTOS_DIR). Une scène sans son jeu de fichiers est
// signalée « incomplète » par le script, jamais ignorée en silence.
//
// Réglages communs : ceux qui font retrouver les clés de cache de l'export (rayon, hameaux et catégories de repères sont dans la clé
// `pl/<source>/<lat>,<lon>/<rayon>/<hameaux>/<catégories>`), calques télécom et bâtiments hauts activés pour exercer tous les calques.

export const TOUS_REPERES = { lighthouse: true, cape: true, rock: true, view: true, heritage: true, beach: true };
export const REGLAGES_COMMUNS = { relief: true, hamlets: true, telecom: true, buildings: true, poi: TOUS_REPERES, sea: false, air: false, photoVis: false };

/** Paysage (téléphone tenu en travers, comme les photos) et portrait. */
export const ECRANS = { paysage: { width: 915, height: 412 }, portrait: { width: 412, height: 915 } };

/**
 * @typedef {object} Scene
 * @property {string} id
 * @property {string} lieu                 libellé
 * @property {{lat:number, lon:number}} [pos]   position imposée (scène sans photo)
 * @property {string} [photo]              fichier dans PHOTOS_DIR : position, heure, cap et champ lus dans son EXIF (comme « rejouer une photo »)
 * @property {{width:number, height:number}} ecran
 * @property {number} radius               rayon de recherche en km (doit correspondre à un rayon présent dans l'export)
 * @property {number} [capDeg]             cap imposé (scène sans photo)
 * @property {number} [inclinaisonDeg]
 * @property {number} [champDeg]
 * @property {string} heure                ISO : horloge figée de la page
 */

/** @type {Scene[]} */
export const SCENES = [
  { id: 'saint-malo-rempart', lieu: 'Saint-Malo, remparts (photo du 25/10)', photo: 'PXL_20261025_112230293.jpg', ecran: ECRANS.paysage, radius: 30, heure: '2026-10-25T11:22:30Z' },
  { id: 'turin-san-carlo', lieu: 'Turin, piazza San Carlo (photo du 22/10)', photo: 'PXL_20261022_104200724.jpg', ecran: ECRANS.paysage, radius: 30, heure: '2026-10-22T10:42:00Z' },
  { id: 'ibiza-coucher', lieu: 'Ibiza, coucher de soleil (photo du 27/09)', photo: 'PXL_20260927_173517301.jpg', ecran: ECRANS.paysage, radius: 30, heure: '2026-09-27T17:35:17Z' },
  { id: 'morgat-plage', lieu: 'Morgat, plage (photo du 24/08)', photo: 'PXL_20260824_175454144.jpg', ecran: ECRANS.paysage, radius: 180, heure: '2026-08-24T17:54:54Z' },
  { id: 'paris-grenelle-nuit', lieu: 'Paris, Grenelle, tour Eiffel de nuit (27/10)', pos: { lat: 48.8494956, lon: 2.2865298 }, capDeg: 28, inclinaisonDeg: 0, champDeg: 67, ecran: ECRANS.portrait, radius: 180, heure: '2026-10-27T19:30:00Z' },
];

/** Modes d'affichage comparés (bouton œil). */
export const MODES = ['essentiel', 'tout-voir'];
