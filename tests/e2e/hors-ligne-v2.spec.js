// Mode hors ligne : « Télécharger cette zone » garde les lieux (atlas) et le relief ; « Supprimer » les efface. Overpass et les tuiles sont simulés.
const {test,expect}=require('@playwright/test');

test('hors ligne : télécharger la zone remplit l’atlas, supprimer le vide',async({browser})=>{
  const ctx=await browser.newContext({viewport:{width:915,height:412},deviceScaleFactor:2,hasTouch:true,baseURL:`http://127.0.0.1:${+(process.env.PORT||4173)}`,permissions:['geolocation','camera'],geolocation:{latitude:48.6459,longitude:-2.0281}});
  const page=await ctx.newPage(), erreurs=[]; page.on('pageerror',e=>erreurs.push(String(e))); page.on('dialog',d=>d.accept());
  await page.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort());
  let requetes=0;
  await page.route(/^https?:\/\/[^/]*(overpass|maps\.mail\.ru|kumi\.systems|private\.coffee)/,async r=>{ requetes++; await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({elements:[
    {type:'node',id:1,lat:48.65,lon:-2.03,tags:{name:'Saint-Test',place:'village'}},{type:'node',id:2,lat:48.7,lon:-1.9,tags:{name:'Port-Test',place:'town',population:'9000'}}]})}); });
  await page.goto('/v2/ar.html'); await page.click('#go');
  await expect.poll(()=>page.evaluate(()=>!!window.__vh2.app.donnees().pos),{timeout:15000}).toBe(true);
  await expect(page.locator('#btnZoneDL')).toBeEnabled();
  await page.evaluate(()=>document.getElementById('btnSet').click());
  await page.evaluate(()=>document.getElementById('btnZoneDL').click());
  await expect(page.locator('#btnZoneDL')).toContainText('nouveaux',{timeout:20000}); // le chargement normal a déjà gardé ces 2 lieux : le téléchargement n'en ajoute pas de nouveaux
  expect(requetes).toBeGreaterThan(0);
  expect(await page.evaluate(()=>window.__vh2.app.infoZone().lieux)).toBe(2);
  await expect(page.locator('#zoneInfo')).toContainText('2 lieux enregistrés');
  expect(await page.evaluate(()=>window.__vh2.app.infoZone().zones)).toBeGreaterThanOrEqual(1);
  await expect(page.locator('#btnZoneDel')).toHaveCSS('display','inline-block'); // dans un groupe replié des réglages : visible seulement une fois le groupe ouvert
  await page.evaluate(()=>document.getElementById('btnZoneDel').click());
  expect(await page.evaluate(()=>window.__vh2.app.infoZone().lieux)).toBe(0);
  await expect(page.locator('#zoneInfo')).toContainText('Aucune zone téléchargée');
  expect(erreurs).toEqual([]); await ctx.close();
});
