// @ts-check
/**
 * Fiches au toucher, comme la v1 : un toucher bref sur un nom, une icône, une pastille « +N », un avion ou un bateau ouvre sa fiche dans le panneau plein écran (#dbg) ;
 * un groupe donne la liste complète, chaque élément dépliable avec sa fiche entière. Choix de l'élément : fonctions de la v1 (scene/toucher.js, hitBest) ;
 * contenu : fonctions de la v1 (ui/fiche-contenu.js, module pur) ; dernière modification OSM des tours sans nom : `fillOsmEdits` de la v1 (l. 2280).
 * Reçoit le contexte de la page (`c`).
 */
import { hitBest, hitsDeScene } from '../scene/toucher.js';
import { contenuFiche, dEsc } from './fiche-contenu.js';

/** @param {import('./contexte.js').Contexte} c */
export function installerFiches(c) {
  const { $, ps, journal, S, app } = c;
  const panneau = $('dbg'), titre = $('dbgTitle'), corps = $('dbgBody');
  const fermer = () => { panneau.classList.remove('open'); };
  /** Contexte des fonctions de la v1 (globales en v1). */
  const ctx = () => ({ S: { relief: !!S.relief, beyond: !!S.beyond }, terrain: /** @type {any} */ (app.donnees().terrain), maintenantMs: Date.now() });
  /** Ouvre la fiche de ce qui est sous le doigt ; renvoie faux s'il n'y a rien (v1 : `showTelecomDetail`). @param {number} x @param {number} y */
  function ouvrirEn(x, y) {
    const hits = hitsDeScene(ps.dernierBilan ? ps.dernierBilan.zones : null, ps.dernierRoulis || 0);
    const h = hitBest(x, y, [hits], ps.W, ps.H);
    if (!h) return false;
    return afficher(h.t, h.g);
  }
  /** Ouvre la fiche d'un élément connu (résultat d'une recherche, par exemple). @param {string} _type @param {any} element */
  const ouvrirElement = (_type, element) => afficher(element, null);
  /** @param {any} t @param {any[] | null} g */
  function afficher(t, g) {
    try {
      const f = contenuFiche(t, g, ctx());
      corps.innerHTML = f.html; titre.textContent = f.titre;
      panneau.classList.add('open');
      remplirModifsOsm();
      return true;
    } catch (e) { journal.erreur('fiche', 'ouverture de la fiche', e); return false; }
  }
  /** Dernière modification OSM des tours sans nom de la fiche ouverte (8 au plus), nom d'usage déduit du commentaire (v1 : `fillOsmEdits`). */
  async function remplirModifsOsm() {
    for (const el of /** @type {HTMLElement[]} */ ([...corps.querySelectorAll('.osmcs:not([data-done])')].slice(0, 8))) {
      el.dataset.done = '1'; const id = el.dataset.osm || '';
      try {
        const d = await app.osmDerniereModif(id);
        el.innerHTML = (d.comment ? `« ${dEsc(d.comment)} »` : '(pas de commentaire)') + ` · ${dEsc(d.ts.slice(0, 10))}${d.user ? ' · ' + dEsc(d.user) : ''}`
          + (d.hint ? `<br>→ nom d'usage retenu : <b>${dEsc(d.hint)}</b> (déduit du commentaire, à vérifier)` : '');
      } catch (e) { el.textContent = 'indisponible : ' + (e instanceof Error ? e.message : String(e)); }
    }
  }
  return { ouvrirEn, ouvrirElement, fermer };
}
