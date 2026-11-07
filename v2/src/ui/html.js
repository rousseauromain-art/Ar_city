// @ts-check
/** Petites aides de mise en forme du diagnostic et du banc d'essai : échappement HTML, raison d'un échec, écart signé en degrés. Fonctions pures. */

/** @param {string} t */
export const echap = (t) => String(t).replace(/[<&>]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] || c));

/** La raison d'un échec, quand le journal l'a gardée : « — HTTP 429 », « — échec réseau : Failed to fetch »… @param {unknown} d */
export const raison = (d) => {
  if (!d) return '';
  const o = /** @type {any} */ (d), t = typeof d === 'string' ? d : o.message || o.nom || JSON.stringify(d);
  return ` <span style="color:var(--ochre)">— ${echap(String(t).slice(0, 200))}</span>`;
};

/** Écart signé en degrés avec une décimale : « +1.2° ». @param {number} v */
export const signe = (v) => (v >= 0 ? '+' : '') + v.toFixed(1) + '°';
