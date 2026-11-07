// @ts-check
/**
 * Rapport pour analyse (bouton « Exporter un rapport ») : version, navigateur, réglages, drapeaux, fin du journal, dernière Vue,
 * résultat du calage, temps par étape. Romain le joint à une conversation. Aucune donnée personnelle hors position de la Vue.
 * Entrées : état, journal, description du navigateur. Sortie : objet JSON borné en taille. Dépendances : aucune.
 */

/** @typedef {import('../types').RapportV2} RapportV2 */

export const TAILLE_MAX_OCTETS = 300_000;
const ENTREES_JOURNAL = 200;

/**
 * @param {{etat: {instantane: () => import('./etat.js').EtatApp}, journal: {entrees: (n?: number) => import('../types').EntreeJournal[]}, navigateur?: {agent?: string, langue?: string, ecran?: string}, maintenant?: () => Date}} options
 * @returns {RapportV2}
 */
export function construireRapport({ etat, journal, navigateur = {}, maintenant = () => new Date() }) {
  const e = etat.instantane();
  /** @type {RapportV2} */
  const rapport = {
    format: 'vh2-rapport-1',
    cree: maintenant().toISOString(),
    version: e.version,
    navigateur: { agent: navigateur.agent || '', langue: navigateur.langue || '', ecran: navigateur.ecran || '' },
    reglages: e.reglages,
    drapeaux: e.drapeaux,
    derniereVue: e.derniereVue,
    calage: e.calage,
    chronos: e.chronos,
    journal: journal.entrees(ENTREES_JOURNAL),
  };
  // trop gros : on retire les entrées les plus anciennes du journal, jamais le reste
  while (JSON.stringify(rapport).length > TAILLE_MAX_OCTETS && rapport.journal.length > 10) rapport.journal = rapport.journal.slice(Math.ceil(rapport.journal.length / 4));
  return rapport;
}

/** Nom de fichier du rapport. @param {RapportV2} rapport */
export function nomFichierRapport(rapport) {
  return `villes-horizon-rapport_${rapport.cree.replace(/[:.]/g, '-').slice(0, 19)}.json`;
}
