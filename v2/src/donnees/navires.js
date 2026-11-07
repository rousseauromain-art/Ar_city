// @ts-check
/**
 * Navires : AISStream refuse les navigateurs, le relais écoute la zone (écoute continue par zone de 0,5°) et renvoie un résumé (`/ships`). Au premier appel la dernière situation
 * connue est restaurée (navires encore plausibles : 15 min en route, 1 h à quai), puis chaque réponse met à jour la table. Flux muet (`confirmed === false` sans message reçu) signalé.
 * Aucun état caché : l'appelant garde la table. Reprend `pollSea` de la v1. Dépend de : donnees/{trafic,relais-lieux,memoire-direct}.js.
 */
import { boiteDeRecherche, requeteBoite, fusionnerNavires, dureeConservation } from './trafic.js';
import { baseRelais } from './relais-lieux.js';

/** @typedef {import('./trafic.js').Navire} Navire */

/**
 * @param {{reseau: {requeter: (url: string, o?: any) => Promise<unknown>}, memoire: ReturnType<typeof import('./memoire-direct.js').creerMemoireDirect>, relais: string | undefined, maintenant?: () => number}} deps
 */
export function creerSourceNavires({ reseau, memoire, relais, maintenant = Date.now }) {
  const base = baseRelais(relais);
  return {
    disponible: !!base,
    /**
     * @param {{pos: {lat: number, lon: number}, rayonKm: number, navires: Map<string, Navire>}} e
     * @returns {Promise<{navires: Map<string, Navire>, message: string, ok: boolean, detail: string, restaure: boolean}>}
     */
    async charger({ pos, rayonKm, navires }) {
      let table = navires, restaure = false;
      if (!table.size) {
        const h = await memoire.restaurer('sea', pos), t = maintenant();
        if (h) {
          table = new Map(table);
          for (const [id, v] of /** @type {[string, Navire][]} */ (h.d)) if (!table.has(id) && t - v.t < dureeConservation(v)) table.set(id, v);
        }
        if (table.size) restaure = true; // l'appelant affiche « N bat. (mémoire) » tant que la requête n'a pas répondu
      }
      if (!base) return { navires: table, message: 'relais requis', ok: false, detail: 'relais serveur requis : AISStream refuse les navigateurs (config.js : relay)', restaure };
      try {
        const r = /** @type {{ok: boolean, statut: number, donnees: any}} */ (await reseau.requeter(`${base}/ships?${requeteBoite(boiteDeRecherche(pos, rayonKm))}`, { brut: true, delaiMs: 30000 })), j = r.donnees || {};
        if (!r.ok) throw new Error(j.error || ('HTTP ' + r.statut));
        const fusion = fusionnerNavires(table, j, maintenant());
        const muet = j.confirmed === false && !(j.received > 0) && !(j.undecoded > 0), n = (j.ships || []).length;
        if (fusion.size) await memoire.sauver('sea', pos, [...fusion]);
        const detail = muet ? 'AISStream muet : aucun accusé de réception ni message en ' + Math.round((j.listenMs || 0) / 1000) + ' s (panne côté service, pas de la requête)'
          : (j.hub ? `${n} navires dans la zone (écoute continue depuis ${j.hub.seconds} s, ${j.hub.tracked} suivis, ${j.received || 0} messages)` : `${n} navires reçus (${j.received || 0} messages en ${Math.round((j.listenMs || 0) / 1000)} s)`) + (j.error ? ' — ' + j.error : '');
        return { navires: fusion, message: muet ? 'AISStream muet' : fusion.size + ' bat.', ok: !j.error && !muet, detail, restaure };
      } catch (e) {
        return { navires: table, message: 'indispo', ok: false, detail: 'relais : ' + (e instanceof Error ? e.message : String(e)), restaure };
      }
    },
  };
}
