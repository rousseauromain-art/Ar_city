// Relief en direct : le GPS d'un téléphone bouge de quelques mètres à chaque fix pendant que le relief se calcule. Les tuiles sont simulées (une tuile plate de 0 m, servie avec un retard :
// la position change pendant le chargement). Avant le correctif, chaque publication était jetée (`encore(pos)` exigeait la même position à la virgule près) : jamais de relief.
const {test,expect}=require('@playwright/test');
const zlib=require('zlib');

/** PNG 1×1 « niveau de la mer » (Terrarium : R=128, V=0, B=0), étiré par le décodeur à la taille de la tuile. */
function png1x1(){
  const crcTable=Array.from({length:256},(_,n)=>{ let c=n; for(let k=0;k<8;k++) c=c&1?0xedb88320^(c>>>1):c>>>1; return c>>>0; });
  const crc=b=>{ let c=0xffffffff; for(const x of b) c=crcTable[(c^x)&255]^(c>>>8); return (c^0xffffffff)>>>0; };
  const bloc=(type,data)=>{ const t=Buffer.from(type), l=Buffer.alloc(4), c=Buffer.alloc(4); l.writeUInt32BE(data.length); c.writeUInt32BE(crc(Buffer.concat([t,data]))); return Buffer.concat([l,t,data,c]); };
  const ihdr=Buffer.alloc(13); ihdr.writeUInt32BE(1,0); ihdr.writeUInt32BE(1,4); ihdr[8]=8; ihdr[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),bloc('IHDR',ihdr),bloc('IDAT',zlib.deflateSync(Buffer.from([0,128,0,0,255]))),bloc('IEND',Buffer.alloc(0))]);
}

async function ouvrir(browser,{retardTuileMs=80,tuilesEnPanne=false}={}){
  const ctx=await browser.newContext({viewport:{width:915,height:412},deviceScaleFactor:2,hasTouch:true,locale:'fr-FR',timezoneId:'Europe/Paris',baseURL:`http://127.0.0.1:${+(process.env.PORT||4173)}`,permissions:['geolocation','camera'],geolocation:{latitude:48.6459,longitude:-2.0281,accuracy:10}});
  const page=await ctx.newPage(), erreurs=[]; page.on('pageerror',e=>erreurs.push(String(e)));
  await page.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort());
  const tuile=png1x1(); let tuiles=0;
  if(!tuilesEnPanne) await page.route(/tiles\.mapterhorn\.com\/.*\.webp$/,async r=>{ tuiles++; await new Promise(ok=>setTimeout(ok,retardTuileMs)); await r.fulfill({status:200,contentType:'image/png',body:tuile}); });
  await page.addInitScript(()=>{ try{ localStorage.setItem('vh2:reglages',JSON.stringify({v:1,d:{radius:20,calculRelief:true,skyline:true,relief:true}})); }catch(e){} });
  await page.goto('/v2/ar.html');
  return {ctx,page,erreurs,nbTuiles:()=>tuiles};
}

/** Un GPS réaliste : une nouvelle position, à quelques mètres près, toutes les 400 ms. */
const secouerGps=(ctx)=>{ let n=0; const id=setInterval(()=>{ n++; ctx.setGeolocation({latitude:48.6459+Math.sin(n)*0.00003,longitude:-2.0281+Math.cos(n*1.3)*0.00003,accuracy:8}).catch(()=>{}); },400); return ()=>clearInterval(id); };

test('direct : le relief est publié même quand le GPS bouge de quelques mètres pendant le calcul',async({browser})=>{
  const {ctx,page,erreurs,nbTuiles}=await ouvrir(browser), arreter=secouerGps(ctx);
  await page.click('#go');
  await expect.poll(()=>page.evaluate(()=>!!window.__vh2.app.donnees().pos),{timeout:15000}).toBe(true);
  await expect.poll(()=>page.evaluate(()=>{ const d=window.__vh2.app.donnees(); return !!d.terrain&&typeof d.terrain.h0==='number'; }),{timeout:40000,message:'le relief aurait dû être publié malgré le bruit du GPS'}).toBe(true);
  expect(nbTuiles()).toBeGreaterThan(0);
  expect(await page.evaluate(()=>window.__vh2.app.etat().etatRelief)).toMatch(/ok|calcul/);
  arreter(); expect(erreurs).toEqual([]); await ctx.close();
});

test('direct : « Recalculer le relief » relance le calcul et la note dit l’état réel',async({browser})=>{
  const {ctx,page,erreurs,nbTuiles}=await ouvrir(browser,{retardTuileMs:20}), arreter=secouerGps(ctx);
  await page.click('#go');
  await expect.poll(()=>page.evaluate(()=>{ const d=window.__vh2.app.donnees(); return !!d.terrain; }),{timeout:40000}).toBe(true);
  await expect.poll(()=>page.evaluate(()=>window.__vh2.app.etat().etatRelief),{timeout:40000}).toBe('ok');
  const avant=nbTuiles();
  await page.evaluate(()=>document.getElementById('btnSky').click());
  await expect(page.locator('#note')).toContainText(/relief/i,{timeout:5000});
  await expect.poll(()=>page.evaluate(()=>window.__vh2.app.etat().etatRelief),{timeout:40000}).toBe('ok');
  expect(await page.evaluate(()=>!!window.__vh2.app.donnees().terrain)).toBe(true);
  expect(nbTuiles(),'le bouton relit les tuiles').toBeGreaterThanOrEqual(avant);
  arreter(); expect(erreurs).toEqual([]); await ctx.close();
});

test('direct : tuiles injoignables : « indisponible » est annoncé, sans acharnement à chaque fix GPS, et le bouton réessaie',async({browser})=>{
  const {ctx,page,erreurs}=await ouvrir(browser,{tuilesEnPanne:true}), arreter=secouerGps(ctx);
  await page.click('#go');
  await expect.poll(()=>page.evaluate(()=>window.__vh2.app.etat().etatRelief),{timeout:60000}).toBe('indispo');
  const n1=await page.evaluate(()=>performance.getEntriesByType('resource').length);
  await page.waitForTimeout(3000); // plusieurs fix GPS : le recul empêche de relancer le relief à chacun
  const n2=await page.evaluate(()=>performance.getEntriesByType('resource').length);
  expect(n2-n1,'pas de nouvelle rafale de requêtes pendant le recul').toBeLessThan(40);
  await page.evaluate(()=>document.getElementById('btnSky').click());
  await expect(page.locator('#note')).toContainText(/indisponible|calcul/,{timeout:5000});
  arreter(); expect(erreurs).toEqual([]); await ctx.close();
});
