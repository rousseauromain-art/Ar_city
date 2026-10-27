// Harnais de caractérisation, côté v1 (REFONTE.md §3 et §9) : rejoue chaque scène de référence dans la v1 FIGÉE, sans la modifier,
// avec le vrai code de la page lisant les caches rejoués (aucune simulation du relief ni d'Overpass), puis écrit UN JSON PAR SCÈNE ET PAR
// MODE (Essentiel / Tout voir) : pour chaque calque, chaque élément avec son état (net, transparent, absent), sa raison, sa position à l'écran et son opacité.
//
// Usage : npm run dump:v1 [-- --scene=<id>] [-- --sortie=<dossier>]
//   PHOTOS_DIR (défaut /home/user/ar_city-photos) : photos et exports de cache. Sortie : $PHOTOS_DIR/dumps (dépôt privé : les dumps révèlent lieux et dates).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { SCENES, MODES, REGLAGES_COMMUNS } from './scenes.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');
const { start } = require('../helpers/server.js');
const { openApp } = require('../helpers/app.js');
const { readExports, seedCaches } = require('../helpers/cache.js');
const { reliefUrls } = require('../helpers/relief-urls.js');

const PHOTOS_DIR = process.env.PHOTOS_DIR || '/home/user/ar_city-photos';
const arg = (nom) => (process.argv.find((a) => a.startsWith(`--${nom}=`)) || '').split('=')[1];
const SORTIE = arg('sortie') || path.join(PHOTOS_DIR, 'dumps');

// ---- extraction, exécutée DANS la page v1 (variables internes visibles grâce au crochet de test) ----
// Lecture seule : aucune variable de la v1 n'est modifiée. Les états suivent le contrat d'affichage de REFONTE.md §4.
const EXTRAIRE = `(() => {
  const r1 = (v, n = 3) => (v == null || !isFinite(v) ? null : +v.toFixed(n));
  const ghost = (c) => !!c.far || (S.relief && !!terrain && !!c.hidden);
  const raisons = (c) => {
    const out = [];
    if (c.dist == null) return ['distance inconnue'];
    if (c.dist > (c.farPeak ? RELIEF_MAX_KM : S.radius)) out.push('hors du rayon');
    if (S.relief && terrain && c.hidden) out.push(c.low ? 'tour sous la crête' : 'caché par le relief');
    if (c.occBy) out.push('caché par un monument devant : ' + c.occBy);
    if (c.roof) out.push('plus bas que les toits (ville dense)');
    if (c.cap) out.push('au-delà du plafond de noms nets');
    if (c.photoHid) out.push('caché sur la photo');
    if (c.far && !c.roof && !c.occBy && !c.cap && !c.photoHid) out.push(c.kind === 'monument' ? 'trop petit vu d’ici ou peu connu' : 'trop loin pour sa catégorie');
    return out;
  };
  const dansVisibles = new Set(visibleCities());
  const FOVH = vFov(), capPose = pose().heading;
  const horsChamp = (c) => c.brg == null || Math.abs(wrap(c.brg + (c._snapDB || 0) - capPose)) > Math.min(80, FOVH * 0.8); // même règle que draw() : inView()
  // max : calques à portée réglée (pylônes, bâtiments hauts) ; les autres sont classés par visibleCities()
  const decrire = (c, libelle, calque, max) => {
    const infra = max != null;
    const portee = infra && (c.dist == null || c.dist > max);
    return {
      nom: c.name || '', libelle, type: c.type || c.kind || null, cat: c.cat || null, source: c.src || null,
      distKm: r1(c.dist), capDeg: r1(c.brg, 2), hauteurM: c.ht != null ? r1(c.ht, 1) : null,
      fantome: infra ? false : (dansVisibles.has(c) ? ghost(c) : null),
      parmiVisibles: infra ? !(portee || c.dupMon) : dansVisibles.has(c),
      raisons: infra ? (portee ? ['au-delà de la portée réglée (' + max + ' km)'] : c.dupMon ? ['déjà dessiné comme monument'] : []) : raisons(c),
      horsChamp: horsChamp(c), calque,
    };
  };
  const calques = { lieux: [], reperes: [], sommets: [], monuments: [], equipements: [], pylones: [], batiments: [] };
  const SETTLE_KINDS = new Set(['city', 'town', 'village', 'hamlet', 'isolated_dwelling']);
  for (const c of cities) { const k = SETTLE_KINDS.has(c.kind) ? 'lieux' : 'reperes'; calques[k].push(decrire(c, c.name, k)); }
  for (const c of farPeaks) calques.sommets.push(decrire(c, c.name, 'sommets'));
  for (const c of monumentSites) { const k = c.cat === 'equip' ? 'equipements' : 'monuments'; calques[k].push(decrire(c, monName(c), k)); }
  for (const c of telecomSites) calques.pylones.push(decrire(c, c.name || c.id || '', 'pylones', S.telecomMax));
  for (const c of buildingSites) calques.batiments.push(decrire(c, c.name || c.kind || '', 'batiments', S.buildingsMax));
  const skyline = []; if (terrain) for (let b = 0; b < 360; b += 5) skyline.push(r1(skylineElevAt(b), 3));
  const P = pose();
  return {
    appVersion: APP_VERSION.slice(0, 24),
    pose: { capDeg: r1(P.heading, 2), inclinaisonDeg: r1(P.pitch, 2), champDeg: S.camFov, champAfficheDeg: r1(vFov(), 2), ecran: [W, H] },
    reglages: { rayonKm: S.radius, tout_voir: !!S.beyond, relief: S.relief, hameaux: S.hamlets, telecom: S.telecom, batiments: S.buildings },
    sources: { lieux: source, nbLieux: cities.length, nbMonuments: monumentSites.length, nbPylones: telecomSites.length, nbBatiments: buildingSites.length, nbSommets: farPeaks.length },
    relief: terrain ? { etat: reliefState, hauteurOeilM: r1(terrain.h0, 2), solM: r1(obsGround, 2), sourceSol: obsGroundSrc, statistiques: reliefStats, silhouetteDeg: skyline } : null,
    placement: { ...placeStats },
    calques,
  };
})()`;

