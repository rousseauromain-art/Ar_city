// @ts-check
/**
 * « Lire une plaque » (direct) : image de la caméra → texte (OCR dans le navigateur, Tesseract.js chargé à la demande au premier toucher, langue française) → adresse (Base Adresse Nationale, à moins de 300 m)
 * → position (calage/adresse.js). Le texte lu et l'adresse trouvée sont AFFICHÉS ; rien n'est appliqué sans la confirmation d'un toucher sur « Appliquer ». Seul le texte part vers le service, jamais l'image.
 * La reconnaissance est injectable (`window.__vhOcr`, pour les tests). Reçoit le contexte de la page (`c`) ; ne lit ni n'écrit rien d'autre que ce contexte et le DOM.
 */
import { lireTexteAdresse, choisirAdresse, positionDepuisAdresse } from '../calage/adresse.js';
import { creerSourceAdresse } from '../donnees/adresse.js';

/** Version épinglée de Tesseract.js, chargée seulement quand on touche le bouton. */
export const URL_TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.esm.min.js';
/** Largeur (px) de l'image envoyée à la reconnaissance. */
const LARGEUR_OCR_PX = 1280;

/** @type {any} */
let travailleur = null;
/** Reconnaissance du texte d'une image avec Tesseract.js (français). @param {HTMLCanvasElement} canvas @returns {Promise<string>} */
async function ocrTesseract(canvas) {
  if (!travailleur) { const url = URL_TESSERACT, mod = /** @type {any} */ (await import(url)); travailleur = await (mod.createWorker || mod.default.createWorker)('fra'); }
  return String((await travailleur.recognize(canvas)).data.text || '');
}

/** Image de la caméra, réduite. @param {HTMLVideoElement | null} video @returns {HTMLCanvasElement | null} */
function imageCamera(video) {
  if (!video || !video.videoWidth) return null;
  const cv = document.createElement('canvas'), k = Math.min(1, LARGEUR_OCR_PX / video.videoWidth);
  cv.width = Math.round(video.videoWidth * k); cv.height = Math.round(video.videoHeight * k);
  const x = cv.getContext('2d'); if (!x) return null;
  x.drawImage(video, 0, 0, cv.width, cv.height); return cv;
}

/** @param {import('./contexte.js').Contexte} c */
export function installerLirePlaque(c) {
  const { app, video, direct, positionPropre, journal, $, $f, note } = c;
  const source = creerSourceAdresse({ reseau: /** @type {any} */ (app.reseau) });
  const bandeau = () => $f('plateMsg');
  const fermer = () => { bandeau().hidden = true; bandeau().textContent = ''; $('btnPlate').classList.remove('on'); };
  /** Affiche ce qui a été lu et attend la confirmation. @param {string} lu @param {{pos: {lat: number, lon: number}, ecartM: number, libelle: string}} r */
  function demander(lu, r) {
    const b = bandeau(); b.textContent = ''; b.hidden = false;
    b.append(Object.assign(document.createElement('div'), { textContent: `Plaque lue : « ${lu} »` }), Object.assign(document.createElement('div'), { textContent: `→ ${r.libelle} : votre position serait corrigée de ${Math.round(r.ecartM)} m.` }));
    const oui = Object.assign(document.createElement('button'), { type: 'button', className: 'guideBtn', textContent: 'Appliquer' }), non = Object.assign(document.createElement('button'), { type: 'button', className: 'guideBtn', textContent: 'Annuler' });
    oui.addEventListener('click', (e) => { e.stopPropagation(); positionPropre.imposer(r.pos, 'plaque'); journal.info('position', `plaque : ${r.libelle}`); fermer(); note(`Position corrigée d'après la plaque (${Math.round(r.ecartM)} m)`, 6000); });
    non.addEventListener('click', (e) => { e.stopPropagation(); fermer(); note('Plaque ignorée', 3000); });
    b.append(oui, non);
  }
  async function lire() {
    const d = app.donnees();
    if (!direct) { note('Lire une plaque : en direct (page « Réalité augmentée »)', 5000); return; }
    if (!d.pos) { note('Lire une plaque : en attente de la position', 4000); return; }
    const cv = imageCamera(video);
    if (!cv) { note('Caméra indisponible', 4000); return; }
    $('btnPlate').classList.add('on'); note('Lecture de la plaque… (la première fois, le lecteur de texte se télécharge)', 20000);
    try {
      const ocr = /** @type {any} */ (window).__vhOcr || ocrTesseract, texte = String(await ocr(cv)), lu = lireTexteAdresse(texte);
      if (!lu) { fermer(); note(`Aucune plaque lisible (texte lu : « ${texte.replace(/\s+/g, ' ').trim().slice(0, 40)} »)`, 7000); return; }
      const adresses = await source.chercher({ texte: lu.requete, pos: d.pos }), a = choisirAdresse(adresses, lu);
      if (!a) { fermer(); note(`« ${lu.requete} » : aucune adresse à moins de 300 m`, 7000); return; }
      await app.assurerRues(4000);
      const r = positionDepuisAdresse({ adresse: a, rues: app.donnees().rues || [], pos: d.pos });
      if (!r.ok) { fermer(); note(r.raison, 7000); return; }
      demander(lu.requete, r);
    } catch (e) { fermer(); journal.avert('position', 'lecture de la plaque impossible', e); note('Lecture de la plaque impossible : ' + (e instanceof Error ? e.message : String(e)), 7000); }
  }
  $('btnPlate').addEventListener('click', () => { $('sheet').classList.remove('open'); if (!bandeau().hidden) { fermer(); return; } lire(); });
  return { lire };
}
