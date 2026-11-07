// @ts-check
/**
 * UN SEUL état de l'application (règle 3 de REFONTE.md), modifié par des fonctions nommées.
 * Entrées : valeurs initiales. Sorties : instantané sérialisable, abonnements. Dépendances : aucune.
 */

/**
 * @typedef {object} EtatApp
 * @property {string} version
 * @property {Record<string, unknown>} reglages
 * @property {Record<string, boolean>} drapeaux
 * @property {Record<string, unknown> | null} derniereVue  résumé de la dernière Vue (sans l'image)
 * @property {Record<string, unknown> | null} calage       résultat du dernier calage
 * @property {Record<string, number>} chronos              temps par étape, en ms
 */

/** @param {Partial<EtatApp>} [initial] */
export function creerEtat(initial = {}) {
  /** @type {EtatApp} */
  let etat = { version: 'inconnue', reglages: {}, drapeaux: {}, derniereVue: null, calage: null, chronos: {}, ...initial };
  /** @type {Set<(e: EtatApp) => void>} */
  const abonnes = new Set();
  const copie = () => /** @type {EtatApp} */ (structuredClone(etat));
  /** @param {Partial<EtatApp>} morceau */
  function maj(morceau) {
    etat = { ...etat, ...morceau };
    const c = copie();
    for (const fn of abonnes) fn(c);
  }

  return {
    /** Copie de l'état : le modifier n'a aucun effet. */
    instantane: copie,
    /** @param {string} version */
    definirVersion: (version) => maj({ version }),
    /** @param {string} cle @param {unknown} valeur */
    definirReglage: (cle, valeur) => maj({ reglages: { ...etat.reglages, [cle]: valeur } }),
    /** @param {string} nom @param {boolean} actif */
    definirDrapeau: (nom, actif) => maj({ drapeaux: { ...etat.drapeaux, [nom]: !!actif } }),
    /** @param {Record<string, boolean>} drapeaux */
    remplacerDrapeaux: (drapeaux) => maj({ drapeaux: { ...drapeaux } }),
    /** Garde seulement un résumé de la Vue : l'image n'est jamais copiée dans l'état.
     * @param {import('../types').Vue} vue */
    enregistrerVue: (vue) => maj({ derniereVue: { source: vue.source, pos: vue.pos, heure: vue.heure.toISOString(), capDeg: vue.capDeg, inclinaisonDeg: vue.inclinaisonDeg, champDeg: vue.champDeg, tailleImage: vue.image ? [vue.image.width, vue.image.height] : null } }),
    /** @param {Record<string, unknown>} resultat */
    enregistrerCalage: (resultat) => maj({ calage: { ...resultat } }),
    /** @param {string} etape @param {number} ms */
    enregistrerChrono: (etape, ms) => maj({ chronos: { ...etat.chronos, [etape]: ms } }),
    /** @param {(e: EtatApp) => void} fn @returns {() => void} */
    abonner: (fn) => { abonnes.add(fn); return () => { abonnes.delete(fn); }; },
  };
}

/** État partagé de l'application. */
export const etat = creerEtat();
