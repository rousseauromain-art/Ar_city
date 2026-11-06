// Calage sur les toits (bâtiments BD TOPO simulés, image de la caméra synthétique : la ville vue depuis la vraie position) : boussole fausse de 30° → cap à ±0,5° ; position décalée de 10 m → corrigée à ±4 m (essai).
const {test,expect}=require('@playwright/test');
const {installerVille,decaler}=require('../helpers/ville-simulee.js');

const VRAIE={lat:48.8566,lon:2.3522}, UTC='2026-11-05T12:00:00Z', CAP_VRAI=130;
const alea=(g)=>{ let a=(g*2654435761)>>>0; return ()=>{ a=(a+0x6D2B79F5)>>>0; let t=Math.imul(a^(a>>>15),1|a); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; }; };
/** Ville irrégulière : 140 immeubles et tours, 100 à 420 m. */
const ville=(g)=>{ const r=alea(g); return Array.from({length:140},()=>{ const rho=100+r()*320, th=r()*2*Math.PI; return {N:rho*Math.cos(th),E:rho*Math.sin(th),w:6+r()*16,l:6+r()*16,h:10+r()*50}; }); };

async function table(bats){
  const {silhouetteBrute}=await import('../../src/scene/silhouette-batiments.js');
  const polys=bats.map(b=>{ const pts=new Float64Array(8); [[-b.l,-b.w],[-b.l,b.w],[b.l,b.w],[b.l,-b.w]].forEach(([dn,de],j)=>{ const p=decaler(VRAIE,b.N+dn,b.E+de); pts[2*j]=p.lat; pts[2*j+1]=p.lon; }); return {h:b.h,pts}; });
  return Array.from(silhouetteBrute(polys,{pos:VRAIE,oeilRelM:1.6,h0:null,courbure:true,distMinM:3}).ang);
}

async function ouvrir(browser,{decalage=null,positionToits=false}={}){
  const bats=ville(1), tab=await table(bats), gps=decalage?decaler(VRAIE,decalage[0],decalage[1]):VRAIE;
  const ctx=await browser.newContext({viewport:{width:640,height:360},deviceScaleFactor:1,hasTouch:true,locale:'fr-FR',baseURL:`http://127.0.0.1:${+(process.env.PORT||4173)}`,permissions:['geolocation','camera'],geolocation:{latitude:gps.lat,longitude:gps.lon,accuracy:8}});
  const page=await ctx.newPage(), erreurs=[]; page.on('pageerror',e=>erreurs.push(String(e)));
  await page.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort());
  await installerVille(page,{pos:VRAIE,batiments:bats,rues:[],lieux:[{nom:'Paris',classe:'city',population:2200000,N:300,E:300}]});
  await page.addInitScript((positionToits)=>{ try{ localStorage.setItem('vh2:reglages',JSON.stringify({v:1,d:{radius:20,calculRelief:false,relief:false,skyline:false,positionToits}})); }catch(e){} },positionToits);
  await page.clock.setFixedTime(new Date(UTC));
  await page.goto('/v2/ar.html'); await page.click('#go');
  await expect.poll(()=>page.evaluate(()=>!!window.__vh2.app.donnees().pos),{timeout:15000}).toBe(true);
  await expect.poll(()=>page.evaluate(()=>window.__vh2.app.donnees().lieux.some(l=>l.kind==='city'&&l.pop>=100000)),{timeout:15000}).toBe(true); // ville dense : une grande ville à moins de 6 km
  // capteurs : la boussole se trompe de 30°
  await page.evaluate(({cap})=>{ for(let i=0;i<200;i++) window.dispatchEvent(new DeviceOrientationEvent('deviceorientationabsolute',{alpha:(360-cap+360)%360,beta:90,gamma:0,absolute:true})); },{cap:(CAP_VRAI+30)%360});
  // caméra synthétique : la silhouette des toits vue depuis la vraie position, le téléphone étant réellement dirigé vers CAP_VRAI (ciel gris clair, sans disque de soleil)
  await page.evaluate(({tab,capVrai})=>{
    const W=640,H=360,c=document.createElement('canvas'); c.width=W; c.height=H; const x=c.getContext('2d'), v=document.getElementById('cam'), D=Math.PI/180;
    const fh=(W/2)/Math.tan(window.__vh2.vFov()/2*D), im=x.createImageData(W,H), plan=(v)=>Math.max(-0.1,v>-50?v:-0.1), el=(b)=>{ const f=(((b%360)+360)%360)/0.1, i=Math.floor(f)%3600, u=f-Math.floor(f); return plan(tab[i])*(1-u)+plan(tab[(i+1)%3600])*u; };
    for(let py=0;py<H;py++) for(let px=0;px<W;px++){ const brg=capVrai+Math.atan((px-W/2)/fh)/D, e=-Math.atan((py-H/2)/fh)/D, ciel=e>el(brg), k=(py*W+px)*4; im.data[k]=ciel?205:50; im.data[k+1]=ciel?208:55; im.data[k+2]=ciel?215:60; im.data[k+3]=255; }
    x.putImageData(im,0,0); setInterval(()=>x.putImageData(im,0,0),60); v.srcObject=c.captureStream(15); v.play().catch(()=>{});
  },{tab,capVrai:CAP_VRAI});
  await expect.poll(()=>page.evaluate(()=>{ const v=document.getElementById('cam'); return v.videoWidth>0&&!v.paused; }),{timeout:10000}).toBe(true);
  return {ctx,page,erreurs};
}

