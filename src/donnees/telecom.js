// @ts-check
/**
 * Pylônes et supports télécom (ANFR, via la route /telecom du relais). Pur : nature ANFR → icône, pastilles d'opérateurs, 5G, forme d'un site, rayon demandé,
 * décision de recharger. Effet (une seule fonction de chargement) : mémoire par case de 0,05° valable 7 jours, repli sur la mémoire périmée si le réseau échoue.
 * Entrées : position, rayon, relais. Sortie : sites au format de la v1 (`telecomSites`). Reprend `pollTelecom`, `telIcon`, `opsOf`, `has5G` de la v1
 * (mêmes clés de mémoire `tel/<i>,<j>`). Dépend de : noyau/geo.js, donnees/relais-lieux.js (adresse du relais).
 */
import { distanceEtCap } from '../noyau/geo.js';
import { baseRelais } from './relais-lieux.js';

/** @typedef {{name?: string, systems?: {generation?: string, system?: string}[]}} OperateurAnfr */
/**
 * @typedef {object} SiteTelecom
 * @property {string} name @property {string} icon @property {'telecom'} kind @property {string} place @property {number} lat @property {number} lon
 * @property {string | number | undefined} sup_id @property {string | undefined} anfr @property {string | undefined} address @property {string | undefined} cp
 * @property {number | undefined} height_m @property {string | undefined} owner @property {string | undefined} nature @property {number | string | undefined} nature_code
 * @property {OperateurAnfr[] | undefined} operators @property {{k: string, col: string}[]} ops @property {boolean} g5
 */

/** Mémoire d'une réponse ANFR : 7 jours, par case de 0,05° (~5 km). */
const TEL_MEMOIRE_MS = 7 * 86400000;
export const TEL_CASE_DEG = 0.05;
/** Les tours-monuments exigent au moins ce rayon (km) quand le calque Monuments est actif. */
const TEL_MONUMENTS_KM = 12;
/** Recul entre deux essais après un échec : 30 s, ×1,5 à chaque échec, plafonné à 5 min. */
export const RECUL_INITIAL_MS = 30000, RECUL_MAX_MS = 300000;

/** Natures ANFR sans intérêt à l'écran : intérieur de galerie, souterrain, tunnel (8/9/10), portique routier, mobilier urbain (49/55). */
const NATURES_CACHEES = new Set([8, 9, 10, 49, 55]);

/**
 * Icône d'un support d'après sa nature ANFR (code, sinon libellé) ; null = invisible de loin, écarté (v1 : `telIcon`).
 * @param {number | string | undefined} code @param {string} [nature]
 * @returns {'pylone' | 'mat' | 'chateau_eau' | 'toit' | 'antenne' | null}
 */
