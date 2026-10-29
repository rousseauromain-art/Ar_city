// v2 : calage sur le soleil (bouton cible) et pointage au doigt (bouton réticule), avec une photo SYNTHÉTIQUE : un disque blanc est peint exactement là où le soleil calculé
// doit apparaître, alors que le cap enregistré dans l'EXIF est faux de 4°. Les parités avec la v1 sur les photos réelles sont dans photo-calage-parite.spec.js (local).
const {test,expect}=require('@playwright/test');

const LAT=48.6459, LON=-2.0281, UTC='2026-10-25T16:30:00Z', DATE_EXIF='2026:10:25 17:30:00', DECALAGE=4;

async function photoAvecSoleil(page,{nuit=false}={}){
  const {jpegExif}=await import('../unit/aide-jpeg.mjs'), {positionSoleil}=await import('../../src/noyau/astro.js');
  const utc=nuit?Date.parse('2026-10-25T21:30:00Z'):Date.parse(UTC), sol=positionSoleil(utc,LAT,LON);
  const exif=Buffer.from(jpegExif({dir:(sol.azDeg+DECALAGE-90+360)%360,orient:1,lat:LAT,lon:LON,f35:24,date:nuit?'2026:10:25 22:30:00':DATE_EXIF,offset:'+01:00'}));
  const b64=await page.evaluate(async({sol,nuit})=>{
    const W=640,H=360,c=document.createElement('canvas'); c.width=W; c.height=H; const x=c.getContext('2d'); x.fillStyle='rgb(120,160,220)'; x.fillRect(0,0,W,H);
    // champ affiché = champ de la focale (même rapport d'image que l'écran de test) ; le vrai cap est celui du soleil (centre de l'image), le vrai horizon est à 0°
    const champ=2*Math.atan(Math.tan(Math.atan(43.27/2/24))*W/Math.hypot(W,H))*180/Math.PI, fh=(W/2)/Math.tan(champ/2*Math.PI/180);
    if(!nuit){ const y=H/2-fh*Math.tan(sol.elDeg*Math.PI/180); x.fillStyle='#fff'; x.beginPath(); x.arc(W/2,y,6,0,7); x.fill(); }
    const b=await new Promise(r=>c.toBlob(r,'image/jpeg',.95)); const u=new Uint8Array(await b.arrayBuffer()); let s=''; for(const v of u) s+=String.fromCharCode(v); return btoa(s); },{sol,nuit});
  const jpg=Buffer.from(b64,'base64');
  return {buffer:Buffer.concat([jpg.subarray(0,2),exif.subarray(2,exif.length-2),jpg.subarray(2)]),sol};
}
async function ouvrir(page,photo){
  const erreurs=[]; page.on('pageerror',e=>erreurs.push(String(e)));
  await page.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort());
  await page.goto('/v2/photo.html');
  await page.setInputFiles('#photoFile',{name:'soleil.jpg',mimeType:'image/jpeg',buffer:photo.buffer});
  await expect(page.locator('#photoChip')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>!!window.__vh2.app.donnees().pos)).toBe(true);
  return erreurs;
}
test.use({viewport:{width:640,height:360}});

test('« Caler auto » : le disque du soleil corrige le cap faux de l’EXIF (cap et horizon)',async({page})=>{
  const photo=await photoAvecSoleil(page), erreurs=await ouvrir(page,photo);
  const avant=await page.evaluate(()=>window.__vh2.S.headOff);
  expect(avant).toBeCloseTo(photo.sol.azDeg+DECALAGE,0);
  await page.click('#btnAlign');
  await expect(page.locator('#note')).toContainText('calé sur le soleil',{timeout:5000});
  const apres=await page.evaluate(()=>({h:window.__vh2.S.headOff,p:window.__vh2.S.pitchOff}));
  expect(apres.h).toBeCloseTo(photo.sol.azDeg,0); expect(Math.abs(apres.p)).toBeLessThan(0.7);
  expect(await page.evaluate(()=>localStorage.getItem('vh2:reglages'))).toContain('headOff');
  expect(erreurs).toEqual([]);
});

test('« Caler auto » la nuit, sans relief : le soleil est couché, le relief indisponible, les repères sans réponse — message clair, calage inchangé',async({page})=>{
  const photo=await photoAvecSoleil(page,{nuit:true}), erreurs=await ouvrir(page,photo);
  const avant=await page.evaluate(()=>window.__vh2.S.headOff);
  await page.click('#btnAlign');
  await expect(page.locator('#note')).toContainText('relief indisponible · repères :');
  expect(await page.evaluate(()=>window.__vh2.S.headOff)).toBe(avant);
  expect(erreurs).toEqual([]);
});

test('pointage : réticule puis toucher le soleil ; toucher dans le vide : message',async({page})=>{
  const photo=await photoAvecSoleil(page), erreurs=await ouvrir(page,photo);
  await page.click('#btnPoint'); await expect(page.locator('#note')).toContainText('Touchez un repère connu');
  // le disque est au centre de l'image (le vrai cap), à sa hauteur réelle ; l'écran, lui, croit viser 4° plus loin : toucher le disque corrige donc le cap de −4°
  const fh=await page.evaluate(()=>320/Math.tan(window.__vh2.S.camFov/2*Math.PI/180));
  const xDisque=320, y=180-fh*Math.tan(photo.sol.elDeg*Math.PI/180);
  await page.mouse.click(xDisque,y);
  await expect(page.locator('#note')).toContainText('calé sur le soleil · cap',{timeout:5000});
  expect(await page.evaluate(()=>window.__vh2.S.headOff)).toBeCloseTo(photo.sol.azDeg,0);
  // sans repère près du point touché
  await page.click('#btnPoint'); await page.mouse.click(40,300);
  await expect(page.locator('#note')).toContainText(/aucun lieu ni monument|calé sur/);
  expect(erreurs).toEqual([]);
});
