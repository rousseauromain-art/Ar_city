// GPS nettoyé : un fix qui tombe dans un bâtiment (BD TOPO simulée) est ramené dehors ; la puce affiche « ± précision » ; un balcon (œil relevé de plus de 5 m) n'est pas déplacé ; la position simulée n'est pas touchée.
const {test,expect}=require('@playwright/test');
const {installerVille,decaler}=require('../../../tests/commun/ville-simulee.js');

const POS={lat:48.8566,lon:2.3522};
const BATI={N:0,E:0,w:10,l:10,h:20}; // 20 m × 20 m autour de la position GPS
const dist=(a,b)=>Math.hypot((b.lat-a.lat)*111320,(b.lon-a.lon)*111320*Math.cos(a.lat*Math.PI/180));
const dehors=(p)=>{ const N=(p.lat-POS.lat)*111320, E=(p.lon-POS.lon)*111320*Math.cos(POS.lat*Math.PI/180); return Math.abs(N)>10||Math.abs(E)>10; };

async function ouvrir(browser,{obsHeight=0,simOn=false}={}){
  const ctx=await browser.newContext({viewport:{width:915,height:412},deviceScaleFactor:1,hasTouch:true,locale:'fr-FR',baseURL:`http://127.0.0.1:${+(process.env.PORT||4173)}`,permissions:['geolocation','camera'],geolocation:{latitude:POS.lat,longitude:POS.lon,accuracy:8}});
  const page=await ctx.newPage(), erreurs=[]; page.on('pageerror',e=>erreurs.push(String(e)));
  await page.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort());
  await installerVille(page,{pos:POS,batiments:[BATI],rues:[]});
  await page.addInitScript(({obsHeight,simOn})=>{ try{ localStorage.setItem('vh2:reglages',JSON.stringify({v:1,d:{radius:20,calculRelief:false,obsHeight,obsHeightSrc:'main',migrationOeil:1,simOn,simPos:simOn?'48.8000, 2.3000':'',layers:{urban:true}}})); }catch(e){} },{obsHeight,simOn});
  await page.goto('/v2/ar.html'); await page.click('#go');
  await expect.poll(()=>page.evaluate(()=>!!window.__vh2.app.donnees().pos),{timeout:15000}).toBe(true);
  await expect.poll(()=>page.evaluate(()=>window.__vh2.app.donnees().batiments.length),{timeout:15000}).toBeGreaterThan(0);
  return {ctx,page,erreurs};
}
const secouer=async(ctx,n=4)=>{ for(let i=0;i<n;i++){ await ctx.setGeolocation({latitude:POS.lat+(i%2?1:-1)*0.00003,longitude:POS.lon+(i%2?-1:1)*0.00003,accuracy:8}); await new Promise(r=>setTimeout(r,250)); } };

test('un fix dans un bâtiment est ramené dehors (plus de 1,5 m du mur) ; la puce affiche la précision ; le diagnostic explique',async({browser})=>{
  const {ctx,page,erreurs}=await ouvrir(browser);
  await secouer(ctx,6);
  await expect.poll(()=>page.evaluate(()=>window.__vh2.app.donnees().pos).then(dehors),{timeout:10000}).toBe(true);
  const p=await page.evaluate(()=>window.__vh2.app.donnees().pos); expect(dist(POS,p)).toBeGreaterThan(10); expect(dist(POS,p)).toBeLessThan(14);
  await expect(page.locator('#posChip')).toHaveText('± 8 m');
  await page.evaluate(()=>document.getElementById('btnDbg').click());
  await expect(page.locator('#dbgBody')).toContainText('ramenée hors d\'un bâtiment');
  expect(erreurs).toEqual([]); await ctx.close();
});

test('balcon (œil relevé de plus de 5 m) : la position n\'est pas déplacée',async({browser})=>{
  const {ctx,page,erreurs}=await ouvrir(browser,{obsHeight:12});
  await secouer(ctx,6); await page.waitForTimeout(500);
  const p=await page.evaluate(()=>window.__vh2.app.donnees().pos); expect(dehors(p)).toBe(false); expect(dist(POS,p)).toBeLessThan(5);
  expect(erreurs).toEqual([]); await ctx.close();
});

test('position simulée : jamais touchée par le GPS ni par le nettoyage',async({browser})=>{
  const {ctx,page,erreurs}=await ouvrir(browser,{simOn:true}).catch(async(e)=>{ throw e; });
  const p=await page.evaluate(()=>window.__vh2.app.donnees().pos); expect(Math.abs(p.lat-48.8)).toBeLessThan(0.0005);
  await secouer(ctx,4); const q=await page.evaluate(()=>window.__vh2.app.donnees().pos); expect(q).toEqual(p);
  expect(erreurs).toEqual([]); await ctx.close();
});