// Textes réellement dessinés (capture de la scène par le crochet) : nom, position écran, taille, opacité.
function resumerTextes(textes) {
  return textes.map((t) => {
    const [a, b, , , e, f] = t.m;
    const rgba = /rgba?\(([^)]*)\)/.exec(t.fill);
    const alphaFill = rgba && rgba[1].split(',').length === 4 ? parseFloat(rgba[1].split(',')[3]) : 1;
    const dpr = t.dpr || 1;
    return { texte: t.text, x: +((a * t.x + t.m[2] * t.y + e) / dpr).toFixed(1), y: +((b * t.x + t.m[3] * t.y + f) / dpr).toFixed(1), angleDeg: +(Math.atan2(b, a) / Math.PI * 180).toFixed(1), taille: +t.size.toFixed(1), opacite: +(alphaFill * (t.alpha ?? 1)).toFixed(2) };
  });
}

// Associe à chaque élément le texte dessiné de même libellé (le premier non encore attribué, éléments triés de façon stable).
//  etat   : le CLASSEMENT (contrat de REFONTE.md §4) — net, transparent (Tout voir) ou absent — indépendant de la place disponible ;
//  rendu  : ce qui est réellement arrivé à l'écran — dessine, hors-champ ou sans-place (nul si absent).
function associer(calques, textes, mode) {
  const libres = new Map();
  for (const t of textes) (libres.get(t.texte) || libres.set(t.texte, []).get(t.texte)).push(t);
  for (const liste of Object.values(calques)) {
    liste.sort((p, q) => (p.distKm ?? 1e9) - (q.distKm ?? 1e9) || p.nom.localeCompare(q.nom) || (p.capDeg ?? 0) - (q.capDeg ?? 0));
    for (const el of liste) {
      const t = (libres.get(el.libelle) || []).shift();
      el.etat = !el.parmiVisibles ? 'absent' : el.fantome ? (mode === 'tout-voir' ? 'transparent' : 'absent') : 'net';
      el.dessine = t ? { x: t.x, y: t.y, angleDeg: t.angleDeg, taille: t.taille, opacite: t.opacite } : null;
      el.rendu = el.etat === 'absent' ? null : el.horsChamp ? 'hors-champ' : t ? 'dessine' : 'sans-place';
      el.raison = el.etat === 'net' ? null : (el.raisons[0] || null);
      delete el.parmiVisibles; delete el.fantome; delete el.libelle; delete el.horsChamp;
    }
  }
}

