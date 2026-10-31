// Direct : calage sur le soleil et pointage au doigt, avec une VIDÉO synthétique (canvas.captureStream) où un disque blanc est peint exactement là où le soleil calculé doit apparaître,
// alors que la boussole simulée est fausse de 4° (et de 50° pour le cas « en voiture » : au-delà de la fenêtre de recherche de 37,5° ; vitesse GPS > 3 m/s : mode large).
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

test('direct : le bouton cible (« Caler auto ») cale sur le soleil de la vidéo et corrige la boussole fausse de 4°',async({browser})=>{
  const {ctx,page,erreurs,sol}=await ouvrir(browser);
  const avant=await page.evaluate(()=>window.__vh2.pose().capDeg); expect(avant).toBeCloseTo(sol.azDeg+4,0);
  await page.evaluate(()=>document.getElementById('btnAlign').click());
  await expect(page.locator('#note')).toContainText('calé sur le soleil',{timeout:8000});
  const apres=await page.evaluate(()=>window.__vh2.pose().capDeg+0);
  expect(await page.evaluate(()=>window.__vh2.S.headOff)).toBeCloseTo(-4,0); // la correction annule l'erreur de la boussole
  expect(erreurs).toEqual([]); await ctx.close();
});

test('direct : le pointage au doigt sur le soleil corrige aussi le cap',async({browser})=>{
  const {ctx,page,erreurs}=await ouvrir(browser);
  await page.evaluate(()=>document.getElementById('btnPoint').click());
  const p=await page.evaluate(()=>{ const r=document.getElementById('ov').getBoundingClientRect(), s=window.__soleilEcran; return {x:r.left+s.x,y:r.top+s.y}; });
  await page.mouse.click(p.x,p.y);
  await expect(page.locator('#note')).toContainText(/soleil|calé|cap/i,{timeout:5000});
  expect(Math.abs(await page.evaluate(()=>window.__vh2.S.headOff))).toBeGreaterThan(1);
  expect(erreurs).toEqual([]); await ctx.close();
});

test('direct en voiture (vitesse GPS 15 m/s) : le soleil est trouvé même avec une boussole fausse de 50°',async({browser})=>{
  const {ctx,page,erreurs}=await ouvrir(browser,{erreurCompas:50,vitesse:15});
  await expect.poll(()=>page.evaluate(()=>window.__vh2.entree.etat().vitesseMs),{timeout:8000}).toBe(15);
  await page.evaluate(()=>document.getElementById('btnAlign').click());
  await expect(page.locator('#note')).toContainText('calé sur le soleil',{timeout:8000});
  expect(await page.evaluate(()=>window.__vh2.S.headOff)).toBeCloseTo(-50,0);
  expect(erreurs).toEqual([]); await ctx.close();
});

test('contrôle : à l’arrêt, une boussole fausse de 50° sort de la fenêtre de recherche (pas de calage sur le soleil)',async({browser})=>{
  const {ctx,page,erreurs}=await ouvrir(browser,{erreurCompas:50});
  await page.evaluate(()=>document.getElementById('btnAlign').click());
  await expect(page.locator('#note')).not.toContainText('calé sur le soleil',{timeout:8000});
  await page.waitForTimeout(1500);
  expect(await page.evaluate(()=>window.__vh2.S.headOff)).not.toBeCloseTo(-50,0);
  expect(erreurs).toEqual([]); await ctx.close();
});

test('direct : le pointage sur le disque du soleil vu dans l’image marche même avec une boussole fausse de 30° (au-delà de la fenêtre de 12°)',async({browser})=>{
  const {ctx,page,erreurs}=await ouvrir(browser,{erreurCompas:30});
  await page.evaluate(()=>document.getElementById('btnPoint').click());
  const p=await page.evaluate(()=>{ const r=document.getElementById('ov').getBoundingClientRect(), s=window.__soleilEcran; return {x:r.left+s.x,y:r.top+s.y}; });
  await page.mouse.click(p.x,p.y);
  await expect(page.locator('#note')).toContainText('calé sur le soleil',{timeout:5000});
  expect(await page.evaluate(()=>window.__vh2.S.headOff)).toBeCloseTo(-30,0);
  expect(erreurs).toEqual([]); await ctx.close();
});
