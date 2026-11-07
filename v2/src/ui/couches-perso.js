// @ts-check
/**
 * Couches personnelles (KMZ / KML) : les gestes (ajouter un fichier, case, nom, couleur, champ, distance, structure, suppression, recherche) sur le menu « Calques » et le panneau de gestion (HTML : ui/couches-perso-vue.js).
 * Le fichier est lu dans le navigateur et mémorisé sur l'appareil : jamais envoyé. Les sites s'affichent comme les pylônes (bande) ; un toucher ouvre leur fiche. Reprend `userAction` de la v1.
 * Reçoit le contexte de la page (`c`) et les fiches ; ne lit ni n'écrit rien d'autre que ce contexte et le DOM.
 */
import { afficherDiagnostic, diagnosticKml } from '../donnees/kml-diagnostic.js';
import { lireFichierKml } from '../donnees/kml.js';
import { htmlMenu, htmlPanneau, htmlTrouves, texteCompteur } from './couches-perso-vue.js';
import { echap } from './html.js';

/** @typedef {{requete: string, diagnostic: string, masquer: boolean, signature: string}} EtatCouches */
/** @typedef {{dessinerMenu: () => void, dessinerPanneau: (msg?: string) => void, redessiner: () => void, trouves: () => import('../donnees/kml.js').ItemPerso[]}} Rendu */

/** Actions d'un champ ou d'un bouton `data-f` d'une couche : [événement, fonction(couche, élément) → vrai si elle a déjà dessiné]. @param {import('./contexte.js').Contexte} c @param {EtatCouches} etat @param {Rendu} rendu */
function creerActions({ app }, etat, rendu) {
  const modifier = (/** @type {string} */ cle, /** @type {(t: any) => unknown} */ valeur) => /** @type {(L: import('../donnees/kml.js').CouchePerso, t: any) => Promise<boolean>} */ (async (L, t) => { await app.modifierCouchePerso(L.id, { [cle]: valeur(t) }); return false; });
  return /** @type {Record<string, [string, (L: import('../donnees/kml.js').CouchePerso, t: any) => Promise<boolean>]>} */ ({
    on: ['change', modifier('on', (t) => t.checked)], max: ['change', modifier('max', (t) => +t.value)], field: ['change', modifier('field', (t) => t.value)],
    name: ['change', modifier('name', (t) => t.value)], color: ['click', modifier('color', (t) => t.dataset.v)],
    diag: ['click', async (L) => { etat.diagnostic = L.diag || 'Aucun rapport mémorisé pour cette couche : utilisez « Diagnostic d\'un fichier » en choisissant le même fichier.'; rendu.dessinerPanneau(); return true; }],
    del: ['click', async (L) => { if (!confirm(`Supprimer la couche « ${L.name} » de cet appareil ?`)) return true; await app.supprimerCouchePerso(L.id); return false; }],
  });
}

/** Import d'un fichier .kmz / .kml. @param {import('./contexte.js').Contexte} c @param {Rendu} rendu @param {File} f */
async function importer({ app, $f, note }, rendu, f) {
  $f('usrMsg').textContent = `Lecture de ${f.name}…`;
  try {
    const r = await app.importerCouchePerso(f), L = r.couche;
    rendu.dessinerMenu(); rendu.dessinerPanneau(`✓ « ${echap(L.name)} » : ${L.pts.length} point(s)${L.ignored ? `, ${L.ignored} ligne(s)/polygone(s) ignorés` : ''}${r.coupe ? ' (limité à 60 000)' : ''}${r.memorisee ? '' : ' — mémorisation impossible (stockage plein ?) : la couche disparaîtra à la fermeture'}`);
    note(`Couche « ${L.name} » ajoutée`, 4000);
  } catch (e) { rendu.dessinerPanneau('✗ ' + echap(e instanceof Error ? e.message : String(e))); }
}

/** Structure d'un fichier choisi, sans l'importer. @param {EtatCouches} etat @param {Rendu} rendu @param {File | undefined} f */
async function diagnostiquer(etat, rendu, f) {
  if (!f) return;
  try { const { txt, meta } = await lireFichierKml(await f.arrayBuffer(), f.size); etat.diagnostic = diagnosticKml(txt, meta); } catch (e) { etat.diagnostic = 'Lecture impossible : ' + (e instanceof Error ? e.message : String(e)); }
  rendu.dessinerPanneau();
}

/** @param {EtatCouches} etat @param {HTMLElement} bouton */
async function copier(etat, bouton) {
  let ok; try { await navigator.clipboard.writeText(afficherDiagnostic(etat.diagnostic, etat.masquer)); ok = true; } catch { ok = false; }
  bouton.textContent = ok ? 'Copié ✓' : 'Sélectionnez et copiez'; setTimeout(() => { bouton.textContent = 'Copier'; }, 2000);
}