async function jouerScene(browser, scene, exports, mode) {
  const tag = `${scene.id}/${mode}`;
  const contexte = await browser.newContext({ viewport: scene.ecran, deviceScaleFactor: 2, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', baseURL: `http://127.0.0.1:${PORT}`, permissions: ['geolocation'] });
  const page = await contexte.newPage();
  const erreurs = []; page.on('pageerror', (e) => erreurs.push(String(e)));
  const settings = { ...REGLAGES_COMMUNS, radius: scene.radius, headOff: scene.capDeg ?? 0, pitchOff: scene.inclinaisonDeg ?? 0, camFov: scene.champDeg ?? 67 };
  const app = await openApp(page, { reel: true, start: false, time: new Date(scene.heure), settings, pos: scene.pos });
  // rejeu du cache : relief utile à CETTE position seulement, données complètes
  let pos = scene.pos;
  if (scene.photo) pos = await lirePositionPhoto(path.join(PHOTOS_DIR, scene.photo));
  const urls = reliefUrls(pos).tout;
  const entrees = exports.entries.filter((e) => e.c === 'dc' || urls.has(e.k));
  await seedCaches(page, { entries: entrees });
  await page.click('#go');
  await page.waitForFunction(() => document.getElementById('start').style.display === 'none');
  if (scene.photo) { await page.setInputFiles('#photoFile', path.join(PHOTOS_DIR, scene.photo)); await app.waitFor('photoMode&&pos'); }
  else await app.waitFor('pos');
  await attendreStable(app);
  await app.ev(`setBeyond(${mode === 'tout-voir'})`);
  await attendreStable(app, 1500);
  for (let i = 0; i < 3; i++) await app.frame(); // les premières images précèdent les derniers chargements ; la mémoire de placement se fixe
  const textes = resumerTextes(await app.frame());
  const dump = await app.ev(EXTRAIRE);
  associer(dump.calques, textes, mode);
  const tuilesRelief = { attendues: reliefUrls(pos).hr.length, presentes: reliefUrls(pos).hr.filter((u) => urls.has(u) && exports.entries.some((e) => e.k === u)).length };
  await contexte.close();
  return { format: 'vh-dump-v1', scene: scene.id, lieu: scene.lieu, mode, ...dump, couvertureRelief: tuilesRelief, nbTextesDessines: textes.length, erreursPage: erreurs, textes };
}

async function lirePositionPhoto(fichier) {
  const { execFileSync } = await import('node:child_process');
  const sortie = execFileSync('python3', ['-I', '-c', `
import sys
from PIL import Image
g=Image.open(sys.argv[1]).getexif().get_ifd(0x8825)
d=lambda v:float(v[0])+float(v[1])/60+float(v[2])/3600
print(d(g[2])*(1 if g[1]=='N' else -1), d(g[4])*(1 if g[3]=='E' else -1))`, fichier]).toString().trim().split(' ').map(Number);
  return { lat: sortie[0], lon: sortie[1] };
}

// Attend que les chargements (lieux, relief, monuments, pylônes, bâtiments) soient terminés ET que les compteurs ne bougent plus.
async function attendreStable(app, minMs = 3000) {
  const signature = `[cities.length,monumentSites.length,telecomSites.length,buildingSites.length,farPeaks.length,citiesVer,terrain?terrain.at:0,loading,terrainBusy,monBusy,telecomBusy,buildingsBusy].join('|')`;
  let derniere = '', stable = 0; const t0 = Date.now();
  while (Date.now() - t0 < 120000) {
    const sig = await app.ev(signature);
    stable = sig === derniere ? stable + 500 : 0; derniere = sig;
    const occupe = sig.split('|').slice(7).some((v) => v === 'true');
    if (stable >= minMs && !occupe) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('la scène ne se stabilise pas (chargements bloqués ?) : ' + derniere);
}

const PORT = 4190;
async function main() {
  const choisies = arg('scene') ? SCENES.filter((s) => s.id === arg('scene')) : SCENES;
  if (!choisies.length) throw new Error(`scène inconnue : ${arg('scene')}`);
  const fichiers = fs.existsSync(PHOTOS_DIR) ? fs.readdirSync(PHOTOS_DIR).filter((f) => /^villes-horizon-.*\.json$/.test(f)).map((f) => path.join(PHOTOS_DIR, f)) : [];
  if (!fichiers.length) throw new Error(`aucun export de cache dans ${PHOTOS_DIR}`);
  console.log(`exports : ${fichiers.length} fichier(s) dans ${PHOTOS_DIR}`);
  const exports = readExports(fichiers);
  console.log(`  ${exports.exports.length} export(s), ${exports.entries.length} entrée(s)`);
  fs.mkdirSync(SORTIE, { recursive: true });
  const serveur = await start(PORT); const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const incompletes = [];
  try {
    for (const scene of choisies) {
      if (scene.photo && !fs.existsSync(path.join(PHOTOS_DIR, scene.photo))) { incompletes.push(`${scene.id} : photo ${scene.photo} absente`); continue; }
      for (const mode of MODES) {
        const t0 = Date.now(); const dump = await jouerScene(browser, scene, exports, mode);
        const f = path.join(SORTIE, `${scene.id}.${mode}.json`); fs.writeFileSync(f, JSON.stringify(dump, null, 1));
        const n = Object.fromEntries(Object.entries(dump.calques).map(([k, v]) => [k, v.length]));
        const c = dump.couvertureRelief;
        console.log(`${scene.id} (${mode}) : ${Math.round((Date.now() - t0) / 1000)} s · relief ${c.presentes}/${c.attendues} tuiles · textes ${dump.nbTextesDessines} · ${JSON.stringify(n)}${dump.erreursPage.length ? ' · ERREURS PAGE ' + dump.erreursPage.length : ''}`);
        if (c.presentes < c.attendues) incompletes.push(`${scene.id} : relief ${c.presentes}/${c.attendues} tuiles Mapterhorn (réexporter avec les coordonnées exactes de la prise de vue)`);
      }
    }
  } finally { await browser.close(); serveur.close(); }
  const uniques = [...new Set(incompletes)];
  if (uniques.length) console.log('\nScènes à compléter :\n- ' + uniques.join('\n- '));
}
main().catch((e) => { console.error(e); process.exit(1); });