test('en ville de jour : « Caler auto » cale le cap sur les toits à ±0,5° malgré une boussole fausse de 30°',async({browser})=>{
  const {ctx,page,erreurs}=await ouvrir(browser);
  const m=await page.evaluate(()=>window.__vh2.calerAuto());
  expect(m).toMatch(/calé sur les toits/);
  const dh=await page.evaluate(()=>window.__vh2.S.headOff); expect(Math.abs(dh+30)).toBeLessThan(0.5);
  expect(Math.abs(await page.evaluate(()=>window.__vh2.pose().capDeg)-CAP_VRAI)).toBeLessThan(0.5);
  expect(await page.evaluate(()=>window.__vh2.carnet.lire().mesures.map(x=>x.src))).toContain('auto toits');
  expect(erreurs).toEqual([]); await ctx.close();
});

test('position par les toits (essai) : un GPS décalé de 10 m est corrigé à ±4 m, la position suit les pas, le GPS ne la reprend pas aussitôt',async({browser})=>{
  const {ctx,page,erreurs}=await ouvrir(browser,{decalage:[7,-7],positionToits:true});
  const dist=(p)=>Math.hypot((p.lat-VRAIE.lat)*111320,(p.lon-VRAIE.lon)*111320*Math.cos(VRAIE.lat*Math.PI/180));
  expect(dist(await page.evaluate(()=>window.__vh2.app.donnees().pos))).toBeGreaterThan(8);
  const m=await page.evaluate(()=>window.__vh2.calerAuto());
  expect(m).toMatch(/calé sur les toits/); expect(m).toMatch(/position corrigée par les toits \(\d+ m\)/);
  expect(dist(await page.evaluate(()=>window.__vh2.app.donnees().pos))).toBeLessThanOrEqual(4);
  // 10 pas vers le cap : la position corrigée avance de 7 m (la scène n'est relancée qu'au-delà de 5 m)
  const avant=await page.evaluate(()=>window.__vh2.app.donnees().pos);
  await page.evaluate(()=>{ window.__t=Date.now(); Date.now=()=>window.__t; }); // l'horloge est figée dans ce test : on la fait avancer à la main (un pas toutes les 400 ms)
  for(let i=0;i<10;i++){ for(const z of [9.8,9.8,15,9.8,9.8,9.8,9.8,9.8]) await page.evaluate((z)=>{ window.__t+=50; window.dispatchEvent(Object.assign(new Event('devicemotion'),{accelerationIncludingGravity:{x:0,y:0,z}})); },z); }
  const apres=await page.evaluate(()=>window.__vh2.app.donnees().pos), d=Math.hypot((apres.lat-avant.lat)*111320,(apres.lon-avant.lon)*111320*Math.cos(VRAIE.lat*Math.PI/180));
  expect(d).toBeGreaterThan(5); expect(d).toBeLessThan(8);
  await page.evaluate(()=>document.getElementById('btnDbg').click());
  await expect(page.locator('#dbgBody')).toContainText('position corrigée (toits)');
  expect(erreurs).toEqual([]); await ctx.close();
});
