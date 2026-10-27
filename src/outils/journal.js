// @ts-check
/**
 * Journal de la v2 : tampon circulaire d'événements, lu par la page d'outils et par le rapport.
 * Entrées : niveau, module, message, données facultatives. Sortie : liste d'entrées, abonnements.
 * Dépendances : aucune (l'horloge est injectable). Jamais de catch vide : toute erreur passe par journal.erreur().
 */

/** @typedef {import('../types').EntreeJournal} EntreeJournal */

const LIMITE_DONNEES = 2000; // caractères conservés par entrée : le rapport reste léger

/**
 * Rend une donnée quelconque sûre à stocker : erreurs, cycles et gros objets compris.
 * @param {unknown} valeur
 * @returns {unknown}
 */
export function serialiser(valeur) {
  if (valeur === undefined) return undefined;
  if (valeur instanceof Error) return { nom: valeur.name, message: valeur.message, pile: String(valeur.stack || '').split('\n').slice(0, 4).join('\n') };
  try {
    const texte = JSON.stringify(valeur);
    if (texte === undefined) return String(valeur);
    return texte.length > LIMITE_DONNEES ? texte.slice(0, LIMITE_DONNEES) + '…' : JSON.parse(texte);
  } catch {
    return String(valeur).slice(0, LIMITE_DONNEES); // objet circulaire ou non sérialisable : sa description texte suffit
  }
}

/**
 * @param {{capacite?: number, horloge?: () => number}} [options]
 */
export function creerJournal({ capacite = 500, horloge = Date.now } = {}) {
  /** @type {EntreeJournal[]} */
  let entrees = [];
  /** @type {Set<(e: EntreeJournal) => void>} */
  const abonnes = new Set();

  /**
   * @param {import('../types').NiveauJournal} niveau
   * @param {string} module
   * @param {string} message
   * @param {unknown} [donnees]
   */
  function ajouter(niveau, module, message, donnees) {
    /** @type {EntreeJournal} */
    const entree = { t: horloge(), niveau, module, message: String(message) };
    const d = serialiser(donnees);
    if (d !== undefined) entree.donnees = d;
    entrees.push(entree);
    if (entrees.length > capacite) entrees = entrees.slice(entrees.length - capacite);
    for (const fn of abonnes) {
      try { fn(entree); } catch (e) { /* un abonné défaillant ne doit pas empêcher d'écrire au journal */ entrees.push({ t: horloge(), niveau: 'erreur', module: 'journal', message: 'abonné défaillant : ' + String(e) }); }
    }
    return entree;
  }

  return {
    /** @param {string} module @param {string} message @param {unknown} [donnees] */
    info: (module, message, donnees) => ajouter('info', module, message, donnees),
    /** @param {string} module @param {string} message @param {unknown} [donnees] */
    avert: (module, message, donnees) => ajouter('avert', module, message, donnees),
    /** @param {string} module @param {string} message @param {unknown} [donnees] */
    erreur: (module, message, donnees) => ajouter('erreur', module, message, donnees),
    /** Les `n` dernières entrées (toutes par défaut), de la plus ancienne à la plus récente. */
    entrees: (n = capacite) => entrees.slice(-n),
    vider: () => { entrees = []; },
    /** @param {(e: EntreeJournal) => void} fn @returns {() => void} fonction de désabonnement */
    abonner: (fn) => { abonnes.add(fn); return () => { abonnes.delete(fn); }; },
  };
}

/** Journal partagé de l'application. */
export const journal = creerJournal();
