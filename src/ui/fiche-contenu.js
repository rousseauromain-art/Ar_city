// @ts-check
/* eslint-disable complexity -- fonctions de la v1 déplacées telles quelles (demande du 07/11 : « déplacer, pas réécrire ») ; leur découpage viendra après la parité */
/**
 * Contenu des fiches au toucher, en HTML : fonctions de la v1 DÉPLACÉES telles quelles (villes-horizon.html : showGroupSheet, linksHtml, monumentBlock, monDiag,
 * showMonumentDetail, telecomBlock, mobileBlock, showMobileSheet, showTelecomSheet, l. 4153-4284 ; userBlock et showUserSheet, l. 4025-4041), mêmes rubriques, mêmes textes, mêmes règles.
 * Seuls changements : les variables globales de la v1 (S, terrain, constantes) arrivent dans `ctx` ; le résultat est rendu ({titre, html}) au lieu d'être écrit dans le DOM ;
 * les noms des champs de la v2 (`rang` pour `_rk`, `origine` pour `src` du relief) sont lus en plus de ceux de la v1. Ajout de la v2 : la fiche d'un lieu (et d'un repère haut), même panneau.
 * Pur : aucun DOM, aucune horloge (l'instant vient de `ctx.maintenantMs`). L'interface met le HTML dans le panneau plein écran (ui/fiches.js).
 */
import { MON_DEF_H, MON_STAR_LINKS } from '../donnees/monuments-wikidata.js';
import { categorieNavire } from '../donnees/trafic.js';
import { NOMS_NETS_MAX, PROCHES_TOUJOURS_NETS } from '../calques/monuments.js';
import { EQUIP_AFFICHES_MAX } from '../calques/equipements.js';
import { scoreMonument } from '../scene/liste-affichage.js';

/**
 * @typedef {object} ContexteFiche
 * @property {{relief: boolean, beyond: boolean}} S réglages (masquage par le relief, Tout voir)
 * @property {{h0: number, src?: string, origine?: string} | null} terrain relief calculé
 * @property {number} maintenantMs instant (âge des positions des mobiles)
 * @property {boolean} [dense] ville dense (score des monuments)
 */
/** @typedef {{titre: string, html: string}} Fiche */

// constantes de la v1 (villes-horizon.html l. 1977-1983 ; valeurs identiques à celles des calques de la v2)
const MON_CLOSE_N = PROCHES_TOUJOURS_NETS, MON_CLOSE_KM = 1.5, TOWER_CLEAR = 0.15, MON_MIN_ANG = 0.12, MON_MAX_SHOWN = NOMS_NETS_MAX;
const EQUIP_MAX_SHOWN = EQUIP_AFFICHES_MAX, EQUIP_MAX_KM = 6, EQUIP_MAXD = /** @type {Record<string, number>} */ ({ stade: 8, pont: 8, edifice: 5, gare: 5, scene: 5, eau: 6, parc: 5, place: 4 });

export const MON_TYPE_LBL = /** @type {Record<string, string>} */ ({ tour: 'Tour', dome: 'Édifice à dôme', clocher: 'Église, clocher', arc: 'Arc, porte', colonne: 'Colonne, statue, obélisque', chateau: 'Château, palais, fort', musee: 'Monument, musée', mairie: 'Hôtel de ville, mairie', maison: 'Maison, hôtel particulier',
  stade: 'Stade, salle de sport', gare: 'Gare, station, aéroport, port', eau: 'Cours d\'eau, canal, plan d\'eau', parc: 'Parc, jardin, cimetière', place: 'Place, rue', scene: 'Théâtre, cinéma, bibliothèque', pont: 'Pont, viaduc', edifice: 'Hôpital, université, grand édifice' });
