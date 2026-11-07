// « Lire une plaque » : l'OCR est simulé (texte lu), la Base Adresse aussi ; le texte lu est affiché et la position n'est corrigée qu'après « Appliquer » ; « Annuler » ne change rien ; texte illisible : message.
const {test,expect}=require('@playwright/test');
const {installerVille,decaler}=require('../../../tests/commun/ville-simulee.js');

const POS={lat:48.8566,lon:2.3522};
async function ouvrir(browser,{ocr}){
  const ctx=await browser.newContext({viewport:{width:915,height:412},deviceScaleFactor:1,hasTouch:true,locale:'fr-FR',baseURL:`http://127.0.0.1:${+(process.env.PORT||4173)}`,permissions:['geolocation','camera'],geolocation:{latitude:POS.lat,longitude:POS.lon,accuracy:8}});
  const page=await ctx.newPage(), erreurs=[], urls=[]; page.on('pageerror',e=>erreurs.push(String(e)));
  await page.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort());
  await installerVille(page,{pos:POS,rues:[{nom:'Rue de Rivoli',points:[[0,-200],[0,200]]}],lieux:[{nom:'Paris',classe:'city',population:2200000}]});
  const a12=decaler(POS,12,60);
  await page.route(/data\.geopf\.fr\/geocodage\/search/,r=>{ urls.push(r.request().url()); return r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({features:[
    {geometry:{coordinates:[a12.lon,a12.lat]},properties:{type:'housenumber',label:'12 Rue de Rivoli 75001 Paris',housenumber:'12',street:'Rue de Rivoli'}},
    {geometry:{coordinates:[POS.lon,POS.lat]},properties:{type:'street',label:'Rue de Rivoli 75001 Paris',name:'Rue de Rivoli'}}]})}); });
  await page.addInitScript((ocr)=>{ window.__vhOcr=async()=>ocr; try{ localStorage.setItem('vh2:reglages',JSON.stringify({v:1,d:{radius:20,calculRelief:false,relief:false,skyline:false}})); }catch(e){} },ocr);
  await page.goto('/v2/ar.html'); await page.click('#go');
  await expect.poll(()=>page.evaluate(()=>!!window.__vh2.app.donnees().pos),{timeout:15000}).toBe(true);
  await page.evaluate(()=>{ const c=document.createElement('canvas'); c.width=640; c.height=360; const x=c.getContext('2d'), v=document.getElementById('cam'); setInterval(()=>{ x.fillStyle='#456'; x.fillRect(0,0,640,360); },50); v.srcObject=c.captureStream(15); v.play().catch(()=>{}); });
  await expect.poll(()=>page.evaluate(()=>{ const v=document.getElementById('cam'); return v.videoWidth>0&&!v.paused; }),{timeout:10000}).toBe(true);
  return {ctx,page,erreurs,urls};
}
const dist=(p,q)=>Math.hypot((q.lat-p.lat)*111320,(q.lon-p.lon)*111320*Math.cos(p.lat*Math.PI/180));

test('plaque « 12 RUE DE RIVOLI » : texte et adresse affichés, position corrigée seulement après « Appliquer » (4 m de l\'axe, au droit du numéro)',async({browser})=>{
  const {ctx,page,erreurs,urls}=await ouvrir(browser,{ocr:'12 RUE DE RIVOLI\n75001 PARIS'});
  await page.evaluate(()=>document.getElementById('btnPlate').click());
  await expect(page.locator('#plateMsg')).toContainText('Plaque lue : « 12 rue de rivoli »',{timeout:10000});
  await expect(page.locator('#plateMsg')).toContainText('12 Rue de Rivoli 75001 Paris');
  expect(urls.length).toBe(1); expect(decodeURIComponent(urls[0])).toContain('q=12 rue de rivoli'); expect(urls[0]).not.toMatch(/image|data:/);
  expect(dist(await page.evaluate(()=>window.__vh2.app.donnees().pos),POS)).toBeLessThan(1); // rien n'est appliqué sans confirmation
  await page.locator('#plateMsg button',{hasText:'Appliquer'}).click();
  const p=await page.evaluate(()=>window.__vh2.app.donnees().pos), cible=decaler(POS,4,60);
  expect(dist(p,cible)).toBeLessThan(1); await expect(page.locator('#plateMsg')).toBeHidden();
  await page.evaluate(()=>document.getElementById('btnDbg').click());
  await expect(page.locator('#dbgBody')).toContainText('position corrigée (plaque)');
  expect(erreurs).toEqual([]); await ctx.close();
});

test('« Annuler » : la position ne change pas',async({browser})=>{
  const {ctx,page,erreurs}=await ouvrir(browser,{ocr:'12 RUE DE RIVOLI'});
  await page.evaluate(()=>document.getElementById('btnPlate').click());
  await expect(page.locator('#plateMsg button',{hasText:'Annuler'})).toBeVisible({timeout:10000});
  await page.locator('#plateMsg button',{hasText:'Annuler'}).click();
  expect(dist(await page.evaluate(()=>window.__vh2.app.donnees().pos),POS)).toBeLessThan(1); await expect(page.locator('#plateMsg')).toBeHidden();
  expect(erreurs).toEqual([]); await ctx.close();
});

test('texte illisible : message, aucune requête, aucune position corrigée',async({browser})=>{
  const {ctx,page,erreurs,urls}=await ouvrir(browser,{ocr:'xx ~~ 7 ##'});
  await page.evaluate(()=>document.getElementById('btnPlate').click());
  await expect(page.locator('#note')).toContainText('Aucune plaque lisible',{timeout:10000}); expect(urls.length).toBe(0);
  expect(erreurs).toEqual([]); await ctx.close();
});
