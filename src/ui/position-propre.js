// @ts-check
/**
 * Position nettoyée (direct) : chaque fix GPS passe par `scene/position.js` (médiane pondérée à l'arrêt, dernière mesure en marche, ramené hors des bâtiments chargés) avant d'être donné à l'application,
 * qui ne relance la scène que si la position bouge de plus de 5 m. Affiche « ± précision » sur la puce de position ; garde de quoi expliquer le résultat dans le Diagnostic.
 * Ne touche jamais à la position simulée (l'entrée directe ne transmet pas les fix quand elle est active). Les bâtiments ne servent que s'ils sont déjà chargés (calque, position par les toits ou un calage en ville).
 */
import { nettoyerPosition, ramenerHorsBatiment, FENETRE_MS } from '../scene/position.js';
import { detecterPas, etatPasInitial, poserCorrection, surPas, surGps, LONGUEUR_PAS_M } from '../scene/pas.js';

/** Au-delà de ce déplacement du cap (°) entre deux échantillons d'une seconde, le téléphone n'est plus « presque immobile ». */
const IMMOBILE_DEG = 8;

/** Écoute l'accéléromètre (direct seulement). @param {boolean} actif @param {(a: {x: number, y: number, z: number, t: number}) => void} surAcceleration @param {Window} fenetre */
function ecouterAcceleration(actif, surAcceleration, fenetre) {
  if (!actif) return;
  fenetre.addEventListener('devicemotion', (/** @type {DeviceMotionEvent} */ e) => { const a = e.accelerationIncludingGravity; if (a && typeof a.x === 'number' && typeof a.y === 'number' && typeof a.z === 'number') surAcceleration({ x: a.x, y: a.y, z: a.z, t: Date.now() }); });
}

/**
 * Position corrigée (rue, toits, plaque : `imposer`) : elle avance avec les pas (accéléromètre, `surAcceleration`) ; le GPS ne reprend la main que s'il s'en écarte de plus de 2 × sa précision pendant 20 s (scene/pas.js).
 * @param {{app: ReturnType<typeof import('../app/application.js').creerApplication>, S: import('../moteur/reglages.js').Reglages, vitesse: () => number | null, capDeg?: () => number, echantillons: () => {cap: number}[], journal: {info: (m: string, msg: string, d?: unknown) => unknown},
 *   puce?: () => HTMLElement, maintenant?: () => number}} p
 */
export function creerPositionPropre({ app, S, vitesse, capDeg = () => 0, echantillons, journal, puce = () => document.createElement('span'), maintenant = Date.now }) {
  /** @type {{t: number, lat: number, lon: number, precisionM: number}[]} */
  const mesures = [];
  const etat = { brute: /** @type {{lat: number, lon: number, precisionM: number} | null} */ (null), nettoyee: /** @type {{lat: number, lon: number} | null} */ (null), n: 0, mode: '', deplaceBatM: 0, corrigeeBat: false };
  /** Correction en cours (position corrigée qui avance avec les pas) et d'où elle vient. @type {{corr: import('../scene/pas.js').Correction, source: string} | null} */
  let correction = null, pasEtat = etatPasInitial();
  /** Une position vient d'être corrigée (rue, toits, plaque) : elle devient la position, force une relance de la scène, et suit les pas. @param {{lat: number, lon: number}} pos @param {string} source */
  function imposer(pos, source) { correction = { corr: poserCorrection(pos), source }; app.definirPosition(pos, { force: true }); journal.info('position', `position corrigée (${source}) : elle avance avec vos pas, le GPS ne reprend la main qu'après 20 s d'écart de plus de 2 × sa précision`); }
  /** Échantillon d'accélération (avec gravité) : un pas fait avancer la position corrigée. @param {{x: number, y: number, z: number, t: number}} a */
  function surAcceleration(a) {
    const r = detecterPas(pasEtat, a); pasEtat = r.etat;
    if (!r.pas || !correction) return;
    correction = { ...correction, corr: surPas(correction.corr, capDeg(), S.longueurPas || LONGUEUR_PAS_M) };
    app.definirPosition(correction.corr.pos);
  }
  /** Le GPS reprend-il la main ? Sinon la position corrigée reste (puce de précision mise à jour). @param {{lat: number, lon: number, precisionM: number}} p @returns {boolean} vrai si la position corrigée reste */
  function gardeCorrection(p) {
    if (!correction) return false;
    const g = surGps(correction.corr, { pos: p, precisionM: p.precisionM || 20, t: maintenant() });
    if (g.reprise) { journal.info('position', `le GPS reprend la main (écart durable avec la position corrigée par ${correction.source})`); correction = null; return false; }
    correction = { ...correction, corr: /** @type {import('../scene/pas.js').Correction} */ (g.corr) };
    return true;
  }
  /** Le téléphone bouge-t-il ? Le cap des deux derniers échantillons (1 par seconde) ne varie pas de plus de 8°. */
  const immobile = () => { const e = echantillons(), a = e[e.length - 1], b = e[e.length - 2]; return !a || !b || Math.abs(((a.cap - b.cap + 540) % 360) - 180) < IMMOBILE_DEG; };
  /** @param {{lat: number, lon: number, precisionM: number}} p */
  function surFix(p) {
    if (gardeCorrection(p)) { const el = puce(); el.hidden = false; el.textContent = `± ${Math.round(p.precisionM || 0)} m`; return; }
    const t = maintenant();
    mesures.push({ t, lat: p.lat, lon: p.lon, precisionM: p.precisionM || 20 });
    while (mesures.length && t - mesures[0].t > FENETRE_MS * 2) mesures.shift();
    const r = nettoyerPosition({ mesures, vitesseMs: vitesse(), immobile: immobile(), maintenantMs: t });
    if (!r) return;
    let pos = r.pos;
    const bats = app.donnees().batiments || [];
    const q = bats.length ? ramenerHorsBatiment({ pos, batiments: bats, oeilRelM: 1.6 + (S.obsHeight || 0) }) : { pos, deplaceM: 0, dans: false };
    if (q.dans && !etat.corrigeeBat) journal.info('position', `fix dans un bâtiment : ramené dehors de ${q.deplaceM.toFixed(1)} m`);
    pos = q.pos;
    Object.assign(etat, { brute: { lat: p.lat, lon: p.lon, precisionM: p.precisionM }, nettoyee: pos, n: r.n, mode: r.mode, deplaceBatM: q.deplaceM, corrigeeBat: q.dans });
    const el = puce(); el.hidden = false; el.textContent = `± ${Math.round(p.precisionM || 0)} m`;
    app.definirPosition(pos);
  }
  return { surFix, imposer, surAcceleration, brancherAcceleration: (/** @type {boolean} */ actif, /** @type {Window} */ fenetre = window) => ecouterAcceleration(actif, surAcceleration, fenetre), etat: () => ({ ...etat, nMesures: mesures.length, correction: correction ? { source: correction.source, pas: correction.corr.pas, pos: correction.corr.pos } : null }) };
}
