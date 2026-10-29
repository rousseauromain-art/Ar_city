// @ts-check
/**
 * Carnet de calage de l'appareil : stockage (`vh2:calib`, `vh2:calib-q`), identifiant et modèle du téléphone, envoi au relais (`POST /calib`, par lots de 100). La logique est dans calage/carnet.js.
 * Entrées : stockage, journal, adresse du relais, réseau unique. L'identifiant `vh-dev` de la v1 est lu (jamais écrit) pour garder une seule série par téléphone côté relais.
 * Les mesures de la v1 (`vh-calib`) ne sont pas reprises : on ne mélange pas deux logiciels.
 */
import { ajouterMesure, LOT_ENVOI } from '../calage/carnet.js';

/** Nom d'identifiant de la v1, lu en lecture seule. */
const CLE_APPAREIL_V1 = 'vh-dev';
/** Délais de la v1 : envoi 8 s après une mesure, 15 s après le démarrage (mesures restées en attente hors ligne). */
export const ENVOI_APRES_MESURE_MS = 8000, ENVOI_AU_DEMARRAGE_MS = 15000, DELAI_ENVOI_MS = 15000;

/**
 * @typedef {import('../calage/carnet.js').Carnet} Carnet
 * @typedef {import('../calage/carnet.js').Mesure} Mesure
 */

/**
 * @param {{
 *   stockage: ReturnType<typeof import('../outils/stockage.js').creerStockage>,
 *   journal: {info: (m: string, msg: string, d?: unknown) => unknown, avert: (m: string, msg: string, d?: unknown) => unknown, erreur: (m: string, msg: string, d?: unknown) => unknown},
 *   relais: string,
 *   reseau: {requeter: (url: string, o?: any) => Promise<unknown>},
 *   lireLocal?: (cle: string) => string | null,
 *   navigateur?: {userAgent?: string, userAgentData?: any},
 *   maintenant?: () => number,
 *   minuteur?: {setTimeout: (f: () => void, ms: number) => any, clearTimeout: (id: any) => void},
 * }} o
 */
export function creerCarnet({ stockage, journal, relais, reseau, lireLocal = (k) => { try { return globalThis.localStorage.getItem(k); } catch { return null; } }, navigateur = globalThis.navigator, maintenant = Date.now, minuteur = { setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (id) => clearTimeout(id) } }) {
  /** Identifiant de l'appareil : celui de la v1 s'il existe (une seule série par téléphone), sinon le nôtre. */
  const appareil = (() => {
    const v1 = lireLocal(CLE_APPAREIL_V1); if (v1) return v1;
    let d = stockage.lire('dev', { parDefaut: '' });
    if (!d) { d = Math.random().toString(36).slice(2, 10) + maintenant().toString(36).slice(-4); stockage.ecrire('dev', d); }
    return String(d);
  })();
  let modele = '';
  (async () => {
    try { if (navigateur && navigateur.userAgentData && navigateur.userAgentData.getHighEntropyValues) { const v = await navigateur.userAgentData.getHighEntropyValues(['model', 'platformVersion']); modele = [v.model, v.platform, v.platformVersion].filter(Boolean).join(' '); } } catch { /* modèle inconnu */ }
    if (!modele) { const m = /\(([^)]+)\)/.exec((navigateur && navigateur.userAgent) || ''); modele = m ? m[1].split(';').map((/** @type {string} */ s) => s.trim()).filter((/** @type {string} */ s) => !/^(Linux|U|wv|K)$/.test(s)).slice(0, 3).join(' ') : ''; }
  })();

  /** @returns {Carnet} */
  const lire = () => ({ mesures: stockage.lire('calib', { parDefaut: [] }) || [], file: stockage.lire('calib-q', { parDefaut: [] }) || [] });
  /** @param {Carnet} c */
  const ecrire = (c) => { stockage.ecrire('calib', c.mesures); stockage.ecrire('calib-q', c.file); };
  /** @type {any} */
  let minuteurEnvoi = 0;

  /** Envoie au relais les 100 plus anciennes mesures en attente ; en cas d'échec elles restent en file (nouvel essai plus tard). */
  async function envoyer() {
    const c = lire(), lot = c.file.slice(0, LOT_ENVOI);
    if (!lot.length || !relais) return;
    try {
      const r = /** @type {any} */ (await reseau.requeter(`${relais}/calib`, { methode: 'POST', entetes: { 'Content-Type': 'text/plain' }, corps: JSON.stringify({ samples: lot }), delaiMs: DELAI_ENVOI_MS, brut: true }));
      if (!r.ok || !r.donnees || !r.donnees.ok) throw new Error((r.donnees && r.donnees.error) || `HTTP ${r.statut}`);
      const envoyes = new Set(lot.map((q) => q.rec)), apres = lire();
      stockage.ecrire('calib-q', apres.file.filter((q) => !envoyes.has(q.rec)));
      journal.info('carnet', `${r.donnees.stored} mesure(s) envoyée(s) au relais`);
    } catch (e) { journal.avert('carnet', `envoi au relais : ${e instanceof Error ? e.message : String(e)} (gardé sur l'appareil, nouvel essai plus tard)`); }
  }

  return {
    appareil, modele: () => modele, relais, lire,
    /** Consigne une mesure (marquée `v: 'v2'`) et programme l'envoi. @param {Mesure} m */
    consigner(m) {
      m.v = 'v2';
      ecrire(ajouterMesure(lire(), m));
      minuteur.clearTimeout(minuteurEnvoi); minuteurEnvoi = minuteur.setTimeout(() => { envoyer(); }, ENVOI_APRES_MESURE_MS);
    },
    envoyer,
    /** Mesures restées en attente (hors ligne) : renvoyées peu après le démarrage. */
    demarrer() { minuteur.setTimeout(() => { envoyer(); }, ENVOI_AU_DEMARRAGE_MS); },
  };
}
