// @ts-check
/**
 * Fiches au toucher : un toucher bref sur un nom (lieu, monument, site de la bande, avion, bateau) ouvre tout de suite sa fiche dans une carte en bas de l'écran ; un toucher dans le vide la ferme.
 * Reçoit le contexte de la page (`c`). Les zones de toucher viennent de la dernière image composée (`ps.dernierBilan.zones`), le choix de la zone de scene/toucher.js, le contenu de ui/fiche-contenu.js.
 */
import { zoneSousLeDoigt, zonesTouchables } from '../scene/toucher.js';
import { contenuFiche } from './fiche-contenu.js';
import { echap } from './html.js';

/** Nombre maximal de noms listés pour un groupe. */
const GROUPE_MAX = 12;

/** @param {import('./contexte.js').Contexte} c */
export function installerFiches(c) {
  const { $, ps, journal } = c;
  const carte = $('fiche'), corps = $('ficheBody');
  const fermer = () => { carte.hidden = true; };
  $('ficheClose').addEventListener('click', fermer);
  /** Ouvre la fiche de ce qui est sous le doigt ; renvoie faux (et ferme la carte) s'il n'y a rien. @param {number} x @param {number} y */
  function ouvrirEn(x, y) {
    const zone = zoneSousLeDoigt(zonesTouchables(ps.dernierBilan ? ps.dernierBilan.zones : null), x, y);
    if (!zone) { fermer(); return false; }
    try {
      const f = contenuFiche(/** @type {any} */ (zone));
      const noms = zone.elements.slice(0, GROUPE_MAX).map((el) => echap(String(/** @type {any} */ (el).name || '?')));
      corps.innerHTML = `<div class="ficheT">${echap(f.titre)}</div><div class="ficheS">${echap(f.sousTitre)}${f.plus ? ` · +${f.plus} autre(s) au même endroit` : ''}</div>`
        + f.lignes.map(([k, v]) => `<div class="ficheL"><span>${echap(k)}</span><b>${echap(v)}</b></div>`).join('')
        + (f.plus ? `<div class="ficheG">${noms.join(' · ')}${zone.elements.length > GROUPE_MAX ? ' …' : ''}</div>` : '')
        + (f.liens.length ? `<div class="ficheLiens">${f.liens.map(([nom, url]) => `<a href="${echap(url)}" target="_blank" rel="noopener">${echap(nom)}</a>`).join('')}</div>` : '');
      carte.hidden = false;
      return true;
    } catch (e) { journal.erreur('fiche', 'ouverture de la fiche', e); return false; }
  }
  return { ouvrirEn, fermer };
}
