// @ts-check
/**
 * Position nettoyée (direct) : chaque fix GPS passe par `scene/position.js` (médiane pondérée à l'arrêt, dernière mesure en marche, ramené hors des bâtiments chargés) avant d'être donné à l'application,
 * qui ne relance la scène que si la position bouge de plus de 5 m. Affiche « ± précision » sur la puce de position ; garde de quoi expliquer le résultat dans le Diagnostic.
 * Ne touche jamais à la position simulée (l'entrée directe ne transmet pas les fix quand elle est active). Les bâtiments ne servent que s'ils sont déjà chargés (calque, position par les toits ou un calage en ville).
 */
import { nettoyerPosition, ramenerHorsBatiment, FENETRE_MS } from '../scene/position.js';

/** Au-delà de ce déplacement du cap (°) entre deux échantillons d'une seconde, le téléphone n'est plus « presque immobile ». */
const IMMOBILE_DEG = 8;

/**
 * @param {{app: ReturnType<typeof import('../app/application.js').creerApplication>, S: import('../moteur/reglages.js').Reglages, vitesse: () => number | null, echantillons: () => {cap: number}[], journal: {info: (m: string, msg: string, d?: unknown) => unknown},
 *   puce?: () => HTMLElement, maintenant?: () => number}} p
 */
export function creerPositionPropre({ app, S, vitesse, echantillons, journal, puce = () => document.createElement('span'), maintenant = Date.now }) {
  /** @type {{t: number, lat: number, lon: number, precisionM: number}[]} */
  const mesures = [];
  const etat = { brute: /** @type {{lat: number, lon: number, precisionM: number} | null} */ (null), nettoyee: /** @type {{lat: number, lon: number} | null} */ (null), n: 0, mode: '', deplaceBatM: 0, corrigeeBat: false };
  /** Le téléphone bouge-t-il ? Le cap des deux derniers échantillons (1 par seconde) ne varie pas de plus de 8°. */
  const immobile = () => { const e = echantillons(), a = e[e.length - 1], b = e[e.length - 2]; return !a || !b || Math.abs(((a.cap - b.cap + 540) % 360) - 180) < IMMOBILE_DEG; };
  /** @param {{lat: number, lon: number, precisionM: number}} p */
  function surFix(p) {
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
  return { surFix, etat: () => ({ ...etat, nMesures: mesures.length }) };
}
