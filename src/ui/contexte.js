// @ts-check
/**
 * Types du contexte que la page (ui/page.js) donne à ses modules (ui/*.js) : réglages, application, aides d'affichage et état partagé.
 * Aucun code : ce fichier ne contient que des définitions de types.
 */

/**
 * @typedef {object} EtatPartage
 * @property {null | {img: HTMLImageElement, w: number, h: number, url: string, backup: {headOff: number, pitchOff: number, camFov: number}, photo: import('../entrees/photo.js').ReglagesPhoto}} photoMode photo rejouée ouverte
 * @property {number} W largeur de l'écran (px) @property {number} H hauteur de l'écran (px) @property {number} dpr densité de pixels
 * @property {any} dernierBilan bilan de la dernière image composée @property {null | {t: number, m: ReturnType<typeof import('../entrees/capteurs.js').mesuresFusion>, headOff: number, pitchOff: number}} dernierRetour dernier retour à la boussole
 */

/**
 * @typedef {object} Contexte
 * @property {boolean} direct page en direct (sinon photo rejouée)
 * @property {import('../moteur/reglages.js').Reglages} S @property {ReturnType<typeof import('../app/application.js').creerApplication>} app
 * @property {typeof import('../outils/journal.js').journal} journal @property {ReturnType<typeof import('../outils/stockage.js').creerStockage>} stockage
 * @property {ReturnType<typeof import('../app/carnet.js').creerCarnet>} carnet @property {ReturnType<typeof import('../entrees/capteurs.js').creerFusion>} fusion
 * @property {ReturnType<typeof import('../entrees/direct.js').creerEntreeDirecte> | null} entree @property {HTMLVideoElement | null} video @property {string} relais
 * @property {{placement: Map<any, any>, lignes: Map<any, any>, choixBateaux: {ids: any}, calageMonuments: Map<any, any>, analyseT: number | null}} memoires
 * @property {HTMLCanvasElement} ov @property {{affichage: string, mono: string}} familles @property {EtatPartage} ps
 * @property {() => boolean} simulee @property {any[]} echantillons @property {boolean} reglagesRepris
 * @property {(id: string) => any} $ @property {(id: string) => any} $f
 * @property {(msg: string, ms?: number) => void} note @property {() => boolean} sauver @property {() => void} synchroniser
 * @property {() => {capDeg: number, inclinaisonDeg: number, roulisDeg: number}} pose @property {() => number} vFov
 * @property {() => ({largeurPx: number, hauteurPx: number} | null)} fluxImage @property {() => {largeurPx: number, hauteurPx: number}} ecranPx
 * @property {() => (HTMLImageElement | HTMLVideoElement | null)} imageSource @property {() => void} dessinerImage @property {() => void} redimensionner
 */
export {};
