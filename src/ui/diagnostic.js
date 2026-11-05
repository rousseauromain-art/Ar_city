// @ts-check
/**
 * Diagnostic : état des données, du relief, des capteurs, du carnet de calage et journal.
 * Reçoit le contexte de la page (`c` : réglages, application, aides d'affichage, état partagé `ps`) ; ne lit ni n'écrit rien d'autre que ce contexte et le DOM.
 */
import { resumeCarnet } from '../calage/carnet.js';
import { etatFusion, mesuresFusion } from '../entrees/capteurs.js';
import { VERSION_V2 } from '../outils/version.js';
import { echap, raison, signe } from './html.js';
import { SORTIE_MS as SORTIE_ROTATION_MS } from '../entrees/rotation.js';

/** Ligne « suivi visuel WebXR » du Diagnostic. @param {import('./contexte.js').EtatPartage} ps */
function ligneXr(ps) {
  const e = ps.xr ? ps.xr.etat() : null;
  return `suivi visuel WebXR : ${e && e.actif ? `ACTIF · ${e.hz} Hz · ${e.suivi ? 'suivi' : 'suivi perdu'}` : 'éteint'}${e && e.erreur ? ` · ${echap(e.erreur)}` : ''}`;
}

/** Lignes du Diagnostic sur la ville : bâtiments (BD TOPO), silhouette, rues. @param {import('./contexte.js').Contexte} c @returns {string[]} */
function lignesVille({ app, S }) {
  const u = app.etat().urbain;
  return [`bâtiments (BD TOPO) : ${echap(u.batiments || (S.layers.urban ? 'en attente' : 'calque éteint : rien n\'est chargé'))}${u.nBatiments ? ` · silhouette calculée en ${u.silhouetteMs} ms` : ''}`, `rues : ${echap(u.rues || '—')}`];
}

/** Lignes du Diagnostic sur les rotations : source (quaternion 60 Hz ou deviceorientation) et écran contre téléphone. @param {import('./contexte.js').Contexte} c @returns {string[]} */
function lignesRotation({ entree, ps }) {
  const e = entree ? entree.etat() : null;
  return [
        ligneXr(ps),
        `source des rotations : ${echap(e ? e.sourceRelative : '—')}${e && e.hzRelatif ? ` · ${e.hzRelatif} Hz` : ''}${e && e.erreurCapteurRelatif ? ` · ${echap(e.erreurCapteurRelatif)}` : ''}`,
        `rotation : écran ${echap(ps.lectureRotation.typeEcran || 'inconnu')} · roulis ${ps.lectureRotation.roulisDeg.toFixed(0)}° · ${ps.rotation.actif ? `AVERTISSEMENT AFFICHÉ (rotation automatique coupée ?)${ps.rotation.horsDepuis !== null ? ` · sortie dans ${Math.max(0, Math.round((SORTIE_ROTATION_MS - (Date.now() - ps.rotation.horsDepuis)) / 1000))} s` : ''}` : ps.rotation.depuis !== null ? `téléphone en paysage depuis ${Math.round((Date.now() - ps.rotation.depuis) / 1000)} s` : 'écran et téléphone dans le même sens'}${ps.rotation.dernierMs !== null ? ` · dernier avertissement il y a ${Math.round((Date.now() - ps.rotation.dernierMs) / 1000)} s` : ''}`,
  ];
}