/** Gestes hors d'une couche : [sélecteur, événement, fonction(événement, élément)]. @param {import('./contexte.js').Contexte} c @param {EtatCouches} etat @param {Rendu} rendu @param {ReturnType<typeof import('./fiches.js').installerFiches>} fiches
 * @returns {[string, string, (e: Event, t: any) => unknown][]} */
function creerGestes(c, etat, rendu, fiches) {
  const { app, $, $f } = c;
  return [
    ['#lyUserMgr', 'click', () => rendu.dessinerPanneau()],
    ['[data-hit]', 'click', (_e, t) => { const it = app.rechercherSites(etat.requete)[+t.closest('[data-hit]').dataset.hit]; if (it) { $('dbg').classList.remove('open'); fiches.ouvrirElement('bande', it); } }],
    ['#usrDiag', 'change', (_e, t) => diagnostiquer(etat, rendu, t.files && t.files[0])],
    ['#usrMask', 'change', (_e, t) => { etat.masquer = t.checked; $f('usrDiagPre').textContent = afficherDiagnostic(etat.diagnostic, etat.masquer); }],
    ['#usrDiagX', 'click', () => { etat.diagnostic = ''; rendu.dessinerPanneau(); }],
    ['#usrCopy', 'click', (_e, t) => copier(etat, t.closest('#usrCopy'))],
    ['#usrFile', 'change', async (_e, t) => { const f = t.files && t.files[0]; if (f) await importer(c, rendu, f); }],
  ];
}

/** @param {import('./contexte.js').Contexte} c @param {ReturnType<typeof import('./fiches.js').installerFiches>} fiches */
export function installerCouchesPerso(c, fiches) {
  const { app, $, $f } = c;
  /** @type {EtatCouches} */
  const etat = { requete: '', diagnostic: '', masquer: false, signature: '' };
  const couches = () => app.couchesPerso();
  const trouves = () => (etat.requete.trim().length < 2 ? [] : app.rechercherSites(etat.requete));
  /** @type {Rendu} */
  const rendu = {
    trouves, dessinerMenu: () => { $f('lyUser').innerHTML = htmlMenu(couches(), etat.requete); },
    dessinerPanneau(msg) {
      $('dbgTitle').textContent = 'Couches perso';
      const h = trouves(); $('dbgBody').innerHTML = htmlPanneau({ couches: couches(), msg, diagnostic: etat.diagnostic, masquer: etat.masquer, requete: etat.requete, trouves: h });
      const n = $f('usrQn'); if (n) n.textContent = texteCompteur(etat.requete, h.length);
      $('dbg').classList.add('open'); $('layers').classList.remove('open');
    },
    redessiner() { rendu.dessinerMenu(); if ($('dbgTitle').textContent === 'Couches perso' && $('dbg').classList.contains('open')) rendu.dessinerPanneau(); },
  };
  const actions = creerActions(c, etat, rendu), gestes = creerGestes(c, etat, rendu, fiches);
  /** @param {Event} e */
  async function surEvenement(e) {
    const t = /** @type {any} */ (e.target), cible = t.closest ? t.closest('[data-usr]') : null;
    if (cible) { const L = couches().find((x) => x.id === cible.dataset.usr), a = actions[cible.dataset.f || '']; if (L && a && a[0] === e.type && !(await a[1](L, cible))) rendu.redessiner(); return; }
    for (const [sel, type, fn] of gestes) if (e.type === type && t.closest && t.closest(sel)) { await fn(e, t); return; }
  }
  /** Saisie de la recherche : pas de nouveau rendu (le clavier garde le focus), seulement le compteur et la liste. @param {Event} e */
  function surSaisie(e) {
    const q = /** @type {HTMLInputElement | null} */ (/** @type {any} */ (e.target).closest ? /** @type {any} */ (e.target).closest('[data-usrq]') : null); if (!q) return;
    etat.requete = q.value; const h = trouves();
    for (const o of document.querySelectorAll('[data-usrq]')) if (o !== q) /** @type {HTMLInputElement} */ (o).value = q.value;
    for (const n of document.querySelectorAll('#usrQn')) n.textContent = texteCompteur(etat.requete, h.length);
    $f('usrHits').innerHTML = htmlTrouves(h, etat.requete);
  }
  for (const ev of ['click', 'change']) { $('layers').addEventListener(ev, surEvenement); $('dbgBody').addEventListener(ev, surEvenement); }
  $('layers').addEventListener('input', surSaisie); $('dbgBody').addEventListener('input', surSaisie);
  rendu.dessinerMenu();
  /** À appeler à chaque image : redessine le menu quand les couches changent (relues de l'appareil au démarrage). */
  const synchro = () => { const s = couches().map((L) => `${L.id}|${L.name}|${L.on}|${L.max}`).join(';'); if (s !== etat.signature) { etat.signature = s; rendu.dessinerMenu(); } };
  return { synchro, redessiner: rendu.redessiner };
}
