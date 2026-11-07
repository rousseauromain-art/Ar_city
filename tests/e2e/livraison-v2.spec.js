// Version publiée de la v2 (construction/construire.mjs) : un seul fichier regroupé, workers regroupés joignables par new URL(..., import.meta.url),
// relief et silhouette calculés sur cette version, ?modules=1 = modules bruts, service worker : la page s'ouvre sans réseau.
// Sans SITE_DIR, le test construit dist/ et l'ouvre sous /dist/ (le serveur de test sert le dépôt) ; avec SITE_DIR=dist, le site construit est servi à la racine.
const {test,expect}=require('@playwright/test');
const path=require('path');
const zlib=require('zlib');
const {installerVille}=require('../helpers/ville-simulee.js');

const BASE=process.env.SITE_DIR?'':'/dist';
const PORT=+(process.env.PORT||4173);
test.beforeAll(async()=>{ if(!process.env.SITE_DIR){ const {construire}=await import('../../construction/construire.mjs'); await construire(path.resolve(__dirname,'..','..','dist')); } });

/** PNG 1×1 « niveau de la mer » (même tuile que relief-direct-v2.spec.js). */
function png1x1(){
  const crcTable=Array.from({length:256},(_,n)=>{ let c=n; for(let k=0;k<8;k++) c=c&1?0xedb88320^(c>>>1):c>>>1; return c>>>0; });
  const crc=b=>{ let c=0xffffffff; for(const x of b) c=crcTable[(c^x)&255]^(c>>>8); return (c^0xffffffff)>>>0; };
  const bloc=(type,data)=>{ const t=Buffer.from(type), l=Buffer.alloc(4), c=Buffer.alloc(4); l.writeUInt32BE(data.length); c.writeUInt32BE(crc(Buffer.concat([t,data]))); return Buffer.concat([l,t,data,c]); };
  const ihdr=Buffer.alloc(13); ihdr.writeUInt32BE(1,0); ihdr.writeUInt32BE(1,4); ihdr[8]=8; ihdr[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),bloc('IHDR',ihdr),bloc('IDAT',zlib.deflateSync(Buffer.from([0,128,0,0,255]))),bloc('IEND',Buffer.alloc(0))]);
}

async function ouvrir(browser,{url=`${BASE}/v2/ar.html`,pos={latitude:48.6459,longitude:-2.0281},reglages={radius:20,calculRelief:true,skyline:true,relief:true},ville=null}={}){
  const ctx=await browser.newContext({viewport:{width:915,height:412},hasTouch:true,locale:'fr-FR',baseURL:`http://127.0.0.1:${PORT}`,permissions:['geolocation','camera'],geolocation:{...pos,accuracy:8}});
  const page=await ctx.newPage(), erreurs=[], requetes=[];
  page.on('pageerror',e=>erreurs.push(String(e))); page.on('request',r=>requetes.push(new URL(r.url()).pathname));
  await page.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort());
  await page.route(/tiles\.mapterhorn\.com\/.*\.webp$/,r=>r.fulfill({status:200,contentType:'image/png',body:png1x1()}));
  if(ville) await installerVille(page,ville);
  await page.addInitScript((r)=>{ try{ if(!localStorage.getItem('vh2:reglages')) localStorage.setItem('vh2:reglages',JSON.stringify({v:1,d:r})); }catch(e){} },reglages);
  await page.goto(url);
  await expect.poll(()=>page.evaluate(()=>!!window.__vh2),{timeout:15000}).toBe(true);
  return {ctx,page,erreurs,requetes};
}

test('version regroupée : code et style dans la page (une réponse, comme la v1), aucun module brut, relief calculé par le worker regroupé',async({browser})=>{
  const {ctx,page,erreurs,requetes}=await ouvrir(browser);
  expect(requetes.filter(p=>p.startsWith(`${BASE}/src/`))).toEqual([]);
  expect(requetes.filter(p=>/\.(js|css)$/.test(p)).sort()).toEqual(['/config.js'].map(p=>BASE+p)); // le code et le style sont dans la page ; les workers ne démarrent qu'au premier calcul
  await page.click('#go');
  await expect.poll(()=>page.evaluate(()=>{ const d=window.__vh2.app.donnees(); return !!d.terrain&&typeof d.terrain.h0==='number'; }),{timeout:40000}).toBe(true);
  expect(requetes).toContain(`${BASE}/b/workers/masque-relief.js`);
  expect(erreurs).toEqual([]); await ctx.close();
});

test('version regroupée : silhouette des bâtiments calculée par le worker regroupé',async({browser})=>{
  const POS={lat:48.8566,lon:2.3522};
  const ville={pos:POS,batiments:[{N:300,E:0,w:30,l:20,h:51.6},{N:900,E:200,w:40,l:40,h:30}],rues:[]};
  const {ctx,page,erreurs,requetes}=await ouvrir(browser,{pos:{latitude:POS.lat,longitude:POS.lon},reglages:{radius:20,calculRelief:false,layers:{urban:true}},ville});
  await page.click('#go');
  await expect.poll(()=>page.evaluate(()=>!!window.__vh2.app.donnees().silhouetteUrbaine),{timeout:20000}).toBe(true);
  const ang0=await page.evaluate(()=>window.__vh2.app.donnees().silhouetteUrbaine.ang[0]);
  expect(Math.abs(ang0-Math.atan2(50,Math.hypot(280,10))*180/Math.PI)).toBeLessThan(0.15);
  expect(requetes).toContain(`${BASE}/b/workers/silhouette-batiments.js`);
  expect(erreurs).toEqual([]); await ctx.close();
});

test('?modules=1 charge les modules bruts (débogage)',async({browser})=>{
  const {ctx,page,erreurs,requetes}=await ouvrir(browser,{url:`${BASE}/v2/ar.html?modules=1`});
  expect(requetes).toContain(`${BASE}/src/ui/page-ar.js`);
  expect(requetes.filter(p=>p.startsWith(`${BASE}/src/`)).length).toBeGreaterThan(50);
  expect(erreurs).toEqual([]); await ctx.close();
});

test('service worker : la page et le fichier regroupé sont gardés, l’appli s’ouvre sans réseau (direct et photo)',async({browser})=>{
  const {ctx,page,erreurs}=await ouvrir(browser);
  await page.evaluate(async()=>{ await navigator.serviceWorker.ready; });
  await expect.poll(()=>page.evaluate(async()=>{ const ks=await caches.keys(), k=ks.find(x=>x.startsWith('site-v2-')); return k?(await (await caches.open(k)).keys()).length:0; }),{timeout:15000}).toBeGreaterThanOrEqual(6);
  await ctx.setOffline(true);
  for(const u of [`${BASE}/v2/ar.html`,`${BASE}/v2/ar.html?mode=photo`]){
    await page.goto(u);
    await expect.poll(()=>page.evaluate(()=>!!window.__vh2),{timeout:15000}).toBe(true);
  }
  expect(erreurs).toEqual([]); await ctx.close();
});
