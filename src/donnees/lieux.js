// @ts-check
/**
 * Chargement des lieux (villes, villages, hameaux et repères) autour d'une position : Overpass, OpenFreeMap et, si un relais est configuré,
 * Geoapify et GeoNames, EN PARALLÈLE ; la panne de l'un n'empêche pas les autres. Chaque source est mémorisée sur l'appareil par zone
 * (7 jours, mémoire périmée en secours), puis les listes sont fusionnées. Sans aucune source : atlas local, puis liste intégrée.
 * Entrées : position, rayon, réglages. Sortie : { lieux, source, secours }. Reprend `loadCities` de la v1 (mêmes clés de cache).
 * Dépend de : donnees/{overpass,openfreemap,relais-lieux,fusion,cache-donnees,atlas,lieux-integres}.js, noyau/geo.js.
 */
import { distanceEtCap } from '../noyau/geo.js';
import { clausesLieux, requeteOverpass } from './overpass.js';
import { fusionnerParNomEtProximite } from './fusion.js';
import { listeIntegree } from './lieux-integres.js';

/** @typedef {import('./overpass.js').Lieu} Lieu */
/** @typedef {{lat: number, lon: number}} Point */
/**
 * @typedef {object} ResultatLieux
 * @property {Lieu[]} lieux @property {string} source sources utilisées, jointes par « + » (« (mémoire) » = mémoire périmée en secours)
 * @property {boolean} secours une source a répondu depuis la mémoire périmée : le réseau doit être retenté
 * @property {boolean} enLigne au moins une source vivante a répondu @property {DetailSource[]} sources état de chaque source (diagnostic)
 * @typedef {{nom: string, etat: 'en cours' | 'réseau' | 'mémoire' | 'mémoire périmée' | 'échec', n?: number, raison?: string}} DetailSource
 */

/** Durée de vie de la mémoire des lieux : 7 jours. */
export const MEMOIRE_LIEUX_MS = 7 * 86400000;
const SOURCES_VIVANTES = new Set(['OSM', 'OpenFreeMap', 'Geoapify', 'GeoNames', 'Wikidata']);
/** Une source est « vivante » si elle vient du réseau ou de la mémoire d'une source vivante (pas de l'atlas ni de la liste intégrée). @param {string} s */
export const sourceVivante = (s) => !!s && s.split('+').every((t) => SOURCES_VIVANTES.has(t));

/**
 * @param {{
 *   cache: ReturnType<typeof import('./cache-donnees.js').creerCacheDonnees>,
 *   overpass: ReturnType<typeof import('./overpass.js').creerOverpass>,
 *   openfreemap: ReturnType<typeof import('./openfreemap.js').creerOpenFreeMap>,
 *   relais: ReturnType<typeof import('./relais-lieux.js').creerSourcesRelais>,
 *   atlas: ReturnType<typeof import('./atlas.js').creerAtlas>,
 *   wikidata?: ReturnType<typeof import('./wikidata-lieux.js').creerWikidataLieux>,
 *   journal?: {info: (m: string, msg: string, d?: unknown) => unknown, avert: (m: string, msg: string, d?: unknown) => unknown},
 * }} deps
 */
