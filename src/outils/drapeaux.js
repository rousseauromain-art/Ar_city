// @ts-check
/**
 * Drapeaux de fonctions (règle 10 de REFONTE.md) : l'expérimental est désactivé par défaut.
 * Activation : `?drapeaux=lune,profondeur` dans l'adresse, ou réglage mémorisé (stockage `drapeaux`).
 * Entrées : chaîne de recherche, stockage, journal. Sortie : { nom: booléen } pour tous les drapeaux connus.
 */

/** Drapeaux connus. Ajouter ici toute fonction expérimentale, avec son rôle. */
export const DRAPEAUX_CONNUS = Object.freeze({
  lune: 'calage de nuit sur la lune',
  profondeur: 'IA de profondeur (Depth Anything)',
  ancrage: 'orientation et ancrage (REFONTE.md étape 11)',
});

/**
 * @param {{recherche?: string, stockage?: {lire: (n: string, o?: any) => any, ecrire: (n: string, v: unknown, ver?: number) => boolean}, journal?: {avert: (m: string, msg: string, d?: unknown) => unknown}}} [options]
 * @returns {Record<string, boolean>}
 */
export function lireDrapeaux({ recherche = '', stockage, journal } = {}) {
  /** @type {Record<string, boolean>} */
  const out = {};
  for (const nom of Object.keys(DRAPEAUX_CONNUS)) out[nom] = false;
  /** @param {unknown} liste */
  const activer = (liste) => {
    if (!Array.isArray(liste)) return;
    for (const nom of liste) {
      if (Object.hasOwn(DRAPEAUX_CONNUS, nom)) out[nom] = true;
      else if (journal) journal.avert('drapeaux', `drapeau inconnu ignoré : ${String(nom).slice(0, 40)}`);
    }
  };
  if (stockage) activer(stockage.lire('drapeaux', { parDefaut: [] }));
  const param = new URLSearchParams(recherche).get('drapeaux');
  if (param) activer(param.split(',').map((s) => s.trim()).filter(Boolean));
  return out;
}

/**
 * Mémorise les drapeaux actifs (réglage durable).
 * @param {Record<string, boolean>} drapeaux
 * @param {{ecrire: (n: string, v: unknown, ver?: number) => boolean}} stockage
 */
export function memoriserDrapeaux(drapeaux, stockage) {
  return stockage.ecrire('drapeaux', Object.keys(drapeaux).filter((n) => drapeaux[n]));
}
