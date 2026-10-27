// @ts-check
/**
 * Stockage de la v2 (règle 8 de REFONTE.md) : clés préfixées `vh2:`, caches préfixés `vh2-`, enregistrements versionnés `{v, d}`
 * avec migrations. La v1 garde ses clés (`vh_settings_v2`, `vh-calib`, …) : les deux versions cohabitent sans se gêner.
 * Entrées : un adaptateur de type localStorage (injecté). Sorties : valeurs lues, migrées. Dépendances : journal (injecté).
 */

export const PREFIXE = 'vh2:';
export const PREFIXE_CACHE = 'vh2-';

/** @typedef {{getItem(k: string): string | null, setItem(k: string, v: string): void, removeItem(k: string): void, key(i: number): string | null, readonly length: number}} Adaptateur */

/** Adaptateur en mémoire : tests, navigation privée, stockage refusé. @returns {Adaptateur} */
export function adaptateurMemoire() {
  /** @type {Map<string, string>} */
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? /** @type {string} */ (m.get(k)) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
}

const NOM_VALIDE = /^[a-z0-9][a-z0-9._-]*$/i;

/**
 * @param {{adaptateur: Adaptateur, journal?: {erreur: (m: string, msg: string, d?: unknown) => unknown}}} options
 */
export function creerStockage({ adaptateur, journal }) {
  /** @param {string} nom */
  function cle(nom) {
    if (!NOM_VALIDE.test(nom)) throw new Error(`nom de stockage invalide : « ${nom} » (lettres, chiffres, . _ - seulement)`);
    return PREFIXE + nom;
  }
  /** @param {string} message @param {unknown} donnees */
  const signaler = (message, donnees) => { if (journal) journal.erreur('stockage', message, donnees); };

  return {
    /**
     * Lit et migre une valeur. `migrations[n]` convertit une donnée de version n en version n+1.
     * @template T
     * @param {string} nom
     * @param {{version?: number, migrations?: Record<number, (d: any) => any>, parDefaut?: T}} [options]
     * @returns {T | any}
     */
    lire(nom, { version = 1, migrations = {}, parDefaut = /** @type {any} */ (null) } = {}) {
      const k = cle(nom);
      let brut;
      try { brut = adaptateur.getItem(k); } catch (e) { signaler(`lecture impossible de ${k}`, e); return parDefaut; }
      if (brut === null) return parDefaut;
      /** @type {{v: number, d: any}} */
      let enr;
      try { enr = JSON.parse(brut); } catch (e) { signaler(`${k} illisible, ignoré`, e); return parDefaut; }
      if (!enr || typeof enr.v !== 'number') { signaler(`${k} sans version, ignoré`, brut.slice(0, 80)); return parDefaut; }
      if (enr.v > version) { signaler(`${k} écrit par une version plus récente (v${enr.v} > v${version}), ignoré`, null); return parDefaut; }
      let d = enr.d;
      for (let v = enr.v; v < version; v++) {
        const migrer = migrations[v];
        if (!migrer) { signaler(`${k} : pas de migration de v${v} à v${v + 1}`, null); return parDefaut; }
        try { d = migrer(d); } catch (e) { signaler(`${k} : migration de v${v} échouée`, e); return parDefaut; }
      }
      return d;
    },
    /** @param {string} nom @param {unknown} valeur @param {number} [version] @returns {boolean} */
    ecrire(nom, valeur, version = 1) {
      const k = cle(nom);
      try { adaptateur.setItem(k, JSON.stringify({ v: version, d: valeur })); return true; }
      catch (e) { signaler(`écriture impossible de ${k} (stockage plein ou refusé ?)`, e); return false; }
    },
    /** @param {string} nom */
    supprimer(nom) {
      try { adaptateur.removeItem(cle(nom)); } catch (e) { signaler(`suppression impossible de ${nom}`, e); }
    },
    /** Noms (sans préfixe) de toutes les valeurs de la v2. @returns {string[]} */
    noms() {
      const out = [];
      try { for (let i = 0; i < adaptateur.length; i++) { const k = adaptateur.key(i); if (k && k.startsWith(PREFIXE)) out.push(k.slice(PREFIXE.length)); } }
      catch (e) { signaler('énumération impossible', e); }
      return out.sort();
    },
    /** Nom d'un cache de la v2 pour la Cache API. @param {string} nom */
    nomCache: (nom) => {
      if (!NOM_VALIDE.test(nom)) throw new Error(`nom de cache invalide : « ${nom} »`);
      return PREFIXE_CACHE + nom;
    },
  };
}

/** Adaptateur du navigateur : localStorage, sinon mémoire (navigation privée, stockage refusé). @param {{avert: (m: string, msg: string, d?: unknown) => unknown}} [journal] */
export function adaptateurNavigateur(journal) {
  try {
    const s = globalThis.localStorage;
    const test = PREFIXE + '__test';
    s.setItem(test, '1'); s.removeItem(test);
    return s;
  } catch (e) {
    if (journal) journal.avert('stockage', 'localStorage indisponible : stockage en mémoire seulement', e);
    return adaptateurMemoire();
  }
}
