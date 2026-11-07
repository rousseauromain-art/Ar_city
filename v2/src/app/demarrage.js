// @ts-check
/**
 * Démarrage rapide : la dernière position (avec son heure) et le dernier relief calculé sont gardés sur l'appareil.
 * À l'ouverture, la page repart de cette position (« position de HH:MM ») et affiche tout de suite ce relief, jusqu'à l'arrivée du GPS et du relief recalculé.
 * Le relief gardé ne contient que le masque (ligne d'horizon, crêtes) : il est marqué `provisoire` et ne sert pas aux verdicts de visibilité (il n'a pas les tuiles).
 * Entrées : stockage `vh2:` (position), Cache API (relief, binaire). Pur hormis ces deux accès.
 */
import { distanceEtCap } from '../noyau/geo.js';

const CLE_POSITION = 'dernierePosition';
const CACHE = 'vh2-demarrage', CLE_RELIEF = 'https://vh2.local/relief';
/** Position gardée au plus une fois par minute, ou dès qu'elle a bougé de plus de 50 m. */
const PERIODE_MS = 60000, ECART_KM = 0.05;
/** Relief gardé réutilisable à moins de 300 m (comme `memeEndroit`). */
const PROCHE_KM = 0.3;

/** @typedef {{lat: number, lon: number, t: number}} PositionGardee */
/** @typedef {{pos: {lat: number, lon: number}, h0: number, solM?: number, origine?: string, pm: Float32Array[] & {raw?: Float32Array[]}, t: number}} ReliefGarde */

/** Sérialise un relief (masque et masque brut) : en-tête JSON, puis les Float32Array à la suite. @param {ReliefGarde} r @returns {Blob} */
export function serialiserRelief(r) {
  const raw = r.pm.raw || [], tailles = r.pm.map((a) => a.length), taillesRaw = raw.map((a) => a.length);
  const tete = new TextEncoder().encode(JSON.stringify({ pos: r.pos, h0: r.h0, solM: r.solM, origine: r.origine, t: r.t, tailles, taillesRaw }));
  const lg = new Uint32Array([tete.length]), pad = new Uint8Array((4 - ((4 + tete.length) % 4)) % 4);
  return new Blob([lg, tete, pad, ...r.pm, ...raw].map((a) => /** @type {BlobPart} */ (/** @type {unknown} */ (a))));
}

/** @param {ArrayBuffer} buf @returns {ReliefGarde} */
export function lireRelief(buf) {
  const n = new Uint32Array(buf, 0, 1)[0], tete = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, n)));
  let o = 4 + n; o += (4 - (o % 4)) % 4;
  const lire = (/** @type {number[]} */ tailles) => tailles.map((l) => { const a = new Float32Array(buf.slice(o, o + l * 4)); o += l * 4; return a; });
  const pm = /** @type {Float32Array[] & {raw?: Float32Array[]}} */ (lire(tete.tailles));
  if (tete.taillesRaw.length) pm.raw = lire(tete.taillesRaw);
  return { pos: tete.pos, h0: tete.h0, solM: tete.solM, origine: tete.origine, t: tete.t, pm };
}

/** @param {{stockage: {lire: (n: string, d: any) => any, ecrire: (n: string, v: unknown) => void}, caches?: CacheStorage, maintenant?: () => number, journal?: any}} o */
export function creerDemarrage({ stockage, caches = globalThis.caches, maintenant = Date.now, journal }) {
  /** @type {PositionGardee | null} */
  let derniere = stockage.lire(CLE_POSITION, null);
  return {
    /** Dernière position gardée (null : aucune). @returns {PositionGardee | null} */
    position: () => (derniere && Number.isFinite(derniere.lat) && Number.isFinite(derniere.lon) ? derniere : null),
    /** Garde la position (au plus une fois par minute, sauf déplacement de plus de 50 m). @param {{lat: number, lon: number}} p */
    garderPosition(p) {
      const t = maintenant();
      if (derniere && t - derniere.t < PERIODE_MS && distanceEtCap(derniere, p).distKm < ECART_KM) return;
      derniere = { lat: p.lat, lon: p.lon, t }; stockage.ecrire(CLE_POSITION, derniere);
    },
    /** Garde le relief calculé. @param {Omit<ReliefGarde, 't'>} r */
    async garderRelief(r) {
      if (!caches) return;
      try { await (await caches.open(CACHE)).put(CLE_RELIEF, new Response(serialiserRelief({ ...r, t: maintenant() }))); } catch (e) { if (journal) journal.avert('demarrage', 'relief non gardé', e); }
    },
    /** Relief gardé, s'il a été calculé à moins de 300 m de `pos`. @param {{lat: number, lon: number}} pos @returns {Promise<ReliefGarde | null>} */
    async relief(pos) {
      if (!caches) return null;
      try {
        const rep = await (await caches.open(CACHE)).match(CLE_RELIEF); if (!rep) return null;
        const r = lireRelief(await rep.arrayBuffer());
        return distanceEtCap(r.pos, pos).distKm < PROCHE_KM ? r : null;
      } catch (e) { if (journal) journal.avert('demarrage', 'relief gardé illisible', e); return null; }
    },
  };
}

/**
 * Reprise au démarrage : la dernière position gardée devient la position (sans être regardée comme un nouveau fix), et le relief gardé à moins de 300 m s'affiche,
 * marqué `provisoire` (ligne d'horizon et crêtes ; aucun verdict de visibilité sans les tuiles), tant que le relief n'est pas recalculé. Sans effet si une position est déjà connue.
 * @param {{demarrage: ReturnType<typeof creerDemarrage>, D: {pos: any, terrain: any}, definirPosition: (p: {lat: number, lon: number}) => unknown, avecRelief: boolean, change: (q: string) => void, journal: any}} o
 * @returns {Promise<PositionGardee | null>}
 */
export async function reprendre({ demarrage, D, definirPosition, avecRelief, change, journal }) {
  const p = demarrage.position();
  if (!p || D.pos) return null;
  definirPosition({ lat: p.lat, lon: p.lon });
  const r = avecRelief ? await demarrage.relief(p) : null;
  if (r && !D.terrain && D.pos && distanceEtCap(D.pos, r.pos).distKm < PROCHE_KM) {
    D.terrain = { h0: r.h0, pm: r.pm, bands: [], solM: r.solM, origine: r.origine, provisoire: true };
    change('relief'); journal.info('app', 'relief du dernier démarrage affiché (provisoire)');
  }
  return p;
}

/** « position de HH:MM » (heure locale de l'appareil). @param {number} t */
export const texteHeurePosition = (t) => { const d = new Date(t); return `position de ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
