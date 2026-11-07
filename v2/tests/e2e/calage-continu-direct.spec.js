// Recalage continu sur le soleil : case cochée, vidéo synthétique avec un disque de soleil, boussole fausse de 4° : le cap converge tout seul vers le bon, sans aucun clic.
const {test,expect}=require('@playwright/test');

const LAT=48.6459, LON=-2.0281, UTC='2026-10-25T16:30:00Z';

async function ouvrir(browser,{erreurCompas=4,vitesse=null}={}){
  const ctx=await browser.newContext({viewport:{width:640,height:360},deviceScaleFactor:1,hasTouch:true,baseURL:`http://127.0.0.1:${+(process.env.PORT||4173)}`,permissions:['geolocation','camera'],geolocation:{latitude:LAT,longitude:LON,accuracy:8}});
  const page=await ctx.newPage(), erreurs=[]; page.on('pageerror',e=>erreurs.push(String(e)));
  await page.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort());
  await page.addInitScript(()=>{ try{ localStorage.setItem('vh2:reglages',JSON.stringify({v:1,d:{radius:20,calculRelief:false,relief:false,skyline:false}})); }catch(e){} });
  if(vitesse!==null) await page.addInitScript((v)=>{ const w=navigator.geolocation.watchPosition.bind(navigator.geolocation); navigator.geolocation.watchPosition=(ok,ko,o)=>w((p)=>ok({coords:{latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy,altitude:null,altitudeAccuracy:null,speed:v},timestamp:p.timestamp}),ko,o); },vitesse);
  await page.clock.setFixedTime(new Date(UTC));
  await page.goto('/v2/ar.html'); await page.click('#go');
  await expect.poll(()=>page.evaluate(()=>!!window.__vh2.app.donnees().pos),{timeout:15000}).toBe(true);
  const {positionSoleil}=await import('../../src/noyau/astro.js'), sol=positionSoleil(Date.parse(UTC),LAT,LON);
  // capteurs : le téléphone est tourné vers le soleil, mais la boussole se trompe de `erreurCompas`°
  await page.evaluate(({cap})=>{ for(let i=0;i<200;i++) window.dispatchEvent(new DeviceOrientationEvent('deviceorientationabsolute',{alpha:(360-cap+360)%360,beta:90,gamma:0,absolute:true})); },{cap:(sol.azDeg+erreurCompas+360)%360});
  // vidéo synthétique : ciel bleu, disque blanc au bon endroit (le vrai cap est celui du soleil : centre de l'image ; horizon à 0° d'inclinaison)
  await page.evaluate(({el})=>{
    const W=640,H=360,c=document.createElement('canvas'); c.width=W; c.height=H; const x=c.getContext('2d'), v=document.getElementById('cam');
    const fh=(W/2)/Math.tan(window.__vh2.vFov()/2*Math.PI/180), y=H/2-fh*Math.tan(el*Math.PI/180);
    const peindre=()=>{ x.fillStyle='rgb(120,160,220)'; x.fillRect(0,0,W,H); x.fillStyle='#fff'; x.beginPath(); x.arc(W/2,y,6,0,7); x.fill(); };
    peindre(); setInterval(peindre,50); v.srcObject=c.captureStream(20); v.play().catch(()=>{}); window.__soleilEcran={x:W/2,y};
  },{el:sol.elDeg});
  await expect.poll(()=>page.evaluate(()=>{ const v=document.getElementById('cam'); return v.videoWidth>0&&!v.paused; }),{timeout:10000}).toBe(true);
  return {ctx,page,erreurs,sol};
}


test('recalage continu : la boussole fausse de 4° est corrigée toute seule, par pas, sans rien toucher',async({browser})=>{
  const {ctx,page,erreurs}=await ouvrir(browser);
  await page.evaluate(()=>{ const c=document.getElementById('calCont'); c.checked=true; c.dispatchEvent(new Event('change',{bubbles:true})); });
  expect(await page.evaluate(()=>window.__vh2.S.calageContinu)).toBe(true);
  // premier pas : après 2 détections concordantes espacées de 3 s
  await expect.poll(()=>page.evaluate(()=>window.__vh2.S.headOff),{timeout:30000,message:'un premier pas doit corriger le cap'}).toBeLessThan(-1.5);
  const apres1=await page.evaluate(()=>window.__vh2.S.headOff); expect(apres1).toBeGreaterThan(-3); // demi-pas de 4° : environ −2°
  await expect.poll(()=>page.evaluate(()=>window.__vh2.S.headOff),{timeout:60000,message:'puis il converge vers −4°'}).toBeLessThan(-3.3);
  expect(await page.evaluate(()=>window.__vh2.S.headOff)).toBeGreaterThan(-4.3);
  expect(await page.evaluate(()=>document.getElementById('note').textContent+'')).toBeDefined();
  expect(erreurs).toEqual([]); await ctx.close();
});

test('recalage continu éteint par défaut : le cap ne bouge pas tout seul',async({browser})=>{
  const {ctx,page,erreurs}=await ouvrir(browser);
  expect(await page.evaluate(()=>window.__vh2.S.calageContinu)).toBe(false);
  await page.waitForTimeout(8000); expect(await page.evaluate(()=>window.__vh2.S.headOff)).toBe(0);
  expect(erreurs).toEqual([]); await ctx.close();
});
