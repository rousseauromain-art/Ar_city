// @ts-check
/**
 * Chargement des tuiles d'altitude (Terrarium) : Mapterhorn, avec reconstitution depuis AWS quand une tuile y est absente.
 * Entrées : coordonnées de tuile, réseau (donnees/reseau.js), décodeur d'image. Sortie : pixels RGBA, ou « manquante ».
 * Aucun accès réseau direct (règle 7) ; le décodage d'image est injecté (donnees/decodage-navigateur.js dans le navigateur).
 * Reprend loadTileData / loadTerrariumMosaic de la v1 sans changer le résultat.
 */

/** @typedef {{z: number, x: number, y: number}} Tuile */
/** @typedef {(octets: Uint8Array, ts: number) => Promise<Uint8ClampedArray>} Decodeur */
/**
 * @typedef {object} TuileChargee
 * @property {Uint8ClampedArray | null} data pixels RGBA (null : pas de donnée ici) @property {boolean} fromCache
 * @property {boolean} [missing] tuile absente de la source @property {boolean} [sea] remplacée par « niveau de la mer » @property {boolean} [alt] reconstituée depuis AWS
 */

/** Tuile Mapterhorn (webp, 512 px). */
export const urlMapterhorn = (/** @type {number} */ z, /** @type {number} */ x, /** @type {number} */ y) => `https://tiles.mapterhorn.com/${z}/${x}/${y}.webp`;
/** Tuile historique AWS/Terrarium (png, 256 px). */
export const urlAws = (/** @type {number} */ z, /** @type {number} */ x, /** @type {number} */ y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;

/** Échecs réseau de suite après lesquels Mapterhorn est jugé injoignable (v1 : `hrErrRun`). */
const ECHECS_AVANT_ABANDON = 4;
/** Délai maximal d'une tuile, en ms. */
const DELAI_TUILE_MS = 15000;

/** Tuile « niveau de la mer » (Terrarium : R=128, V=0, B=0 → 0 m). @param {number} ts */
export function tuileMer(ts) {
  const t = new Uint8ClampedArray(ts * ts * 4);
  for (let i = 0; i < t.length; i += 4) { t[i] = 128; t[i + 3] = 255; }
  return t;
}

/**
 * @param {{
 *   reseau: {obtenir: (url: string, o?: {analyse?: 'octets', delaiMs?: number, tentatives?: number, ttlMs?: number}) => Promise<{donnees: unknown, source: string}>},
 *   decoder: Decodeur,
 * }} deps
 */
export function creerChargeurTuiles({ reseau, decoder }) {
  let echecsDeSuite = 0;
  /** Cache des tuiles « mer » par taille (une seule allocation). @type {Map<number, Uint8ClampedArray>} */
  const mers = new Map();
  const mer = (/** @type {number} */ ts) => { let t = mers.get(ts); if (!t) { t = tuileMer(ts); mers.set(ts, t); } return t; };

  /**
   * Octets d'une tuile ; `missing` si la source répond 403/404 (hors couverture). Toute autre erreur est remontée.
   * @param {string} url
   * @returns {Promise<{octets: Uint8Array, fromCache: boolean} | {missing: true}>}
   */
  async function telecharger(url) {
    try {
      const r = await reseau.obtenir(url, { analyse: 'octets', delaiMs: DELAI_TUILE_MS, tentatives: 1, ttlMs: Infinity });
      return { octets: /** @type {Uint8Array} */ (r.donnees), fromCache: r.source !== 'reseau' };
    } catch (e) {
      const statut = e && typeof e === 'object' && 'statut' in e ? /** @type {{statut: number}} */ (e).statut : 0;
      if (statut === 403 || statut === 404) return { missing: true };
      throw e;
    }
  }

  /** Tuile 512 px reconstituée depuis 4 tuiles Terrarium 256 px du zoom z+1. @param {number} z @param {number} x @param {number} y */
  async function mosaiqueAws(z, x, y) {
    const out = new Uint8ClampedArray(512 * 512 * 4);
    let got = 0, cached = 0;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const r = await telecharger(urlAws(z + 1, 2 * x + dx, 2 * y + dy));
      let quart;
      if ('missing' in r) quart = mer(256); // quart manquant : niveau de la mer
      else { got++; if (r.fromCache) cached++; quart = await decoder(r.octets, 256); }
      for (let row = 0; row < 256; row++) out.set(quart.subarray(row * 1024, row * 1024 + 1024), ((dy * 256 + row) * 512 + dx * 256) * 4);
    }
    return got ? { data: out, fromCache: cached === 4 } : null; // AWS n'a rien non plus : l'appelant conclut « mer » / « pas de donnée »
  }

  return {
    /**
     * @param {Tuile} t @param {'mapterhorn' | 'aws'} source @param {number} ts taille de tuile (px) @param {boolean} garantie
     * @returns {Promise<TuileChargee>}
     */
    async charger({ z, x, y }, source, ts, garantie) {
      const hr = source === 'mapterhorn', url = (hr ? urlMapterhorn : urlAws)(z, x, y);
      /** @type {Awaited<ReturnType<typeof telecharger>> | null} */
      let r = null;
      /** @type {unknown} */
      let err = null;
      if (hr && echecsDeSuite >= ECHECS_AVANT_ABANDON) err = new Error('Mapterhorn injoignable'); // plus de 15 s perdues par tuile : repli de session
      else {
        try { r = await telecharger(url); if ('octets' in r) echecsDeSuite = 0; } catch (e) { err = e; if (hr) echecsDeSuite++; }
      }
      if (r && 'octets' in r) return { data: await decoder(r.octets, ts), fromCache: r.fromCache };
      // Mapterhorn : tuile ABSENTE (hors couverture) → reconstituée depuis AWS avant de conclure « mer » / « pas de donnée ».
      // Panne réseau : on remonte l'erreur ; le repli de session (bandes AWS, bien moins de tuiles) prend le relais.
      if (!err && hr && ts === 512) {
        try { const m = await mosaiqueAws(z, x, y); if (m) return { ...m, alt: true }; } catch (e) { err = e; }
      }
      if (err) throw err;
      // Bande garantie (couverture mondiale) : mer. Bande d'affinage régionale : « pas de donnée ici », la bande suivante prend le relais.
      return garantie ? { data: mer(ts), fromCache: false, missing: true, sea: true } : { data: null, fromCache: false, missing: true, sea: false };
    },
    /** Remet à zéro le compteur d'échecs (nouvelle tentative explicite de l'utilisateur). */
    reinitialiser() { echecsDeSuite = 0; },
  };
}
