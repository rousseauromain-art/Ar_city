// @ts-check
/**
 * Couches personnelles (KMZ / KML) : le HTML du menu « Calques » et du panneau de gestion. Fonctions pures (données → texte), sans DOM ; tout ce qui vient du fichier passe par `echap`.
 * Reprend `renderUserMenu` et `renderUserPanel` de la v1. Dépend de : donnees/kml.js, donnees/kml-diagnostic.js, rendu/bande.js, ui/html.js.
 */
import { COULEURS_PERSO } from '../donnees/kml.js';
import { afficherDiagnostic } from '../donnees/kml-diagnostic.js';
import { kmCourt } from '../rendu/bande.js';
import { echap } from './html.js';

/** Distances d'affichage proposées (km). */
export const DISTANCES_KM = Object.freeze([2, 5, 10, 20, 50, 100, 200]);
export const EPINGLE = '<svg viewBox="0 0 24 24"><path fill-rule="evenodd" d="M12 22l-5.4-9.6a6.2 6.2 0 1 1 10.8 0zM12 7.2a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2z"/></svg>';
export const ACCEPTE = '.kmz,.kml,application/vnd.google-earth.kmz,application/vnd.google-earth.kml+xml,application/xml,text/xml';

/** @typedef {import('../donnees/kml.js').CouchePerso} Couche */
/** @typedef {import('../donnees/kml.js').ItemPerso} Site */

/** Zone de recherche (seulement s'il y a des couches). @param {Couche[]} couches @param {string} requete */
export const htmlRecherche = (couches, requete) => (couches.length ? `<div class="usrQ"><input type="search" data-usrq placeholder="Rechercher un site (en gras sur la vue)…" value="${echap(requete)}" autocomplete="off"><em id="usrQn"></em></div>` : '');

/** Compteur de sites trouvés. @param {string} requete @param {number} n */
export const texteCompteur = (requete, n) => (requete.trim().length < 2 ? '' : n ? `${n} trouvé(s)` : 'aucun site trouvé');

/** Les 8 premiers sites trouvés. @param {Site[]} trouves @param {string} requete */
export function htmlTrouves(trouves, requete) {
  if (requete.trim().length < 2) return '';
  const ligne = (/** @type {Site} */ it, /** @type {number} */ i) => `<div class="usrHit" data-hit="${i}"><b>${echap(it.name || '(sans nom)')}</b> <span>${it.dist !== null && it.dist !== undefined ? kmCourt(it.dist) + ' km' : ''} · ${echap(it.lname)}</span></div>`;
  return trouves.slice(0, 8).map(ligne).join('') + (trouves.length > 8 ? `<div class="dbgline" style="opacity:.7">… ${trouves.length - 8} de plus, en gras sur la vue</div>` : '');
}

/** Menu « Calques » : une case par couche, la recherche et le bouton du panneau. @param {Couche[]} couches @param {string} requete */
export function htmlMenu(couches, requete) {
  const ligne = (/** @type {Couche} */ L) => `<label class="lyUsr" style="color:${L.color}">${EPINGLE}<span class="lyN" style="color:var(--cream)">${echap(L.name)}<em>${L.pts.length} point(s) · jusqu'à ${L.max} km</em></span><input type="checkbox" data-usr="${L.id}" data-f="on"${L.on ? ' checked' : ''}></label>`;
  return couches.map(ligne).join('') + htmlRecherche(couches, requete) + '<button class="lyBtn" id="lyUserMgr">Couches perso · importer un KMZ</button>';
}

/** Liste déroulante du champ affiché. @param {Couche} L */
function optionsChamps(L) {
  const sel = (/** @type {string} */ v) => (v === L.field ? ' selected' : '');
  return `<option value="">— aucun —</option><option value="@name"${sel('@name')}>Nom</option>${L.hasDesc ? `<option value="@desc"${sel('@desc')}>Description</option>` : ''}${L.cols.map((k, i) => `<option value="${echap(k)}"${sel(k)}>n°${i + 1} · ${echap(k)}</option>`).join('')}`;
}

