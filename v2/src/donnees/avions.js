// @ts-check
/**
 * Avions : relais (`/planes`, jeton OpenSky géré côté serveur, 4 000 crédits par jour), sinon OpenSky en direct, anonyme (400 par jour). Au premier appel la dernière
 * situation connue est restaurée (donnees/memoire-direct.js) puis remplacée par la réponse. Quota atteint (429) : pause annoncée à l'appelant, qui ne rappelle pas avant.
 * Aucun état caché : l'appelant garde la liste, la pause et le message. Reprend `pollAir` de la v1. Dépend de : donnees/{trafic,relais-lieux,memoire-direct}.js.
 */
import { boiteDeRecherche, requeteBoite, lireAvions } from './trafic.js';
import { baseRelais } from './relais-lieux.js';

/** @typedef {import('./trafic.js').Avion} Avion */
/** @typedef {{ok: boolean, statut: number, donnees: any, entetes?: {get: (nom: string) => string | null}}} ReponseBrute */

/** Pause minimale après un refus de quota (s), et par défaut quand le serveur ne dit rien. */
export const PAUSE_MIN_S = 60, PAUSE_DEFAUT_S = 600;

/**
 * @param {{reseau: {requeter: (url: string, o?: any) => Promise<unknown>}, memoire: ReturnType<typeof import('./memoire-direct.js').creerMemoireDirect>, relais: string | undefined, maintenant?: () => number}} deps
 */
export function creerSourceAvions({ reseau, memoire, relais, maintenant = Date.now }) {
  const base = baseRelais(relais);
  return {
    parRelais: !!base,
    /**
     * Interroge la zone. Renvoie la liste à garder (la restaurée, ou celle de l'appelant, si la requête échoue), le message d'état et, au plus tôt, l'instant de reprise.
     * @param {{pos: {lat: number, lon: number}, rayonKm: number, avions: Avion[], pauseJusqua?: number}} e
     * @returns {Promise<{avions: Avion[], message: string, pauseJusqua: number, ok: boolean, detail: string, restaure: boolean}>}
     */
    async charger({ pos, rayonKm, avions, pauseJusqua = 0 }) {
      if (maintenant() < pauseJusqua) return { avions, message: '', pauseJusqua, ok: true, detail: 'pause en cours', restaure: false };
      const q = requeteBoite(boiteDeRecherche(pos, rayonKm));
      let liste = avions, restaure = false;
      if (!liste.length) {
        // l'appelant affiche « N av. (mémoire) » tant que la requête n'a pas répondu
        const h = await memoire.restaurer('air', pos);
        if (h && !liste.length) { liste = /** @type {Avion[]} */ (h.d); restaure = true; }
      }
      try {
        const url = base ? `${base}/planes?${q}` : `https://opensky-network.org/api/states/all?${q}`;
        const r = /** @type {ReponseBrute} */ (await reseau.requeter(url, { brut: true, delaiMs: 15000 })), j = r.donnees || {};
        if (r.statut === 429) {
          const attente = Math.max(PAUSE_MIN_S, +(j.retryAfter || (r.entetes && r.entetes.get('x-rate-limit-retry-after-seconds')) || PAUSE_DEFAUT_S));
          return { avions: liste, message: 'quota atteint', pauseJusqua: maintenant() + attente * 1000, ok: false, detail: `quota atteint, pause de ${Math.round(attente / 60)} min`, restaure };
        }
        if (!r.ok) throw new Error(j.error || ('HTTP ' + r.statut));
        const t = maintenant(), nouveaux = lireAvions(j, t);
        await memoire.sauver('air', pos, nouveaux);
        return { avions: nouveaux, message: nouveaux.length + ' av.', pauseJusqua, ok: !j.authError,
          detail: `${nouveaux.length} avions (${base ? 'relais, ' + (j.auth || '?') : 'direct, anonyme'}${j.creditsRestants ? `, ${j.creditsRestants} credits restants` : ''}${j.cache ? ', cache' : ''})${j.authError ? ' — ' + j.authError : ''}`, restaure };
      } catch (e) {
        return { avions: liste, message: 'indispo', pauseJusqua, ok: false, detail: (base ? 'relais : ' : 'direct : ') + (e instanceof Error ? e.message : String(e)), restaure };
      }
    },
  };
}
