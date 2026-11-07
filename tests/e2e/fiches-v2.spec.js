// Fiches au toucher dans la v2, comme la v1 : toucher un nom ouvre le panneau plein écran avec la fiche complète. Lieux simulés (Overpass), capteurs et GPS simulés.
// (Le contenu des fiches est comparé à celui de la v1 par fiches-parite.spec.js.)
const {test,expect}=require('@playwright/test');

async function ouvrir(browser,elements){
  const ctx=await browser.newContext({viewport:{width:915,height:412},deviceScaleFactor:2,hasTouch:false,baseURL:`http://127.0.0.1:${+(process.env.PORT||4173)}`,permissions:['geolocation','camera'],geolocation:{latitude:48.6459,longitude:-2.0281}});
  const page=await ctx.newPage(), erreurs=[]; page.on('pageerror',e=>erreurs.push(String(e)));
  await page.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort());
  await page.route(/^https?:\/\/[^/]*(overpass|maps\.mail\.ru|kumi\.systems|private\.coffee)/,r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({elements})}));
  await page.addInitScript(()=>{ try{ localStorage.setItem('vh2:reglages',JSON.stringify({v:1,d:{radius:30,calculRelief:false,relief:false,skyline:false}})); }catch(e){} });
  await page.goto('/v2/ar.html'); await page.click('#go');
  await expect.poll(()=>page.evaluate(()=>!!window.__vh2.app.donnees().pos),{timeout:15000}).toBe(true);
  await page.evaluate(()=>{ for(let i=0;i<200;i++) window.dispatchEvent(new DeviceOrientationEvent('deviceorientationabsolute',{alpha:0,beta:90,gamma:0,absolute:true})); }); // vers le nord
  return {ctx,page,erreurs};
}
const centreDe=(page,nom)=>page.evaluate((nom)=>{ const b=window.__vh2.bilan(), z=b&&b.zones&&b.zones.etiquettes.find(z=>z.element&&z.element.name===nom); if(!z) return null; const pts=z.poly||[[z.icone[0],z.icone[2]],[z.icone[1],z.icone[3]]]; return {x:pts.reduce((s,p)=>s+p[0],0)/pts.length,y:pts.reduce((s,p)=>s+p[1],0)/pts.length}; },nom);

test('toucher un nom de lieu ouvre sa fiche dans le panneau plein écran ; lien Wikipédia : l’article s’il est connu, sinon une recherche',async({browser})=>{
  const {ctx,page,erreurs}=await ouvrir(browser,[
    {type:'node',id:1,lat:48.68,lon:-2.0281,tags:{name:'Saint-Test',place:'town',population:'12000'}},
    {type:'node',id:2,lat:48.75,lon:-2.075,tags:{name:'Dinard-Test',place:'town',population:'9000',wikidata:'Q212433',wikipedia:'fr:Dinard'}}]);
  for(const [nom,lien,href] of [['Saint-Test','Rechercher sur Wikipédia',/fr\.wikipedia\.org\/w\/index\.php\?search=Saint-Test/],['Dinard-Test','Wikipédia',/fr\.wikipedia\.org\/wiki\/Dinard$/]]){
    await expect.poll(()=>centreDe(page,nom),{timeout:25000,message:`le nom ${nom} doit être posé à l'écran`}).not.toBeNull();
    const p=await centreDe(page,nom), r=await page.evaluate(()=>{ const b=document.getElementById('ov').getBoundingClientRect(); return {x:b.left,y:b.top}; });
    await page.mouse.click(r.x+p.x,r.y+p.y);
    await expect(page.locator('#dbg')).toBeVisible();
    await expect(page.locator('#dbgBody')).toContainText(nom);
    await expect(page.locator('#dbgBody')).toContainText('Population');
    await expect(page.locator('#dbgBody')).toContainText('Diagnostic d\'affichage');
    await expect(page.locator('#dbgBody a',{hasText:new RegExp('^'+lien+'$')})).toHaveAttribute('href',href);
    await page.click('#dbgClose'); await expect(page.locator('#dbg')).toBeHidden();
  }
  expect(erreurs).toEqual([]); await ctx.close();
});