export function creerSourceLieux({ cache, overpass, openfreemap, relais, atlas, wikidata, journal }) {
  return {
    /**
     * `quandPartiel` : appelée à chaque source réglée avec la fusion de ce qui est déjà arrivé, pour afficher les lieux sans attendre la plus lente (les miroirs Overpass peuvent
     * mettre plus de 30 s à échouer pendant qu'OpenFreeMap répond de la mémoire en 1 s). Le résultat final reste la fusion complète, dans l'ordre canonique des sources.
     * @param {{pos: Point, rayonKm: number, hameaux: boolean, reperes: Record<string, boolean>, sourceActuelle?: string, lieuxActuels?: Lieu[], quandPartiel?: (p: {lieux: Lieu[], source: string, sources: DetailSource[]}) => void}} p
     * @returns {Promise<ResultatLieux>}
     */
    async charger({ pos, rayonKm, hameaux, reperes, sourceActuelle = '', lieuxActuels = [], quandPartiel }) {
      // La requête est centrée sur la case (arrondie) et son rayon agrandi d'une marge : une même mémoire sert à tout déplacement dans la case.
      const cellD = Math.max(0.01, Math.min(0.05, rayonKm / 1200)), pc = { lat: Math.round(pos.lat / cellD) * cellD, lon: Math.round(pos.lon / cellD) * cellD };
      const rQ = Math.ceil(rayonKm + cellD * 111 * 0.75), r = Math.round(rQ * 1000), plafond = (/** @type {number} */ km) => Math.min(r, km * 1000);
      const poiKey = Object.keys(reperes).filter((k) => reperes[k]).sort().join('.');
      const pk = `${pc.lat.toFixed(3)},${pc.lon.toFixed(3)}/${rayonKm}/${hameaux ? 1 : 0}/${poiKey}`;
      const cf = (/** @type {string} */ src, /** @type {() => Promise<Lieu[]>} */ charger) => cache.obtenir('pl', 'pl/' + src + '/' + pk, { ttlMs: MEMOIRE_LIEUX_MS, elaguer: ['pl/', 48], charger });
      const q = requeteOverpass(clausesLieux(pc, r, hameaux, reperes, plafond));
      const noms = ['OSM', 'OpenFreeMap'];
      const taches = [cf('osm', () => overpass.interroger(q, 20000)), cf('ofm', () => openfreemap.charger(pc, rQ, hameaux))];
      if (relais.disponible) { noms.push('Geoapify', 'GeoNames'); taches.push(cf('gpf', () => relais.geoapify(pc, rQ, reperes)), cf('gnm', () => relais.geonames(pc, rQ, reperes))); }
      /** @type {DetailSource[]} */
      const details = noms.map((nom) => ({ nom, etat: 'en cours' }));
      /** @type {(Lieu[] | null)[]} */
      const arrives = noms.map(() => null);
      const annoncer = () => {
        if (!quandPartiel) return;
        const listes = /** @type {Lieu[][]} */ (arrives.filter((l) => l !== null));
        if (!listes.length) { quandPartiel({ lieux: [], source: '', sources: details.map((d) => ({ ...d })) }); return; }
        let lieux = fusionnerParNomEtProximite(listes, 1.5);
        if (!hameaux) lieux = lieux.filter((c) => c.kind !== 'hamlet' && c.kind !== 'isolated_dwelling');
        quandPartiel({ lieux, source: noms.filter((_, i) => arrives[i] !== null).join('+') + ' (en cours)', sources: details.map((d) => ({ ...d })) });
      };
      const suivies = taches.map((t, i) => t.then(
        (v) => { arrives[i] = v.donnees; details[i] = { nom: noms[i], etat: v.source === 'reseau' ? 'réseau' : v.source === 'cache' ? 'mémoire' : 'mémoire périmée', n: v.donnees.length }; annoncer(); return v; },
        (e) => { details[i] = { nom: noms[i], etat: 'échec', raison: e instanceof Error ? e.message : String(e) }; annoncer(); throw e; }));
      const regles = await Promise.allSettled(suivies);
      // Repli Wikidata : seulement quand OpenStreetMap (Overpass) est en échec. Les lieux déjà arrivés restent affichés pendant ce temps ; ceux de Wikidata s'y ajoutent à la fin.
      if (wikidata && regles[0].status === 'rejected') {
        noms.push('Wikidata'); details.push({ nom: 'Wikidata', etat: 'en cours' });
        const j = noms.length - 1;
        try {
          const v = await cf('wd', () => wikidata.charger(pc, rQ, hameaux));
          arrives[j] = v.donnees; details[j] = { nom: 'Wikidata', etat: v.source === 'reseau' ? 'réseau' : v.source === 'cache' ? 'mémoire' : 'mémoire périmée', n: v.donnees.length };
          regles.push({ status: 'fulfilled', value: v }); annoncer();
        } catch (e) { details[j] = { nom: 'Wikidata', etat: 'échec', raison: e instanceof Error ? e.message : String(e) }; regles.push({ status: 'rejected', reason: e }); }
      }
      regles.forEach((res, i) => {
        if (!journal) return;
        if (res.status === 'fulfilled') journal.info('lieux', `${noms[i]} : ${res.value.donnees.length} lieux${res.value.source === 'reseau' ? '' : ` (${res.value.source})`}`);
        else journal.avert('lieux', `${noms[i]} en échec`, res.reason);
      });
      /** @type {Lieu[][]} */
      const listes = [];
      /** @type {string[]} */
      const utilisees = [];
      let secours = false;
      regles.forEach((res, i) => {
        if (res.status !== 'fulfilled') return;
        listes.push(res.value.donnees);
        const perime = res.value.source === 'secours';
        if (perime) secours = true;
        utilisees.push(noms[i] + (perime ? '(mémoire)' : ''));
      });
      if (listes.length) {
        let lieux = fusionnerParNomEtProximite(listes, 1.5);
        if (!hameaux) lieux = lieux.filter((c) => c.kind !== 'hamlet' && c.kind !== 'isolated_dwelling'); // filtre uniforme, quelle que soit la source d'origine
        const ajoutes = atlas.absorber(lieux, pos, rayonKm); // alimente l'atlas : on retombera dessus si toutes les sources tombent plus tard
        if (ajoutes && journal) journal.info('lieux', `atlas : +${ajoutes} lieux mémorisés (${atlas.nombre()} au total)`);
        return { lieux, source: utilisees.join('+'), secours, enLigne: true, sources: details };
      }
      if (!sourceVivante(sourceActuelle)) { // rien de vivant déjà chargé : atlas local, puis liste intégrée
        if (atlas.nombre()) return { lieux: atlas.lieux(), source: `atlas local (${atlas.nombre()} lieux)`, secours: true, enLigne: false, sources: details };
        return { lieux: listeIntegree(), source: 'liste intégrée (hors ligne)', secours: true, enLigne: false, sources: details };
      }
      if (journal) journal.avert('lieux', `conservation des ${lieuxActuels.length} lieux déjà chargés`);
      return { lieux: lieuxActuels, source: sourceActuelle, secours: true, enLigne: false, sources: details };
    },
    /**
     * Faut-il (re)charger ? Oui si forcé, si rien n'a été chargé, si la source n'est pas vivante (atlas, liste intégrée), si le rayon a grandi
     * ou si l'on s'est déplacé de plus de 25 % du rayon (v1 : début de `loadCities`).
     * @param {{force?: boolean, dernier: Point | null, source: string, rayonCharge: number, pos: Point, rayonKm: number}} p
     */
    doitRecharger({ force, dernier, source, rayonCharge, pos, rayonKm }) {
      return !!force || !dernier || !sourceVivante(source) || rayonCharge < rayonKm || distanceEtCap(pos, dernier).distKm >= rayonKm * 0.25;
    },
  };
}
