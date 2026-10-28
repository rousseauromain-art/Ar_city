// @ts-check
/**
 * Décodage d'une tuile d'altitude (webp ou png) en pixels RGBA bruts, SANS gestion de couleur ni prémultiplication :
 * la valeur d'un pixel est l'altitude codée (Terrarium). Périphérie : dépend du navigateur (createImageBitmap, canvas).
 */

/** @param {Uint8Array} octets @param {number} ts taille de la tuile (px) @returns {Promise<Uint8ClampedArray>} */
export async function decoderTuile(octets, ts) {
  const blob = new Blob([/** @type {BlobPart} */ (octets)]);
  /** @type {ImageBitmap} */
  let bmp;
  try { bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' }); } // valeurs brutes
  catch { bmp = await createImageBitmap(blob); } // navigateur sans ces options : décodage standard
  const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(ts, ts) : Object.assign(document.createElement('canvas'), { width: ts, height: ts });
  const cx = /** @type {OffscreenCanvasRenderingContext2D} */ (cv.getContext('2d', { willReadFrequently: true }));
  cx.drawImage(bmp, 0, 0, ts, ts);
  bmp.close();
  return cx.getImageData(0, 0, ts, ts).data;
}
