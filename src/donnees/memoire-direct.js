// @ts-check
/**
 * Mémoire des calques en direct (avions, bateaux) : la donnée change sans cesse, la mémoire n'évite donc pas la requête, mais au démarrage (ou au retour dans l'appli)
 * on AFFICHE tout de suite la dernière situation connue, si elle est encore plausible (2 min pour un avion, 1 h pour un bateau, souvent à quai), puis la requête la remplace.
 * Cases de 0,1° : on lit la case ET ses 8 voisines (fusion par identifiant, le plus récent), car une position peut tomber pile sur une limite de case. Mêmes clés
 * `live/<genre>/<i>,<j>` que la v1. Entrées : genre, position, mémoire générique (donnees/cache-donnees.js). Sorties : situation restaurée ou null.
 */

/** Taille d'une case (degrés) et durée de validité par genre (ms). */
export const CASE_DIRECT_DEG = 0.1;
export const VALIDITE_DIRECT_MS = Object.freeze({ air: 2 * 60000, sea: 60 * 60000 });

/** @typedef {'air' | 'sea'} GenreDirect */

/** @param {ReturnType<typeof import('./cache-donnees.js').creerCacheDonnees>} cache */
export function creerMemoireDirect(cache) {
  const cle = (/** @type {GenreDirect} */ genre, /** @type {{lat: number, lon: number}} */ pos, /** @type {number} */ a = 0, /** @type {number} */ b = 0) => `live/${genre}/${Math.round(pos.lat / CASE_DIRECT_DEG) + a},${Math.round(pos.lon / CASE_DIRECT_DEG) + b}`;
  return {
    /**
     * Dernière situation connue autour de `pos`. Avions : liste ; bateaux : liste de [identifiant, navire].
     * @param {GenreDirect} genre @param {{lat: number, lon: number}} pos @returns {Promise<{t: number, d: any[]} | null>}
     */
    async restaurer(genre, pos) {
      /** @type {Map<string, any>} */
      const parId = new Map();
      let t = 0;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const z = await cache.lire(cle(genre, pos, a, b), VALIDITE_DIRECT_MS[genre], false);
        if (!z || !Array.isArray(z.donnees)) continue;
        t = Math.max(t, z.t);
        for (const e of z.donnees) {
          const [id, v] = genre === 'sea' ? e : [e.id || e.name, e], o = parId.get(id);
          if (v && (!o || v.t > o.t)) parId.set(id, v);
        }
      }
      if (!parId.size) return null;
      cache.compter(genre, 'hit');
      return { t, d: genre === 'sea' ? [...parId] : [...parId.values()] };
    },
    /** @param {GenreDirect} genre @param {{lat: number, lon: number}} pos @param {unknown} donnees */
    async sauver(genre, pos, donnees) {
      cache.compter(genre, 'net');
      await cache.ecrire(cle(genre, pos), JSON.stringify(donnees), 'application/json');
    },
  };
}
