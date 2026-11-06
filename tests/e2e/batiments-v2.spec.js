// Silhouette des bâtiments (BD TOPO, tuiles simulées) : calque coché → silhouette calculée (angles exacts) et dessinée ; IGN refusé → relais ; hors ligne après « Télécharger cette zone ».
const {test,expect}=require('@playwright/test');
const {installerVille}=require('../helpers/ville-simulee.js');

const POS={lat:48.8566,lon:2.3522};
const VILLE={ pos:POS, batiments:[{N:300,E:0,w:30,l:20,h:51.6},{N:60,E:0,w:10,l:10,h:80},{N:900,E:200,w:40,l:40,h:30}], rues:[{nom:'Rue de Rivoli',points:[[-200,-5],[200,-5]]}] };

async function ouvrir(browser,{ville=VILLE,reglages={layers:{urban:true}},reseauCoupe=true,ctxOptions={}}={}){
  const ctx=await browser.newContext({viewport:{width:915,height:412},deviceScaleFactor:1,hasTouch:true,locale:'fr-FR',baseURL:`http://127.0.0.1:${+(process.env.PORT||4173)}`,permissions:['geolocation','camera'],geolocation:{latitude:POS.lat,longitude:POS.lon},...ctxOptions});
  const page=await ctx.newPage(), erreurs=[]; page.on('pageerror',e=>erreurs.push(String(e))); page.on('dialog',d=>d.accept());
  if(reseauCoupe) await page.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort());
  const compte=await installerVille(page,ville);
  await page.addInitScript((r)=>{ try{ localStorage.setItem('vh2:reglages',JSON.stringify({v:1,d:{radius:20,calculRelief:false,...r}})); }catch(e){} },reglages);
  await page.goto('/v2/ar.html'); await page.click('#go');
  await expect.poll(()=>page.evaluate(()=>!!window.__vh2.app.donnees().pos),{timeout:15000}).toBe(true);
  return {ctx,page,erreurs,compte};
}
const cap0=(page)=>page.evaluate(()=>{ for(let i=0;i<120;i++) window.dispatchEvent(new DeviceOrientationEvent('deviceorientationabsolute',{alpha:0,beta:90,gamma:0,absolute:true})); });

test('silhouette : angle exact du bâtiment du nord, le bâtiment du premier plan (60 m) est masqué, la silhouette est dessinée',async({browser})=>{
  const {ctx,page,erreurs}=await ouvrir(browser);
  await expect.poll(()=>page.evaluate(()=>!!window.__vh2.app.donnees().silhouetteUrbaine),{timeout:15000}).toBe(true);
  const r=await page.evaluate(()=>{ const s=window.__vh2.app.donnees().silhouetteUrbaine; return { nb:window.__vh2.app.donnees().batiments.length, ang0:s.ang[0], dist0:s.dist[0], angNe:s.ang[Math.floor(20/0.5)] }; });
  expect(r.nb).toBeGreaterThanOrEqual(3);
  expect(Math.abs(r.ang0-Math.atan2(50-0.0,Math.hypot(280,10))*180/Math.PI)).toBeLessThan(0.15); // le bâtiment de 80 m à 60 m (premier plan de 150 m) ne compte pas
  expect(r.angNe).toBeLessThan(-50); // rien à 20° du nord
  await cap0(page);
  await page.evaluate(()=>window.__vh2.rendreImage());
  const violet=await page.evaluate(()=>{ const c=document.getElementById('ov'), d=c.getContext('2d').getImageData(0,0,c.width,c.height).data; let n=0; for(let i=0;i<d.length;i+=4) if(d[i+3]>60&&d[i+2]>d[i+1]+30&&d[i]>d[i+1]+10) n++; return n; });
  expect(violet).toBeGreaterThan(50);
  await page.evaluate(()=>document.getElementById('btnDbg').click());
  await expect(page.locator('#dbgBody')).toContainText('bâtiment');
  expect(erreurs).toEqual([]); await ctx.close();
});

test('calque éteint : aucun bâtiment n\'est chargé (pas de réseau inutile)',async({browser})=>{
  const {ctx,page,compte,erreurs}=await ouvrir(browser,{reglages:{layers:{urban:false}}});
  await page.waitForTimeout(1500);
  expect(compte.ign).toBe(0); expect(await page.evaluate(()=>window.__vh2.app.donnees().batiments.length)).toBe(0);
  expect(await page.evaluate(()=>window.__vh2.app.donnees().silhouetteUrbaine)).toBeNull();
  expect(erreurs).toEqual([]); await ctx.close();
});

test('IGN refusé : les bâtiments viennent du relais (/bdtopo)',async({browser})=>{
  const {ctx,page,compte,erreurs}=await ouvrir(browser,{ville:{...VILLE,ign:'refuse'}});
  await expect.poll(()=>page.evaluate(()=>!!window.__vh2.app.donnees().silhouetteUrbaine),{timeout:15000}).toBe(true);
  expect(compte.relais).toBeGreaterThan(0);
  expect(erreurs).toEqual([]); await ctx.close();
});

test('hors ligne : après « Télécharger cette zone », bâtiments et rues sont relus de l\'appareil sans réseau ; « Supprimer » les efface',async({browser})=>{
  const {ctx,page,compte,erreurs}=await ouvrir(browser,{reglages:{layers:{urban:false}}});
  await page.route(/^https?:\/\/[^/]*(overpass|maps\.mail\.ru|kumi\.systems|private\.coffee)/,r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({elements:[{type:'node',id:1,lat:48.86,lon:2.35,tags:{name:'Test',place:'village'}}]})}));
  await page.evaluate(()=>document.getElementById('btnSet').click());
  await page.evaluate(()=>document.getElementById('btnZoneDL').click());
  await expect.poll(()=>page.evaluate(()=>window.__vh2.app.infoZone().urbain&&window.__vh2.app.infoZone().urbain.nBatiments),{timeout:30000}).toBeGreaterThanOrEqual(3);
  await expect(page.locator('#zoneInfo')).toContainText('bâtiments');
  const avant=compte.ign;
  await page.unroute(/data\.geopf\.fr/); await page.route(/data\.geopf\.fr|\/bdtopo|openfreemap/,r=>r.abort()); // plus aucun réseau
  await page.evaluate(()=>{ window.__vh2.S.layers.urban=true; return window.__vh2.app.recharger({urbain:true}); });
  await expect.poll(()=>page.evaluate(()=>!!window.__vh2.app.donnees().silhouetteUrbaine),{timeout:15000}).toBe(true);
  expect(compte.ign).toBe(avant);
  await page.evaluate(()=>document.getElementById('btnZoneDel').click());
  await expect.poll(()=>page.evaluate(()=>window.__vh2.app.infoZone().urbain)).toBeNull();
  expect(erreurs).toEqual([]); await ctx.close();
});
