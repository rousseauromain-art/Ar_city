// « Analyse d'une photo » (page d'accueil → v3/villes-horizon.html?mode=photo) : le départ ouvre le sélecteur de fichier, jamais la caméra.
// Sans paramètre, le départ est celui de la v1 (caméra). Données simulées (aucun réseau).
const {test,expect}=require('@playwright/test');
const {openApp}=require('../../tests/commun/app');
const POS={lat:48.6493,lon:-2.0257}, V3='/v3/villes-horizon.html';
/** Compte les demandes de caméra (getUserMedia), dès le chargement de la page. */
const compterCamera=page=>page.addInitScript(()=>{ window.__camera=0; const md=navigator.mediaDevices; if(!md) return; const o=md.getUserMedia.bind(md); md.getUserMedia=(...a)=>{ window.__camera++; return o(...a); }; });
/** Petite photo JPEG (sans EXIF, donc sans position), fabriquée dans la page. */
const jpeg=async page=>({name:'photo.jpg',mimeType:'image/jpeg',buffer:Buffer.from((await page.evaluate(()=>{ const c=document.createElement('canvas'); c.width=64; c.height=48; const x=c.getContext('2d'); x.fillStyle='#7aa'; x.fillRect(0,0,64,48); return c.toDataURL('image/jpeg'); })).split(',')[1],'base64')});
const toucherGo=async page=>(await Promise.all([page.waitForEvent('filechooser',{timeout:5000}),page.click('#go')]))[0];

test('?mode=photo : « Choisir une photo » ouvre le sélecteur de fichier sans demander la caméra ; annulé ou refusé, l’écran de départ reste ; une photo chargée le ferme',async({page})=>{
  await compterCamera(page);
  const app=await openApp(page,{url:V3+'?mode=photo',greffes:[],pos:POS,start:false});
  await expect(page.locator('#go')).toHaveText('Choisir une photo');
  // 1. choix annulé : rien n'est chargé, l'appli démarre derrière l'écran de départ, qui reste avec le même bouton
  let fc=await toucherGo(page); expect(fc.isMultiple()).toBe(false);
  await app.waitFor('pos'); // GPS et dessin démarrés
  expect(await page.locator('#photoFile').getAttribute('accept')).toBeNull(); // sans « accept » : le gestionnaire de fichiers, qui garde la position (EXIF)
  await page.evaluate(()=>{ window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})); }); // retour du sélecteur
  await expect(page.locator('#start')).toBeVisible(); await expect(page.locator('#go')).toHaveText('Choisir une photo');
  // 2. photo sans position (ni position simulée) : refusée, l'écran de départ reste et dit pourquoi
  fc=await toucherGo(page); await fc.setFiles(await jpeg(page));
  await expect(page.locator('#start small')).toContainText('Pas de position GPS dans ce fichier'); await expect(page.locator('#start')).toBeVisible();
  // 3. photo chargée (position simulée faute d'EXIF) : l'écran de départ se ferme sur la photo
  await app.ev("S.simPos='48.6493, -2.0257'; true");
  fc=await toucherGo(page); await fc.setFiles(await jpeg(page));
  await app.waitFor('photoMode&&pos'); await expect(page.locator('#start')).toBeHidden(); await expect(page.locator('#photoChip')).toBeVisible();
  expect(await page.evaluate(()=>window.__camera)).toBe(0); expect(await app.ev('camStream')).toBeNull(); expect(await app.ev('appStarted')).toBe(false);
  expect(app.errors).toEqual([]);
});

test('sans paramètre : « Ouvrir la caméra » ouvre la caméra, aucun sélecteur de fichier (départ de la v1)',async({page})=>{
  await compterCamera(page); let selecteurs=0; page.on('filechooser',()=>{ selecteurs++; });
  const app=await openApp(page,{url:V3,greffes:[],pos:POS,start:false});
  await expect(page.locator('#go')).toHaveText('Ouvrir la caméra');
  await page.click('#go'); await expect(page.locator('#start')).toBeHidden(); await app.waitFor('camOK&&pos');
  expect(await page.evaluate(()=>window.__camera)).toBe(1); expect(selecteurs).toBe(0); expect(await app.ev('appStarted')).toBe(true);
  expect(app.errors).toEqual([]);
});