/** Réglages d'une couche dans le panneau. @param {Couche} L */
export function htmlCouche(L) {
  const pastilles = COULEURS_PERSO.map((col) => `<span class="sw${col === L.color ? ' on' : ''}" style="background:${col}" data-usr="${L.id}" data-f="color" data-v="${col}"></span>`).join('');
  return `<div class="usrRow"><div class="dbgline" style="color:${L.color};font-weight:700">${L.pts.length} point(s)${L.ignored ? ` · ${L.ignored} ligne(s)/polygone(s) ignorés` : ''}${L.shown ? ` · ${L.shown.length} affiché(s) maintenant` : ''}</div>
    <input type="text" value="${echap(L.name)}" data-usr="${L.id}" data-f="name" style="width:100%;margin:6px 0">
    <div>${pastilles}</div>
    <div style="margin-top:8px">Champ affiché (10 premiers caractères) <select data-usr="${L.id}" data-f="field">${optionsChamps(L)}</select></div>
    ${L.cols.length ? '' : '<div class="dbgline" style="color:#F2C14E">Aucun champ mémorisé pour cette couche (fichier sans champs) : supprimez-la puis réimportez le fichier.</div>'}
    <div style="margin-top:8px">Afficher jusqu'à <select data-usr="${L.id}" data-f="max">${DISTANCES_KM.map((d) => `<option value="${d}"${d === L.max ? ' selected' : ''}>${d} km</option>`).join('')}</select>
    <label style="margin-left:10px"><input type="checkbox" data-usr="${L.id}" data-f="on"${L.on ? ' checked' : ''}> visible</label></div>
    <div style="margin-top:6px"><span class="usrBtn" data-usr="${L.id}" data-f="diag">Structure du fichier</span><span class="usrBtn danger" data-usr="${L.id}" data-f="del">Supprimer</span></div></div>`;
}

/** Cadre du diagnostic d'un fichier (structure seule). @param {string} diagnostic @param {boolean} masquer */
export const htmlDiagnostic = (diagnostic, masquer) => (diagnostic ? `<div class="usrDiagBox"><div class="usrDiagBar"><label><input type="checkbox" id="usrMask"${masquer ? ' checked' : ''}> masquer les noms de champs</label><span class="usrBtn" id="usrCopy">Copier</span><span class="usrBtn" id="usrDiagX">Fermer</span></div><pre id="usrDiagPre">${echap(afficherDiagnostic(diagnostic, masquer))}</pre><div class="dbgline" style="opacity:.7">Aucune valeur n'apparaît : seulement la longueur et la forme (9 = chiffre, a = minuscule, A = majuscule).</div></div>` : '');

/** Panneau de gestion complet. @param {{couches: Couche[], msg?: string, diagnostic: string, masquer: boolean, requete: string, trouves: Site[]}} e */
export function htmlPanneau({ couches, msg, diagnostic, masquer, requete, trouves }) {
  return `<div class="dbgline">🔒 <b>Tout reste sur cet appareil.</b> Le fichier est lu dans le navigateur, jamais envoyé : aucune requête réseau n'est faite pour vos points. Ils sont mémorisés ici (« Vider le cache » ne les efface pas) ; seuls les points (Placemark) sont affichés.</div>
    <div style="margin-top:12px"><label class="usrBtn">+ Ajouter un KMZ / KML<input type="file" id="usrFile" accept="${ACCEPTE}" style="display:none"></label></div>
    <div id="usrMsg" class="dbgline" style="min-height:18px">${msg || ''}</div>
    <div style="margin-top:4px"><label class="usrBtn" style="font-size:11px">Diagnostic d'un fichier (structure seule)<input type="file" id="usrDiag" accept="${ACCEPTE}" style="display:none"></label></div>
    ${htmlDiagnostic(diagnostic, masquer)}${htmlRecherche(couches, requete)}<div id="usrHits">${htmlTrouves(trouves, requete)}</div>`
    + (couches.length ? couches.map(htmlCouche).join('') : '<div class="dbgline" style="opacity:.7;margin-top:10px">Aucune couche. Les points (Placemark) d\'un fichier Google Earth, My Maps ou QGIS s\'affichent comme les pylônes : icône, nom, distance ; un toucher ouvre la fiche (description, liens).</div>');
}
