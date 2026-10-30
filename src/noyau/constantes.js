// @ts-check
/**
 * Constantes physiques et seuils du noyau, avec leur origine (règle 4 de REFONTE.md). Aucune dépendance.
 * Les valeurs sont celles de la v1 (2026-10-25 (j)) : toute modification doit être décidée, pas accidentelle.
 */

/** Degrés → radians. v1 : `D`. */
export const RAD = Math.PI / 180;

/** Rayon moyen de la Terre, en km (v1 : `distBrg`). */
export const RAYON_TERRE_KM = 6371;

/** Rayon moyen de la Terre, en m. */
const RAYON_TERRE_M = RAYON_TERRE_KM * 1000;

/** Coefficient de réfraction : le rayon terrestre « effectif » est 1,13 fois le vrai (v1 : `REFF`). */
const COEF_REFRACTION = 1.13;

/** Rayon terrestre effectif en m, pour la courbure et la réfraction (v1 : `REFF`). */
export const RAYON_EFFECTIF_M = RAYON_TERRE_M * COEF_REFRACTION;

/** Hauteur des yeux au-dessus du sol, en m, ajoutée à l'altitude du terrain (v1 : `obsElev+1.6`). */
export const HAUTEUR_YEUX_M = 1.6;

/** Diagonale d'un capteur 24×36 mm, en mm : sert à convertir la focale équivalente en champ de vision. */
export const DIAGONALE_24X36_MM = 43.27;

/** Au-dessous de cette élévation (°), le soleil est considéré comme couché (v1 : `sunAlign`). */
export const SOLEIL_COUCHE_DEG = -1;

// ---- Crêtes intérieures du relief (v1 : bloc « cretes interieures », 22/10/2026) ----
/** Montée minimale du masque (°) entre deux échantillons pour compter comme « en train de monter ». */
export const CRETE_MONTEE_MIN_DEG = 1e-4;
/** Une crête plus proche que ce seuil (km) est ignorée. */
export const CRETE_DIST_MIN_KM = 0.35;
/** Le plan suivant doit être au moins 1,25 fois plus loin que la crête. */
export const CRETE_ECART_PLAN = 1.25;
/** La crête doit se détacher d'au moins ce nombre de degrés de la silhouette finale. */
export const CRETE_ECART_SILHOUETTE_DEG = 0.15;
/** Dénivelé caché derrière la crête (m) : seuil Essentiel (vrai décrochement) et seuil Tout voir. */
export const CRETE_DENIVELE_ESSENTIEL_M = 40;
export const CRETE_DENIVELE_TOUT_M = 15;