export const dEsc = (/** @type {unknown} */ v) => String(v === null || v === undefined ? '' : v).replace(/[<&"]/g, (c) => /** @type {Record<string, string>} */ ({ '<': '&lt;', '&': '&amp;', '"': '&quot;' })[c]);
const dKm = (/** @type {number} */ d) => (d < 10 ? d.toFixed(1) : String(Math.round(d)));
/** Âge d'une position (v1 : `dcAgo`). @param {number} t @param {number} maintenant */
const dcAgo = (t, maintenant) => { const m = Math.round((maintenant - t) / 60000); return m < 90 ? `${Math.max(1, m)} min` : m < 2880 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} j`; };
const shipStyle = categorieNavire;

/**
 * FICHE À LISTE DÉPLIABLE, commune à tout ce qui peut être regroupé sous une icône ou une étiquette (pylônes télécom, équipements urbains, monuments regroupés derrière une icône) :
 * tous les éléments, du plus proche au plus lointain, le plus proche déplié. Un seul élément : fiche simple. (v1 : `showGroupSheet`)
 * @param {{items: any[], keepOrder?: boolean, title1: string, titleN: (n: number) => string, single: (x: any) => string, head: (l: any[]) => string, color: string, summary: (x: any) => string, block: (x: any) => string}} o
 * @returns {Fiche}
 */
export function showGroupSheet(o) {
  const items = o.keepOrder ? o.items.slice() : o.items.slice().sort((a, b) => (a.dist || 0) - (b.dist || 0)), n = items.length;
  if (n === 1) return { html: o.single(items[0]), titre: o.title1 };
  return { html: `<div class="dbgsec">${o.head(items)}</div>`
      + items.map((x, i) => `<details class="telgrp"${i === 0 ? ' open' : ''}><summary style="cursor:pointer;padding:8px 0;border-bottom:1px solid rgba(243,233,210,.15)"><b style="color:${o.color}">${o.summary(x)}</b></summary>${o.block(x)}</details>`).join(''),
    titre: o.titleN(n) };
}

/** Liens cliquables d'un élément : fiche Wikipédia / Wikidata, OpenStreetMap, site web, exploitant TDF, carte (v1 : `linksHtml`). @param {any} m */
export function linksHtml(m) {
  const A = (/** @type {string} */ u, /** @type {string} */ t) => `<a style="color:#F2C14E" target="_blank" rel="noopener" href="${dEsc(u)}">${dEsc(t)}</a>`, tg = m.tags || {}, out = [];
  const qid = m.qid || (/^Q\d+$/.test(tg.wikidata || '') ? tg.wikidata : null);
  if (m.qid) out.push(A(`https://www.wikidata.org/wiki/Special:GoToLinkedPage/frwiki/${m.qid}`, 'Wikipédia'));
  else if (tg.wikipedia && /^[a-z-]+:/.test(tg.wikipedia)) { const [lg, ...t] = tg.wikipedia.split(':'); out.push(A(`https://${lg}.wikipedia.org/wiki/${encodeURIComponent(t.join(':').replace(/ /g, '_'))}`, 'Wikipédia')); }
  if (qid) out.push(A(`https://www.wikidata.org/wiki/${qid}`, `fiche Wikidata ${qid}`));
  if (m.osm) out.push(A(`https://www.openstreetmap.org/${m.osm}`, 'OpenStreetMap'));
  const web = tg.website || tg['contact:website']; if (web && /^https?:\/\//i.test(web)) out.push(A(web, 'site web'));
  if (m.tdf) out.push(A('https://www.tdf.fr', 'TDF (exploitant)'));
  if (m.lat !== null && m.lat !== undefined) out.push(A(`https://www.openstreetmap.org/?mlat=${m.lat}&mlon=${m.lon}#map=17/${m.lat}/${m.lon}`, 'voir sur la carte'));
  return out.join(' · ');
}

/** @param {any} m @param {boolean} withName @param {ContexteFiche} ctx */
export function monumentBlock(m, withName, ctx) {
  const { S, terrain } = ctx, eq = m.cat === 'equip';
  const vis = m.hidden && S.relief && terrain ? 'masqué par le relief d\'ici' : m.cap ? (eq ? 'équipement moins connu ou plus loin : affiché en transparence (bouton œil, Tout voir)' : 'monument moins célèbre : affiché en transparence (bouton œil, Tout voir)') : m.far ? (eq ? `hors de portée d'affichage (${EQUIP_MAXD[m.type] || EQUIP_MAX_KM} km pour ce type)` : `trop petit pour être vu d'ici (${(m.angH || 0).toFixed(2)}° de haut à l'écran)`) : (eq ? 'affiché (équipement proche)' : `visible d'ici (${(m.angH || 0).toFixed(1)}° de haut à l'écran)`);
  return `${withName ? `<div class="dbgline" style="font-size:18px;color:#F2C14E;font-weight:700">${dEsc(m.name)}</div>` : ''}
    <div class="dbgline">${MON_TYPE_LBL[m.type] || 'Monument'} · à ${dKm(m.dist)} km · ${vis}</div>
    <div class="dbgsec">${m.src === 'osm' || m.src === 'osmh' ? 'Source' : 'Notoriété'}</div>
    <div class="dbgline">${m.src === 'osm' || m.src === 'osmh' ? `${m.anfr ? 'support télécom référencé par l\'ANFR' : m.src === 'osmh' ? 'bâtiment haut repéré dans OpenStreetMap' : 'tour référencée dans OpenStreetMap'}${m.tags && (m.tags.operator || m.tags.owner) ? ' · exploitant <b>' + dEsc(m.tags.operator || m.tags.owner) + '</b>' : ''}${m.loc ? ' · près de ' + dEsc(m.loc) : ''}` : m.links !== null && m.links !== undefined ? `article Wikipédia dans <b>${m.links}</b> langue(s)` : 'inconnue (Wikidata injoignable)'}${m.prot ? ' · <b>monument historique</b> (protégé)' : ''}</div>
    ${m.src === 'osm' && m.unnamed && m.osm ? `<div class="dbgsec">Dernière modification OpenStreetMap</div><div class="dbgline osmcs" data-osm="${dEsc(m.osm)}">chargement…</div>` : ''}
    <div class="dbgsec">Hauteur</div>
    <div class="dbgline">${m.htWd ? Math.round(m.htWd) + ' m (Wikidata)' : m.htOsm ? Math.round(m.htOsm) + ' m (OpenStreetMap)' : eq ? 'sans importance (icône posée au sol)' : `inconnue — ${MON_DEF_H[m.type] || 20} m supposés pour le relief`}</div>
    <div class="dbgsec">Classement</div>
    <div class="dbgline">${dEsc(m.types || '(sans classe)')} → ${dEsc(m.why || '')}</div>
    <div class="dbgsec">En savoir plus</div>
    <div class="dbgline">${linksHtml(m)}</div>
    ${monDiag(m, ctx)}`;
}

/** Toutes les valeurs qui décident net / transparent, pour pouvoir dire pourquoi, sans rien deviner. Repliable, en bas de chaque fiche de monument (v1 : `monDiag`). @param {any} m @param {ContexteFiche} ctx */
export function monDiag(m, ctx) {
  const { S } = ctx, T = ctx.terrain, f = (/** @type {any} */ x, d = 1) => (x === null || x === undefined || !isFinite(x) ? '—' : (+x).toFixed(d)), eq = m.cat === 'equip', rel = S.relief && T;
  const rk = m._rk !== undefined ? m._rk : m.rang, score = scoreMonument(m, !!ctx.dense);
  const tol = 0.18, margin = rel && m.aP !== null && m.aP !== undefined && m.mask !== null && m.mask !== undefined ? m.aP + tol - m.mask : null;
  const reasons = []; if (m.far && !m.cap) reasons.push(eq ? 'hors de portée de ce type d\'équipement' : `trop petit à l'écran : hauteur apparente ${f(m.angH, 2)}° < seuil ${(m.links || 0) >= MON_STAR_LINKS ? 0.05 : MON_MIN_ANG}°` + (m.type === 'maison' && !m.prot ? ' (ou maison peu connue)' : ''));
  if (m.cap) reasons.push(`au-delà du plafond : rang ${rk === null || rk === undefined ? '?' : rk}, plafond ${eq ? EQUIP_MAX_SHOWN : MON_MAX_SHOWN} (classement par notoriété ${f(score, 0)})`);
  if (rel && m.hidden && m.low) reasons.push(`tour qui ne dépasse pas la crête : sommet ${f(m.aP, 2)}° − crête ${f(m.mask, 2)}° = ${f(m.aP - m.mask, 2)}° < ${TOWER_CLEAR}° requis`);
  else if (rel && m.hidden) reasons.push(`masqué par le relief : sommet ${f(m.aP, 2)}° + tolérance ${tol}° < crête ${f(m.mask, 2)}°`);
  const rows = [['verdict', reasons.length ? 'TRANSPARENT — ' + reasons.join(' ; ') : m.near ? `net — garanti : parmi les ${MON_CLOSE_N} monuments les plus proches (≤ ${MON_CLOSE_KM} km)` : 'net'],
    ['distance / cap', `${f(m.dist, 2)} km · ${f(m.brg, 0)}°`], ['notoriété (liens) / score', `${m.links === null || m.links === undefined ? '—' : m.links} / ${f(score, 1)}`],
    ['rang parmi les monuments nets', rk === null || rk === undefined ? '—' : `${rk} (plafond ${eq ? EQUIP_MAX_SHOWN : MON_MAX_SHOWN})`],
    ['hauteur utilisée', `${f(m.ht, 0)} m${m.htWd ? ' (Wikidata)' : m.htOsm ? ' (OSM)' : ' (supposée)'}`], ['hauteur apparente', `${f(m.angH, 2)}°`],
    ['relief', rel && T ? `actif · source ${T.src || T.origine || '?'} · œil à ${f(T.h0, 1)} m` : S.relief ? 'activé mais pas encore calculé' : 'désactivé'],
    ['altitude du sol sous le monument', m.dem === null || m.dem === undefined ? 'inconnue' : `${f(m.dem, 1)} m`], ['angle sol / sommet', `${f(m.aG, 2)}° / ${f(m.aP, 2)}°`],
    ['crête devant (relief)', `${f(m.mask, 2)}°`], ['marge de visibilité', margin === null ? '—' : `${f(margin, 2)}° (positif = visible ; tolérance ${tol}°)`],
    ['calque Tout voir (œil)', S.beyond ? 'oui' : 'non (les transparents sont masqués)']];
  return `<details class="dg" style="margin-top:12px"><summary class="dbgsec" style="cursor:pointer">Diagnostic d'affichage (debug)</summary><div class="dbgline" style="line-height:1.7">${rows.map(([k, v]) => `<b>${dEsc(k)}</b> : ${dEsc(v)}`).join('<br>')}</div></details>`;
}

/** Monument ou équipement : grp = éléments regroupés sous l'étiquette touchée (équipements) ; m._hidObjs = monuments regroupés derrière l'icône (+N) (v1 : `showMonumentDetail`). @param {any} m @param {any[] | null} grp @param {ContexteFiche} ctx */
export function showMonumentDetail(m, grp, ctx) {
  let items = (grp && grp.length > 1 ? grp.map((x) => x._src || x) : [m]);
  if (items.length === 1 && m._hidObjs && m._hidObjs.length) items = [m, ...m._hidObjs];
  const eq = items.every((x) => x.cat === 'equip');
  return showGroupSheet({ items, keepOrder: items.length > 1 && !(grp && grp.length > 1), color: eq ? '#78CDE8' : '#F2C14E',
    title1: eq ? 'Équipement' : 'Monument', titleN: (n) => `${n} ${eq ? 'équipements' : 'monuments'}`,
    single: (x) => monumentBlock(x, true, ctx),
    head: (l) => `${l.length} ${eq ? 'équipements regroupés' : 'monuments regroupés'} · ${dKm(l[0].dist)}–${dKm(l[l.length - 1].dist)} km`,
    summary: (x) => `${dEsc(x.name)}</b> · ${dKm(x.dist)} km<br><span style="opacity:.75">${dEsc(MON_TYPE_LBL[x.type] || 'Monument')}${x.links !== null && x.links !== undefined ? ` · ${x.links} langue(s)` : ''}</span><b>`,
    block: (x) => monumentBlock(x, false, ctx) });
}

/** @param {any} t */
export function telecomBlock(t) {
  const ops = (t.operators || []).map((/** @type {any} */ o) => {
    const sys = o.systems.map((/** @type {any} */ s) => `${s.system} (${s.status}${s.date ? ', ' + s.date.slice(0, 4) : ''})`).join(', ');
    return `<div class="dbgline"><b style="color:#F3E9D2">${o.name}</b><br>${sys}</div>`;
  }).join('');
  return `
    <div class="dbgline" style="font-size:16px;color:#E85A5A;font-weight:700">${t.name}${t.g5 ? ' · 5G' : ''}</div>
    <div class="dbgline">${t.nature || 'nature inconnue'}${t.height_m ? `, ${t.height_m} m` : ''} · a ${t.dist.toFixed(1)} km${t.place && t.place !== t.address ? ' · ' + t.place : ''}</div>
    <div class="dbgsec">Proprietaire du support</div>
    <div class="dbgline">${t.owner || 'inconnu'}</div>
    <div class="dbgsec">Adresse</div>
    <div class="dbgline">${t.address || '—'}${t.cp ? ' · ' + t.cp : ''}</div>
    <div class="dbgsec">Identifiants</div>
    <div class="dbgline">ANFR ${t.anfr || '—'} · support ANFR n°${t.sup_id}</div>
    <div class="dbgsec">En savoir plus</div>
    <div class="dbgline">${linksHtml({ lat: t.lat, lon: t.lon, tdf: /(^|[^a-z])TDF([^a-z]|$)|t[ée]l[ée]diffusion/i.test(t.owner || '') })}</div>
    <div class="dbgsec">Operateurs presents (${(t.operators || []).length})</div>
    ${ops || '<div class="dbgline">aucun</div>'}`;
}

/** Fiche d'un navire ou d'un avion : ce que dit l'AIS / ADS-B, et les liens vers les sites de suivi (v1 : `mobileBlock`). @param {any} x @param {ContexteFiche} ctx */
export function mobileBlock(x, ctx) {
  const A = (/** @type {string} */ u, /** @type {string} */ t) => `<a style="color:#F2C14E" target="_blank" rel="noopener" href="${dEsc(u)}">${dEsc(t)}</a>`, ago = x.t ? dcAgo(x.t, ctx.maintenantMs) : '?';
  const map = x.lat !== null && x.lat !== undefined ? A(`https://www.openstreetmap.org/?mlat=${x.lat}&mlon=${x.lon}#map=15/${x.lat}/${x.lon}`, 'voir sur la carte') : '';
  if (x.kind === 'plane') { const cs = String(x.name || '').trim();
    return `<div class="dbgline">${Math.round(x.alt * 3.281 / 100) * 100} ft (${Math.round(x.alt)} m) · ${Math.round(x.vel * 3.6)} km/h · cap ${Math.round(x.trk)}° · à ${dKm(x.dist)} km</div>
      <div class="dbgline">Code OACI ${dEsc(x.id || '—')} · position d'il y a ${ago}</div>
      <div class="dbgsec">En savoir plus</div><div class="dbgline">${[x.id ? A(`https://globe.adsbexchange.com/?icao=${encodeURIComponent(x.id)}`, 'ADS-B Exchange') : '', cs && cs !== '?' ? A(`https://www.flightradar24.com/${encodeURIComponent(cs)}`, 'Flightradar24') : '', map].filter(Boolean).join(' · ')}</div>`; }
  const st = shipStyle(x.type), kn = x.vel * 1.944, mm = String(x.mmsi || '').replace(/\D/g, '');
  return `<div class="dbgline"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${st.col};margin-right:6px"></span>${dEsc(st.sub)}${x.type ? ` (code AIS ${x.type})` : ''}</div>
    <div class="dbgline">${kn < 0.5 ? 'à l\'arrêt (à quai ou au mouillage)' : `${kn.toFixed(1)} nœuds · cap ${Math.round(x.trk)}°`} · à ${dKm(x.dist)} km · position d'il y a ${ago}</div>
    <div class="dbgline">MMSI ${dEsc(mm || '—')}</div>
    <div class="dbgsec">En savoir plus (photo, dimensions, escales)</div>
    <div class="dbgline">${[mm ? A(`https://www.marinetraffic.com/en/ais/details/ships/mmsi:${mm}`, 'MarineTraffic') : '', mm ? A(`https://www.vesselfinder.com/vessels/details/${mm}`, 'VesselFinder') : '', map].filter(Boolean).join(' · ')}</div>`;
}

/** @param {any} t @param {any[] | null} grp @param {ContexteFiche} ctx */
export function showMobileSheet(t, grp, ctx) {
  const air = t.kind === 'plane';
  return showGroupSheet({ items: grp && grp.length > 1 ? grp : [t], color: air ? '#8FD3FF' : '#7FE3C4',
    title1: air ? 'Avion' : 'Navire', titleN: (n) => `${n} ${air ? 'avions' : 'navires'}`,
    single: (x) => `<div class="dbgline" style="font-size:18px;font-weight:700;color:${air ? '#8FD3FF' : shipStyle(x.type).col}">${dEsc(x.name)}</div>` + mobileBlock(x, ctx),
    head: (l) => `${l.length} ${air ? 'avions' : 'navires'} regroupés à cet endroit · ${dKm(l[0].dist)}–${dKm(l[l.length - 1].dist)} km`,
    summary: (x) => `${dEsc(x.name)}</b> · ${dKm(x.dist)} km · <span style="color:${air ? '#8FD3FF' : shipStyle(x.type).col}">${air ? '' : dEsc(shipStyle(x.type).sub)}</span><b>`,
    block: (x) => mobileBlock(x, ctx) });
}

/** @param {any} t @param {any[] | null} grp */
export function showTelecomSheet(t, grp) {
  const opsTxt = (/** @type {any} */ x) => (x.operators || []).map((/** @type {any} */ o) => o.name).join(', ');
  return showGroupSheet({ items: grp && grp.length > 1 ? grp : [t], color: '#E85A5A',
    title1: 'Support telecom', titleN: (n) => `${n} supports telecom`,
    single: (x) => '<div class="dbgsec">Support telecom</div>' + telecomBlock(x),
    head: (l) => `${l.length} supports regroupes · ${dKm(l[0].dist)}–${dKm(l[l.length - 1].dist)} km`,
    summary: (x) => `${dEsc(x.nature || x.name)}${x.g5 ? ' · 5G' : ''}</b> · ${dKm(x.dist)} km${x.height_m ? ` · ${x.height_m} m` : ''}<br><span style="opacity:.75">${dEsc(x.address || x.place || 'adresse inconnue')}${x.cp ? ' · ' + dEsc(x.cp) : ''}${opsTxt(x) ? ' · ' + dEsc(opsTxt(x)) : ''}</span><b>`,
    block: telecomBlock });
}

/** Point d'une couche perso (KMZ/KML) (v1 : `userBlock`). @param {any} x @param {boolean} withName */
export function userBlock(x, withName) {
  const A = (/** @type {string} */ u, /** @type {string} */ tx) => `<a style="color:#F2C14E" target="_blank" rel="noopener" href="${dEsc(u)}">${dEsc(tx)}</a>`;
  const vals = x.vals || [], cols = x.cols || [], links = x.links || [];
  return `${withName ? `<div class="dbgline" style="font-size:18px;color:${x.col};font-weight:700">${dEsc(x.name || '(sans nom)')}</div>` : ''}
    <div class="dbgline">${dEsc(x.lname)} · à ${dKm(x.dist)} km · ${x.lat.toFixed(5)}, ${x.lon.toFixed(5)}</div>
    ${vals.some(Boolean) ? `<div class="dbgsec">Champs</div><div class="dbgline">${cols.map((/** @type {string} */ k, /** @type {number} */ i) => (vals[i] ? `<b>${dEsc(k)}</b> : ${dEsc(vals[i])}` : '')).filter(Boolean).slice(0, 40).join('<br>')}</div>` : ''}
    ${x.desc ? `<div class="dbgsec">Description</div><div class="dbgline" style="white-space:pre-wrap">${dEsc(x.desc)}</div>` : ''}
    <div class="dbgsec">En savoir plus</div><div class="dbgline">${links.map((/** @type {string} */ u, /** @type {number} */ i) => A(u, links.length > 1 ? 'lien ' + (i + 1) : 'lien du fichier')).concat([linksHtml({ lat: x.lat, lon: x.lon })]).join(' · ')}</div>`;
}

/** @param {any} t @param {any[] | null} grp */
export function showUserSheet(t, grp) {
  return showGroupSheet({ items: grp && grp.length > 1 ? grp : [t], color: t.col,
    title1: t.lname, titleN: (n) => `${n} points · ${t.lname}`,
    single: (x) => userBlock(x, true),
    head: (l) => `${l.length} points regroupés · ${dKm(l[0].dist)}–${dKm(l[l.length - 1].dist)} km`,
    summary: (x) => `${dEsc(x.name || '(sans nom)')}</b> · ${dKm(x.dist)} km<br><span style="opacity:.75">${dEsc(x.lname)}</span><b>`,
    block: (x) => userBlock(x, false) });
}

// ---------- ajouts de la v2 (sans équivalent en v1), même panneau et même présentation ----------
const TYPES_LIEU = /** @type {Record<string, string>} */ ({ city: 'Ville', town: 'Ville', village: 'Village', hamlet: 'Hameau', isolated_dwelling: 'Lieu-dit', lighthouse: 'Phare', island: 'Île', islet: 'Îlot', cape: 'Cap', peak: 'Sommet', rock: 'Rocher', beach: 'Plage', view: 'Point de vue', heritage: 'Patrimoine' });

/** Lien Wikipédia d'un lieu : l'article quand le lieu a un tag wikidata ou wikipedia, sinon une recherche (« Rechercher sur Wikipédia »). @param {any} l */
export function lienWikipediaLieu(l) {
  const A = (/** @type {string} */ u, /** @type {string} */ t) => `<a style="color:#F2C14E" target="_blank" rel="noopener" href="${dEsc(u)}">${dEsc(t)}</a>`;
  if (l.wikipedia && /^[a-z-]+:/.test(l.wikipedia)) { const [lg, ...t] = l.wikipedia.split(':'); return A(`https://${lg}.wikipedia.org/wiki/${encodeURIComponent(t.join(':').replace(/ /g, '_'))}`, 'Wikipédia'); }
  if (l.wikidata && /^Q\d+$/.test(l.wikidata)) return A(`https://www.wikidata.org/wiki/Special:GoToLinkedPage/frwiki/${l.wikidata}`, 'Wikipédia');
  return A(`https://fr.wikipedia.org/w/index.php?search=${encodeURIComponent(l.name || '')}`, 'Rechercher sur Wikipédia');
}

/** Fiche d'un lieu (ville, village, cap, phare…). @param {any} l @param {ContexteFiche} ctx */
export function lieuBlock(l, ctx) {
  const f = (/** @type {any} */ x, d = 1) => (x === null || x === undefined || !isFinite(x) ? '—' : (+x).toFixed(d));
  const vis = l.hidden && ctx.S.relief && ctx.terrain ? 'caché par le relief d\'ici' : l.far ? 'au-delà de la portée habituelle de sa catégorie : affiché en transparence (bouton œil, Tout voir)' : 'visible d\'ici';
  const wd = l.wikidata && /^Q\d+$/.test(l.wikidata) ? ` · <a style="color:#F2C14E" target="_blank" rel="noopener" href="https://www.wikidata.org/wiki/${dEsc(l.wikidata)}">fiche Wikidata ${dEsc(l.wikidata)}</a>` : '';
  return `<div class="dbgline" style="font-size:18px;color:#F2C14E;font-weight:700">${dEsc(l.name)}</div>
    <div class="dbgline">${TYPES_LIEU[l.kind] || 'Lieu'} · à ${dKm(l.dist)} km · ${vis}</div>
    ${l.pop ? `<div class="dbgsec">Population</div><div class="dbgline">${String(l.pop).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} habitants</div>` : ''}
    ${l.ele !== null && l.ele !== undefined && isFinite(l.ele) ? `<div class="dbgsec">Altitude</div><div class="dbgline">${Math.round(l.ele)} m</div>` : ''}
    <div class="dbgsec">En savoir plus</div>
    <div class="dbgline">${lienWikipediaLieu(l)}${wd} · ${linksHtml({ lat: l.lat, lon: l.lon })}</div>
    <details class="dg" style="margin-top:12px"><summary class="dbgsec" style="cursor:pointer">Diagnostic d'affichage (debug)</summary><div class="dbgline" style="line-height:1.7">${
  [['distance / cap', `${f(l.dist, 2)} km · ${f(l.brg, 0)}°`], ['angle sol / sommet', `${f(l.aG, 2)}° / ${f(l.aP, 2)}°`], ['crête devant (relief)', `${f(l.mask, 2)}°`],
    ['relief', ctx.S.relief && ctx.terrain ? `actif · source ${ctx.terrain.src || ctx.terrain.origine || '?'} · œil à ${f(ctx.terrain.h0, 1)} m` : ctx.S.relief ? 'activé mais pas encore calculé' : 'désactivé']].map(([k, v]) => `<b>${dEsc(k)}</b> : ${dEsc(v)}`).join('<br>')}</div></details>`;
}

/** Fiche d'un repère haut (tour, cheminée, château d'eau OSM ; non touchable en v1). @param {any} r */
export function repereBlock(r) {
  return `<div class="dbgline" style="font-size:18px;color:#A98BFF;font-weight:700">${dEsc(r.name)}</div>
    <div class="dbgline">Repère haut (${dEsc(r.kind)}) · à ${dKm(r.dist)} km${r.height_m ? ` · ${Math.round(r.height_m)} m` : ''}</div>
    <div class="dbgsec">Source</div><div class="dbgline">OpenStreetMap${r.named ? '' : ' (sans nom)'}</div>
    <div class="dbgsec">En savoir plus</div><div class="dbgline">${linksHtml({ osm: r.id, lat: r.lat, lon: r.lon })}</div>`;
}

/**
 * Aiguillage selon la nature de l'élément touché (v1 : `TAP_DETAIL`), plus les lieux et les repères hauts de la v2.
 * @param {any} t élément touché @param {any[] | null} grp éléments regroupés sous l'étiquette ou l'icône touchée @param {ContexteFiche} ctx @returns {Fiche}
 */
export function contenuFiche(t, grp, ctx) {
  if (t.kind === 'monument') return showMonumentDetail(t, grp, ctx);
  if (t.kind === 'telecom') return showTelecomSheet(t, grp);
  if (t.kind === 'user') return showUserSheet(t, grp);
  if (t.kind === 'ship' || t.kind === 'plane') return showMobileSheet(t, grp, ctx);
  if (t.ess !== undefined && t.named !== undefined) return showGroupSheet({ items: grp && grp.length > 1 ? grp : [t], title1: 'Repère haut', titleN: (n) => `${n} repères hauts`, color: '#A98BFF', single: repereBlock,
    head: (l) => `${l.length} repères regroupés · ${dKm(l[0].dist)}–${dKm(l[l.length - 1].dist)} km`, summary: (x) => `${dEsc(x.name)}</b> · ${dKm(x.dist)} km<b>`, block: repereBlock });
  return { titre: TYPES_LIEU[t.kind] || 'Lieu', html: lieuBlock(t, ctx) };
}
