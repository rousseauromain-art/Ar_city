// @ts-check
/**
 * Page « Outils v2 » (v2/outils.html) : journal en direct, test du relais, stockage et caches de la v2, drapeaux, rapport.
 * DOM uniquement : toute la logique est dans src/outils et src/donnees. Entrées : le document de la page et config.js (APP_CONFIG.relay).
 */
import { journal } from '../outils/journal.js';
import { etat } from '../outils/etat.js';
import { creerStockage, adaptateurNavigateur, PREFIXE_CACHE } from '../outils/stockage.js';
import { lireDrapeaux, memoriserDrapeaux, DRAPEAUX_CONNUS } from '../outils/drapeaux.js';
import { construireRapport, nomFichierRapport } from '../outils/rapport.js';
import { chargerEruda } from '../outils/debug.js';
import { VERSION_V2 } from '../outils/version.js';
import { creerReseau } from '../donnees/reseau.js';

/** @param {string} id @returns {HTMLElement} */
function el(id) {
  const e = document.getElementById(id);
  if (!e) throw new Error(`élément #${id} introuvable`);
  return e;
}

const heure = (/** @type {number} */ t) => new Date(t).toLocaleTimeString('fr-FR');

function afficherJournal() {
  const liste = el('journal');
  liste.textContent = '';
  for (const e of journal.entrees(100).reverse()) {
    const li = document.createElement('li');
    li.className = e.niveau;
    li.textContent = `${heure(e.t)} · ${e.module} · ${e.message}`;
    liste.appendChild(li);
  }
}

async function afficherStockage(/** @type {ReturnType<typeof creerStockage>} */ stockage) {
  const noms = stockage.noms();
  /** @type {string[]} */
  let caches = [];
  try { caches = window.caches ? (await window.caches.keys()).filter((k) => k.startsWith(PREFIXE_CACHE)) : []; }
  catch (e) { journal.erreur('outils', 'lecture des caches impossible', e); }
  el('stockage').textContent = `${noms.length} valeur(s) vh2:${noms.length ? ' (' + noms.join(', ') + ')' : ''} · ${caches.length} cache(s) ${PREFIXE_CACHE}${caches.length ? ' (' + caches.join(', ') + ')' : ''}. La v1 garde ses propres clés : elles ne sont ni lues ni touchées ici.`;
}

function demarrer() {
  const stockage = creerStockage({ adaptateur: adaptateurNavigateur(journal), journal });
  etat.definirVersion(VERSION_V2);
  etat.remplacerDrapeaux(lireDrapeaux({ recherche: location.search, stockage, journal }));
  el('version').textContent = VERSION_V2;

  // toute erreur de la page passe par le journal (règle 6)
  window.addEventListener('error', (ev) => journal.erreur('page', ev.message, { fichier: ev.filename, ligne: ev.lineno }));
  window.addEventListener('unhandledrejection', (ev) => journal.erreur('page', 'promesse rejetée', ev.reason));
  journal.abonner(afficherJournal);
  journal.info('outils', `page ouverte (${VERSION_V2})`);

  // drapeaux
  const boite = el('drapeaux');
  for (const [nom, role] of Object.entries(DRAPEAUX_CONNUS)) {
    const label = document.createElement('label');
    label.className = 'ligne';
    const c = document.createElement('input');
    c.type = 'checkbox'; c.checked = !!etat.instantane().drapeaux[nom];
    c.addEventListener('change', () => { etat.definirDrapeau(nom, c.checked); memoriserDrapeaux(etat.instantane().drapeaux, stockage); journal.info('drapeaux', `${nom} : ${c.checked ? 'activé' : 'désactivé'}`); });
    const texte = document.createElement('span');
    texte.innerHTML = `<b></b><small></small>`;
    /** @type {HTMLElement} */ (texte.querySelector('b')).textContent = nom;
    /** @type {HTMLElement} */ (texte.querySelector('small')).textContent = role;
    label.append(c, texte); boite.appendChild(label);
  }

  // relais : tout passe par donnees/reseau.js
  const reseau = creerReseau({ journal, delaiMs: 10000, tentatives: 2 });
  el('btnRelais').addEventListener('click', async () => {
    const sortie = el('resRelais'); const base = (/** @type {any} */ (window).APP_CONFIG || {}).relay;
    if (!base) { sortie.textContent = 'Aucun relais dans config.js.'; journal.avert('outils', 'config.js sans adresse de relais'); return; }
    sortie.textContent = 'Test en cours…'; const t0 = performance.now();
    try {
      const r = await reseau.obtenir(`${String(base).replace(/\/+$/, '')}/check`, { analyse: 'json' });
      const ms = Math.round(performance.now() - t0); etat.enregistrerChrono('relais', ms);
      sortie.textContent = `Relais joignable en ${ms} ms (${r.source}).`; journal.info('outils', `relais joignable en ${ms} ms`);
    } catch (e) { sortie.textContent = 'Relais injoignable : ' + (e instanceof Error ? e.message : String(e)); journal.erreur('outils', 'relais injoignable', e); }
  });

  // rapport
  el('btnRapport').addEventListener('click', () => {
    const rapport = construireRapport({ etat, journal, navigateur: { agent: navigator.userAgent, langue: navigator.language, ecran: `${innerWidth}x${innerHeight}@${devicePixelRatio}` } });
    const blob = new Blob([JSON.stringify(rapport, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nomFichierRapport(rapport);
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    el('resRapport').textContent = `Rapport créé (${(blob.size / 1024).toFixed(0)} Ko) : joignez-le à la conversation.`;
    journal.info('outils', 'rapport exporté');
  });

  // stockage de la v2 uniquement
  el('btnVider').addEventListener('click', async () => {
    if (!confirm('Supprimer les données et caches de la v2 (la v1 n’est pas touchée) ?')) return;
    for (const n of stockage.noms()) stockage.supprimer(n);
    try { for (const k of window.caches ? await window.caches.keys() : []) if (k.startsWith(PREFIXE_CACHE)) await window.caches.delete(k); }
    catch (e) { journal.erreur('outils', 'suppression des caches impossible', e); }
    journal.info('outils', 'stockage v2 vidé'); afficherStockage(stockage);
  });

  afficherJournal(); afficherStockage(stockage);
  chargerEruda({ recherche: location.search, journal }).then((ok) => { el('debugEtat').textContent = ok ? 'Console Eruda active (bouton en bas à droite).' : (new URLSearchParams(location.search).get('debug') === '1' ? 'Eruda non chargée (voir le journal).' : 'Ajoutez ?debug=1 à l’adresse pour la console Eruda.'); });
}

demarrer();