/** @param {import('./contexte.js').Contexte} c @param {{analyse: {derniere: any, ms: number}, calage: ReturnType<typeof import('./calage.js').installerCalage>, oeil: ReturnType<typeof import('./oeil.js').installerOeil>}} m */
export function installerDiagnostic(c, { analyse, calage, oeil }) {
  const { S, app, journal, stockage, carnet, fusion, entree, relais, direct, $, pose, imageSource, ps, echantillons, reglagesRepris } = c;
  $('btnDbg').addEventListener('click', () => {
    $('sheet').classList.remove('open');
    const e = app.etat(), d = app.donnees();
    const lignes = [`version ${VERSION_V2}`, `réglages d'affichage : ${reglagesRepris ? 'repris de la v1 au premier lancement' : 'propres à la v2'} · ligne de relief ${S.skyline ? 'affichée' : 'éteinte (Réglages › Ligne d\'horizon du relief)'}`, `position ${d.pos ? d.pos.lat.toFixed(5) + ', ' + d.pos.lon.toFixed(5) : '—'}`, `lieux : ${e.lieux} (${echap(e.source)}) — ${e.chargementLieux ? 'chargement en cours depuis ' + Math.round(e.depuisLieuxMs / 1000) + ' s' : 'chargement terminé'} · rayon ${S.radius} km`,
      ...e.sourcesLieux.map((s) => `&nbsp;&nbsp;${echap(s.nom)} : ${echap(s.etat)}${s.n !== undefined ? ' · ' + s.n + ' lieux' : ''}${s.raison ? ' · ' + echap(s.raison.slice(0, 140)) : ''}`),
      `échelle du champ : ${(() => { const e = stockage.lire('echelle', { parDefaut: null }); return e ? `calée à ${e.camFov}° le ${new Date(e.t).toLocaleDateString('fr-FR')} (${echap((e.reperes || []).join(' / '))})` : `réglage ${S.camFov}° (pas encore calée avec 2 repères)`; })()}`, `relief : ${S.calculRelief !== false ? echap(e.etatRelief || 'pas encore calculé') : 'désactivé (Réglages › Calculer le relief)'} · masquage par le relief ${S.relief ? 'actif' : 'éteint'}`,
      `visibilité d'après la photo : ${(() => {
        const a = analyse.derniere, liste = /** @type {any[]} */ ((ps.dernierBilan && ps.dernierBilan.liste) || []);
        if (S.photoVis !== true) return 'désactivée (Réglages)';
        if (!imageSource()) return 'caméra indisponible : règles estimées seulement';
        if (!a) return 'en attente de la première image';
        if (!a.ok) return `ciel illisible (${Math.round((a.skyFrac || 0) * 100)} % du haut de l'image) : règles estimées seulement · analyse ${analyse.ms.toFixed(1)} ms`;
        return `silhouette lue il y a ${Math.round((Date.now() - a.t) / 1000)} s sur ${a.cols.length} colonnes (ciel ${Math.round(a.skyFrac * 100)} % du haut de l'image) · ${liste.filter((m) => m.kind === 'monument' && m.photo === true).length} monument(s) vus, ${liste.filter((m) => m.photoHid).length} cachés · analyse ${analyse.ms.toFixed(1)} ms`;
      })()}`, `monuments ${d.monuments.length} · ${echap(e.monuments)}`,
      ...oeil.lignesDiagnostic(), ...lignesVille(c),
      `pylônes ${echap(e.telecom)} · repères hauts ${echap(e.reperes)}`, `relais ${relais || 'non configuré'}`, ...(direct ? [`capteurs : ${echap(etatFusion(fusion, S, Date.now()))}`, `mesures : ${(() => { const m = mesuresFusion(fusion, Date.now()), f = (/** @type {number | null} */ v) => (v === null ? '—' : v.toFixed(1) + '°'); return `boussole ${f(m.capBoussole)} · gyroscope ${f(m.capGyroscope)} · repère ${f(m.reperGyroscope)} · âge gyroscope ${m.ageGyroscopeMs === null ? '—' : Math.round(m.ageGyroscopeMs) + ' ms'} · désaccord depuis ${Math.round(m.desaccordDepuisMs)} ms${m.boussoleEnPause ? ' · boussole en pause' : ''}`; })()}`, `cap affiché ${pose().capDeg.toFixed(1)}° · calage ${S.headOff.toFixed(1)}° / ${S.pitchOff.toFixed(1)}°`,
        ...(ps.dernierRetour ? [`dernier retour à la boussole : il y a ${Math.round((Date.now() - ps.dernierRetour.t) / 1000)} s · boussole ${ps.dernierRetour.m.capBoussole?.toFixed(0)}° · gyroscope ${ps.dernierRetour.m.capGyroscope?.toFixed(0)}° · calage ${ps.dernierRetour.headOff.toFixed(1)}°`] : []),
        `recalage continu : ${echap(ps.continu.etat)} · ${ps.continu.pas} pas · cumul ${ps.continu.cumulDeg.toFixed(1)}°${ps.continu.dernier ? ` · dernier : cap ${ps.continu.dernier.dh >= 0 ? '+' : ''}${ps.continu.dernier.dh.toFixed(1)}° sur ${echap(ps.continu.dernier.astre)} il y a ${Math.round((Date.now() - ps.continu.dernier.t) / 1000)} s` : ''}`,
        ...lignesRotation(c),
        `trace du cap (10 dernières secondes) : ${echantillons.slice(-10).map((x) => x.cap.toFixed(0)).join(' ')}`,
        `caméra ${entree && entree.etat().cameraOk ? 'active' : 'inactive'}${entree && entree.etat().erreurCamera ? ' · ' + echap(entree.etat().erreurCamera) : ''}`, `avions : ${echap(e.messageAir || '—')} · bateaux : ${echap(e.messageSea || '—')}`] : [])];
    $('dbgTitle').textContent = 'Diagnostic';
    const cr = resumeCarnet(carnet.lire(), { appareil: carnet.appareil, modele: carnet.modele(), appris: calage.apprisIci() }), fd = (/** @type {number | null} */ v) => (v === null ? '—' : signe(v));
    const carnetHtml = `<div class="dbgsec">Carnet de calage</div><div class="dbgline">appareil ${echap(cr.appareil)} · ${echap(cr.modele)} · ${cr.nb} mesure(s) sur l'appareil${cr.enAttente ? ` · ${cr.enAttente} en attente d'envoi` : ''}${relais ? '' : ' · relais absent : pas d\'envoi'}</div>`
      + `<div class="dbgline">${cr.parSource.map((x) => `${echap(x.source)} : écart médian <b>${fd(x.medianeDeg)}</b> (${x.n})`).join('<br>') || 'aucune mesure : calez (glisser, toucher un repère ou le soleil, Caler auto)'}</div>`
      + `<div class="dbgline">écart appris ici : ${cr.appris ? `<b>${fd(cr.appris.off)}</b> (${echap(cr.appris.comment)})` : 'pas encore'}</div>`
      + `<div class="dbgline">${cr.dernieres.map((m) => `${new Date(m.rec).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · ${echap(m.src)} · brut ${(+m.raw).toFixed(0)}° → ${(+m.hdg).toFixed(0)}° (${fd(m.off)})${m.sun ? ` · soleil ${m.sun.az}°/${m.sun.el}°` : ''}`).join('<br>')}</div>`
      + (relais ? `<div class="dbgline"><a style="color:#F2C14E" target="_blank" rel="noopener" href="${echap(relais)}/calib.csv?dev=${echap(cr.appareil)}">mes mesures (CSV)</a> · <a style="color:#F2C14E" target="_blank" rel="noopener" href="${echap(relais)}/calib.csv">tous les appareils (CSV)</a></div>` : '');
    $('dbgBody').innerHTML = `<div class="dbgsec">État</div>${lignes.map((l) => `<div class="dbgline">${l}</div>`).join('')}${carnetHtml}<div class="dbgsec">Journal</div>`
      + `<div class="dbgsec">Mémoire de l'appareil (hit = relue, net = téléchargée, stale = périmée par défaut de réseau, fail = échec)</div>`
      + Object.entries(app.compteursCache()).map(([genre, c]) => `<div class="dbgline">${echap(genre)} : ${c.hit} hit · ${c.net} net · ${c.stale} stale · ${c.fail} fail</div>`).join('')
      + `<div class="dbgsec">Journal (le plus récent en premier)</div>`
      + journal.entrees(80).reverse().map((x) => `<div class="dbgline">${new Date(x.t).toLocaleTimeString('fr-FR')} · ${x.niveau} · ${echap(x.module)} · ${echap(x.message)}${raison(x.donnees)}</div>`).join('');
    $('dbg').classList.add('open');
  });
  $('dbgClose').addEventListener('click', () => $('dbg').classList.remove('open'));
  return undefined;
}
