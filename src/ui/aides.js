// @ts-check
/**
 * Réglages rangés, repris de la v1 (villes-horizon.html, l. 4287-4318) : sections dépliables, résumé d'une ligne sous chaque titre, aides derrière une pastille « ? ».
 * Générique : toute aide statique (.hint sans id) d'une ligne est repliée et reçoit son « ? » ; les aides à id (états calculés : zone hors ligne, altitude estimée, version…) restent visibles.
 * DOM uniquement ; reçoit le contexte de la page (`c` : réglages `S`, `$`).
 */

import { CATEGORIES_REPERES } from '../donnees/categories-reperes.js';

/** Aides à id repliées quand même (v1 : `HELP_IDS`). */
const HELP_IDS = new Set(['seaHint', 'skyInfo', 'simInfo']);
/** Sections ouvertes, gardées d'une visite à l'autre (v1 : `vh-grp`). */
const CLE_GROUPES = 'vh2-grp';

/** Pastilles « ? » : chaque ligne des Réglages qui a une aide statique la replie et reçoit un bouton qui la déplie. @param {ParentNode} racine */
export function installerPastillesAide(racine) {
  for (const r of racine.querySelectorAll('#sheet .row')) {
    const hs = [...r.querySelectorAll(':scope>.hint')].filter((x) => !x.id || HELP_IDS.has(x.id)); if (!hs.length) continue;
    hs.forEach((x) => x.classList.add('help'));
    const q = document.createElement('button'); q.type = 'button'; q.className = 'qbtn'; q.textContent = '?'; q.setAttribute('aria-label', 'Aide');
    q.onclick = (e) => { e.preventDefault(); e.stopPropagation(); r.classList.toggle('showhelp'); };
    const lab = r.querySelector(':scope>label'); if (lab) lab.append(q); else r.prepend(q); // DANS le libellé : la grille à 2 colonnes reste intacte (le clic sur « ? » n'actionne pas la case : preventDefault)
  }
}

const onOff = (/** @type {any} */ v, /** @type {string} */ t) => (v ? t : null);

/** Résumé d'une ligne sous le titre de chaque section (v1 : `sheetSummaries`), plus la section « Essais » de la v2. @param {any} S @param {(id: string) => any} $ @param {string} version */
export function resumesSections(S, $, version) {
  const set = (/** @type {string} */ k, /** @type {(string | null)[]} */ a) => { const el = document.getElementById('sum_' + k); if (el) el.textContent = a.filter(Boolean).join(' · ') || '—'; };
  set('aff', [S.showDist ? 'distances' : 'sans distances', S.beyond ? 'Tout voir' : 'Essentiel', onOff(S.hamlets, 'hameaux'), onOff(S.ridges !== false, 'crêtes')]);
  set('cal', [onOff(S.air, 'avions'), onOff(S.sea, 'bateaux'), onOff(S.telecom, 'pylônes'), onOff(S.buildings, 'tours')].filter(Boolean).length ? [onOff(S.air, 'avions'), onOff(S.sea, 'bateaux'), onOff(S.telecom, 'pylônes'), onOff(S.buildings, 'tours et immeubles')] : ['aucun']);
  set('cap', [`champ ${S.camFov}°`, onOff(S.gyro !== false, 'gyroscope'), onOff(S.photoVis === true, 'photo'), onOff(S.cross, 'croix de visée')]);
  set('rel', [S.relief ? 'relief actif' : 'relief désactivé', `œil ${S.obsHeight > 0 ? '+' : ''}${S.obsHeight || 0} m`]);
  set('off', [($('zoneInfo').textContent || '').split(/[.·(]/)[0].trim().slice(0, 48)]);
  set('sim', [S.simOn ? 'position simulée active' : 'position simulée : non']);
  set('ess', [onOff(S.oeilGps === true, 'œil GPS'), onOff(S.capteurRelatif === true, 'capteur relatif'), onOff(S.positionToits === true, 'toits'), onOff(S.calageContinu === true, 'recalage continu')].filter(Boolean).length
    ? [onOff(S.oeilGps === true, 'œil GPS'), onOff(S.capteurRelatif === true, 'capteur relatif'), onOff(S.positionToits === true, 'toits'), onOff(S.calageContinu === true, 'recalage continu')] : ['aucun essai actif']);
  set('apr', [(version ? 'version ' + version.slice(0, 14) : ''), 'sources et licences']);
}

/** Installe les aides, les résumés et la mémoire des sections ouvertes. @param {{S: any, $: (id: string) => any}} c @param {string} version */
export function installerAides(c, version) {
  const { S, $ } = c;
  installerCategoriesReperes(/** @type {any} */ (c));
  installerPastillesAide(document);
  /** @type {string[]} */
  let ouverts = []; try { ouverts = JSON.parse(localStorage.getItem(CLE_GROUPES) || '[]'); } catch { /* mémoire indisponible */ }
  for (const d of /** @type {NodeListOf<HTMLDetailsElement>} */ (document.querySelectorAll('#sheet details.grp'))) {
    if (ouverts.includes(d.dataset.grp || '')) d.open = true;
    d.addEventListener('toggle', () => { try { localStorage.setItem(CLE_GROUPES, JSON.stringify([...document.querySelectorAll('#sheet details.grp[open]')].map((x) => /** @type {HTMLElement} */ (x).dataset.grp))); } catch { /* mémoire indisponible */ } });
  }
  const resumes = () => resumesSections(S, $, version);
  $('sheet').addEventListener('change', () => setTimeout(resumes, 0)); $('sheet').addEventListener('input', () => setTimeout(resumes, 0));
  $('btnSet').addEventListener('click', () => { resumes(); setTimeout(resumes, 600); });
  resumes();
}

/** Cases à cocher des catégories de repères (v1 : boucle sur `POI`, l. 4935-4941) : « Phares, feux et balises ≤ 40 km »… ; cocher recharge les lieux. @param {{S: any, $: (id: string) => any, app: any, sauver: () => void}} c */
export function installerCategoriesReperes({ S, $, app, sauver }) {
  for (const k of Object.keys(CATEGORIES_REPERES)) {
    const P = CATEGORIES_REPERES[k], d = document.createElement('div'); d.className = 'row';
    const id = 'poi_' + k;
    d.innerHTML = `<label for="${id}">${P.libelle}<em>&le; ${P.maxKm} km${P.note ? ' · ' + P.note : ''}</em></label><input type="checkbox" id="${id}"${S.poi && S.poi[k] ? ' checked' : ''}>`;
    $('poiList').appendChild(d);
    /** @type {HTMLInputElement} */ (d.querySelector('input')).onchange = (e) => { S.poi = { ...(S.poi || {}), [k]: /** @type {HTMLInputElement} */ (e.target).checked }; app.recharger({ lieux: true }); sauver(); };
  }
}
