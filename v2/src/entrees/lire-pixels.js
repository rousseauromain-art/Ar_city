// @ts-check
/**
 * Lecture des pixels de l'image (photo ou caméra) réduite et recadrée comme à l'écran : la SEULE périphérie DOM de la vision (canvas, `getImageData`).
 * Toute l'analyse (soleil, silhouette du ciel, horizon) travaille ensuite sur ces octets, sans DOM, et se teste sous Node.
 * Entrées : élément image ou vidéo, largeur voulue, taille de l'écran. Sortie : `{d, cw, ch}` (RGBA) ou null si l'image est absente ou illisible. Reprend `grabFrameRGB` de la v1.
 */

/** @typedef {{d: Uint8ClampedArray, cw: number, ch: number}} Pixels */

/**
 * @param {HTMLImageElement | HTMLVideoElement | null} source @param {number} largeurPx largeur de l'image réduite (480 pour le soleil, 240 pour la silhouette)
 * @param {{largeurPx: number, hauteurPx: number}} ecran
 * @returns {Pixels | null}
 */
export function lirePixelsRecadres(source, largeurPx, ecran) {
  if (!source) return null;
  const vw = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth, vh = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
  if (!vw || !vh) return null;
  const cw = largeurPx, ch = Math.max(60, Math.round((cw * ecran.hauteurPx) / ecran.largeurPx)), oc = document.createElement('canvas');
  oc.width = cw; oc.height = ch;
  const x = /** @type {CanvasRenderingContext2D} */ (oc.getContext('2d', { willReadFrequently: true })), sc = Math.max(cw / vw, ch / vh), dw = vw * sc, dh = vh * sc;
  x.drawImage(source, (cw - dw) / 2, (ch - dh) / 2, dw, dh); // même recadrage que l'écran
  try { return { d: x.getImageData(0, 0, cw, ch).data, cw, ch }; } catch { return null; } // image d'une autre origine ou contexte non sûr
}