export function iconeTelecom(code, nature) {
  const c = +/** @type {number} */ (code);
  if (NATURES_CACHEES.has(c)) return null;
  if ([21, 22, 23, 24, 25, 26, 48, 33, 44].includes(c)) return 'pylone';
  if ([42, 11, 12, 43, 52].includes(c)) return 'mat';
  if ([4, 31].includes(c)) return 'chateau_eau';
  if ([38, 17, 39, 34, 19, 20, 45, 46].includes(c)) return 'toit';
  if (!isFinite(c) && nature) { // repli sur le libellé si le code manque
    if (/int[ée]rieur|souterrain|tunnel|mobilier|signalisation/i.test(nature)) return null;
    if (/pyl[ôo]ne|tour/i.test(nature)) return 'pylone';
    if (/m[âa]t|f[ûu]t/i.test(nature)) return 'mat';
    if (/ch[âa]teau d'eau|silo|r[ée]servoir/i.test(nature)) return 'chateau_eau';
    if (/b[âa]timent|immeuble|toit|terrasse|local|monument/i.test(nature)) return 'toit';
  }
  return 'antenne';
}

/** Libellé affiché d'un type de support. */
export const LIBELLE_TELECOM = Object.freeze({ pylone: 'Pylône', mat: 'Mât', chateau_eau: "Château d'eau", toit: 'Toit-terrasse', antenne: 'Antenne' });

/** Opérateurs : initiale sur la couleur de la marque (la couleur seule ne porte jamais le sens). */
const OPERATEURS = /** @type {[RegExp, string, string][]} */ ([[/orange/i, 'O', '#FF7900'], [/sfr/i, 'S', '#E2001A'], [/bouygues/i, 'B', '#1E9BD7'], [/free/i, 'F', '#8C8C8C']]);

/** Pastilles d'opérateurs, dans l'ordre O S B F puis autres (v1 : `opsOf`). @param {OperateurAnfr[] | undefined} operators */
export function operateurs(operators) {
  /** @type {{k: string, col: string}[]} */
  const out = [];
  for (const o of operators || []) {
    const m = OPERATEURS.find(([re]) => re.test(o.name || '')), k = m ? m[1] : '·';
    if (!out.some((x) => x.k === k)) out.push({ k, col: m ? m[2] : '#B0B0B0' });
  }
  return out.sort((a, b) => 'OSBF·'.indexOf(a.k) - 'OSBF·'.indexOf(b.k));
}

/** Au moins un opérateur émet en 5G. @param {OperateurAnfr[] | undefined} operators */
export const a5G = (operators) => (operators || []).some((o) => (o.systems || []).some((s) => /5G/i.test(s.generation || '') || /5G|NR/i.test(s.system || '')));

/**
 * Site au format de la v1, ou null si le support est écarté (intérieur, tunnel, mobilier urbain).
 * @param {Record<string, any>} s ligne de la réponse du relais
 * @returns {SiteTelecom | null}
 */
export function siteTelecom(s) {
  const icon = iconeTelecom(s.nature_code, s.nature);
  if (!icon) return null;
  return { name: LIBELLE_TELECOM[icon], icon, kind: 'telecom', place: s.name || s.address || ('Support ' + s.sup_id), lat: s.lat, lon: s.lon, sup_id: s.sup_id, anfr: s.anfr, address: s.address, cp: s.cp,
    height_m: s.height_m, owner: s.owner, nature: s.nature, nature_code: s.nature_code, operators: s.operators, ops: operateurs(s.operators), g5: a5G(s.operators) };
}

/** Rayon demandé au relais : celui du calque s'il est actif, au moins 12 km si les monuments sont actifs (supports ANFR → tours-monuments). */
export const rayonTelecom = (/** @type {{telecom: boolean, telecomMaxKm: number, monuments: boolean}} */ r) => Math.max(r.telecom ? r.telecomMaxKm : 0, r.monuments ? TEL_MONUMENTS_KM : 0) || r.telecomMaxKm;
/** Le calque, ou les tours-monuments, ont-ils besoin des supports ? */
export const telecomVoulu = (/** @type {{telecom: boolean, monuments: boolean}} */ r) => r.telecom || r.monuments;

/**
 * Faut-il (re)charger ? Non si la zone est déjà couverte (déplacement < 0,3 × rayon, au moins 1 km), non si un échec est trop récent.
 * @param {{pos: {lat: number, lon: number}, couvertEn: {lat: number, lon: number} | null, rayonKm: number, echecT: number | null, reculMs: number, maintenant: number}} e
 */
export function doitChargerTelecom({ pos, couvertEn, rayonKm, echecT, reculMs, maintenant }) {
  if (couvertEn && distanceEtCap(pos, couvertEn).distKm < Math.max(1, rayonKm * 0.3)) return false;
  if (echecT !== null && maintenant - echecT < reculMs) return false;
  return true;
}
/** Recul suivant après un échec. @param {number} reculMs */
export const reculSuivant = (reculMs) => Math.min(Math.round(reculMs * 1.5), RECUL_MAX_MS);

/**
 * @param {{
 *   reseau: {requeter: (url: string, o?: any) => Promise<unknown>},
 *   cache: ReturnType<typeof import('./cache-donnees.js').creerCacheDonnees>,
 *   relais: string | undefined,
 *   maintenant?: () => number,
 * }} deps
 */
export function creerSourceTelecom({ reseau, cache, relais, maintenant = Date.now }) {
  const base = baseRelais(relais);
  const cle = (/** @type {number} */ i, /** @type {number} */ j) => `tel/${i},${j}`;

  /** Dernière réponse proche (9 cases voisines) couvrant le rayon demandé. @param {{lat: number, lon: number}} pos @param {number} rayonKm @param {number} ttlMs */
  async function chercherEnMemoire(pos, rayonKm, ttlMs) {
    const ci = Math.round(pos.lat / TEL_CASE_DEG), cj = Math.round(pos.lon / TEL_CASE_DEG), tol = Math.max(1, rayonKm * 0.3);
    /** @type {{d: number, t: number, j: any} | null} */
    let meilleure = null;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const z = await cache.lire(cle(ci + a, cj + b), ttlMs, false);
      if (!z) continue;
      const e = z.donnees;
      if (!e || !e.pos || !e.j || !(e.rad >= rayonKm)) continue;
      const d = distanceEtCap(pos, e.pos).distKm;
      if (d < tol && (!meilleure || d < meilleure.d)) meilleure = { d, t: z.t, j: e.j };
    }
    return meilleure;
  }

  return {
    disponible: !!base,
    /**
     * Supports autour de `pos`. `source` : 'cache' (mémoire fraîche), 'reseau', 'secours' (mémoire périmée, réseau en échec : l'appelant doit réessayer).
     * Lève une erreur si ni le relais ni la mémoire ne répondent.
     * @param {{pos: {lat: number, lon: number}, rayonKm: number, contourner?: boolean}} e
     * @returns {Promise<{sites: SiteTelecom[], ecartes: number, horsFrance: boolean, source: 'cache' | 'reseau' | 'secours', t: number, rayonEff?: number, communes: number, route?: string, tronque: boolean, cacheRelais: boolean}>}
     */
    async charger({ pos, rayonKm, contourner = false }) {
      /** @type {any} */
      let j;
      /** @type {'cache' | 'reseau' | 'secours'} */
      let source = 'cache';
      let t;
      const frais = contourner ? null : await chercherEnMemoire(pos, rayonKm, TEL_MEMOIRE_MS);
      if (frais) { cache.compter('tel', 'hit'); j = frais.j; t = frais.t; } else {
        try {
          const r = /** @type {{ok: boolean, statut: number, donnees: any}} */ (await reseau.requeter(`${base}/telecom?lat=${pos.lat.toFixed(5)}&lon=${pos.lon.toFixed(5)}&radius_km=${rayonKm}`, { brut: true, delaiMs: 20000 }));
          const rep = r.donnees || {};
          if (!r.ok || rep.anfrOk === false) throw new Error(rep.error || ('HTTP ' + r.statut));
          j = rep;
          cache.compter('tel', 'net');
          source = 'reseau';
          t = maintenant();
          cache.ecrire(cle(Math.round(pos.lat / TEL_CASE_DEG), Math.round(pos.lon / TEL_CASE_DEG)), JSON.stringify({ pos: { lat: pos.lat, lon: pos.lon }, rad: rayonKm, j }), 'application/json')
            .then(() => cache.elaguer('tel/', 30));
        } catch (e) {
          const vieux = await chercherEnMemoire(pos, rayonKm, 365 * 86400000);
          if (!vieux) { cache.compter('tel', 'fail'); throw e; }
          cache.compter('tel', 'stale');
          j = vieux.j; t = vieux.t; source = 'secours';
        }
      }
      if (j.hors_france) return { sites: [], ecartes: 0, horsFrance: true, source, t, communes: 0, tronque: false, cacheRelais: false };
      let ecartes = 0;
      /** @type {SiteTelecom[]} */
      const sites = [];
      for (const s of (j.sites || [])) { const x = siteTelecom(s); if (x) sites.push(x); else ecartes++; }
      return { sites, ecartes, horsFrance: false, source, t, rayonEff: j.radius_eff, communes: (j.communes || []).length, route: j.route, tronque: !!j.truncated, cacheRelais: !!j.cache };
    },
  };
}
