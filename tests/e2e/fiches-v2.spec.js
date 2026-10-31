// Fiches au toucher : toucher un nom ouvre sa fiche tout de suite ; toucher dans le vide la ferme. Lieux simulés (Overpass), capteurs et GPS simulés.
const {test,expect}=require('@playwright/test');

test('toucher un nom de lieu ouvre sa fiche, le vide la ferme',async({browser})=>{
  const ctx=await browser.newContext({viewport:{width:915,height:412},deviceScaleFactor:2,hasTouch:false,baseURL:`http://127.0.0.1:${+(process.env.PORT||4173)}`,permissions:['geolocation','camera'],geolocation:{latitude:48.6459,longitude:-2.0281}});
  const page=await ctx.newPage(), erreurs=[]; page.on('pageerror',e=>erreurs.push(String(e)));
  await page.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort());
  await page.route(/^https?:\/\/[^/]*(overpass|maps\.mail\.ru|kumi\.systems|private\.coffee)/,r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({elements:[
    {type:'node',id:1,lat:48.68,lon:-2.0281,tags:{name:'Saint-Test',place:'town',population:'12000'}}]})}));
  await page.addInitScript(()=>{ try{ localStorage.setItem('vh2:reglages',JSON.stringify({v:1,d:{radius:30,calculRelief:false,relief:false,skyline:false}})); }catch(e){} });
  await page.goto('/v2/ar.html'); await page.click('#go');
  await expect.poll(()=>page.evaluate(()=>!!window.__vh2.app.donnees().pos),{timeout:15000}).toBe(true);
  await page.evaluate(()=>{ for(let i=0;i<200;i++) window.dispatchEvent(new DeviceOrientationEvent('deviceorientationabsolute',{alpha:0,beta:90,gamma:0,absolute:true})); }); // vers le nord
  const centre=()=>page.evaluate(()=>{ const b=window.__vh2.bilan(), z=b&&b.zones&&b.zones.etiquettes.find(z=>z.element&&z.element.name==='Saint-Test'); if(!z) return null; const pts=z.poly||[[z.icone[0],z.icone[2]],[z.icone[1],z.icone[3]]]; return {x:pts.reduce((s,p)=>s+p[0],0)/pts.length,y:pts.reduce((s,p)=>s+p[1],0)/pts.length}; });
  await expect.poll(centre,{timeout:25000,message:'le nom Saint-Test doit être posé à l\'écran'}).not.toBeNull();
  const p=await centre(), r=await page.evaluate(()=>{ const b=document.getElementById('ov').getBoundingClientRect(); return {x:b.left,y:b.top}; });
  await page.mouse.click(r.x+p.x,r.y+p.y);
  await expect(page.locator('#fiche')).toBeVisible();
  await expect(page.locator('#ficheBody')).toContainText('Saint-Test');
  await expect(page.locator('#ficheBody')).toContainText('Population');
  await expect(page.locator('#ficheBody a').first()).toHaveAttribute('href',/wikipedia/);
  await page.click('#ficheClose'); await expect(page.locator('#fiche')).toBeHidden();
  await page.mouse.click(r.x+8,r.y+8); await expect(page.locator('#fiche')).toBeHidden(); // le vide ne rouvre rien
  expect(erreurs).toEqual([]); await ctx.close();
});
