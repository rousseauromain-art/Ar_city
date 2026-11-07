// Calage guidé : le bouton cible dit où viser (le soleil est hors du champ), puis calé tout seul dès que la cible est dans le champ ; second toucher : annule.
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


const orienter=(page,cap)=>page.evaluate(({cap})=>{ for(let i=0;i<200;i++) window.dispatchEvent(new DeviceOrientationEvent('deviceorientationabsolute',{alpha:(360-cap+360)%360,beta:90,gamma:0,absolute:true})); },{cap});

test('guidage : soleil hors du champ → consigne « tournez… », puis calage automatique quand on le vise',async({browser})=>{
  const {ctx,page,erreurs,sol}=await ouvrir(browser,{erreurCompas:0});
  await orienter(page,(sol.azDeg+120)%360); // le téléphone regarde 120° à côté du soleil
  await page.evaluate(()=>document.getElementById('btnAlign').click());
  await expect(page.locator('#guideMsg')).toBeVisible({timeout:3000});
  await expect(page.locator('#guideMsg')).toContainText(/Visez le soleil : tournez de 1\d\d° vers la (droite|gauche)/);
  expect(await page.evaluate(()=>window.__vh2.S.headOff)).toBe(0); // rien n'est calé tant que la cible n'est pas dans le champ
  await orienter(page,(sol.azDeg+3)%360); // on vise le soleil, boussole fausse de 3°
  await expect(page.locator('#note')).toContainText('calé sur le soleil',{timeout:9000});
  await expect(page.locator('#guideMsg')).toBeHidden();
  expect(await page.evaluate(()=>window.__vh2.S.headOff)).toBeCloseTo(-3,0);
  expect(erreurs).toEqual([]); await ctx.close();
});

test('guidage : un second toucher sur le bouton annule',async({browser})=>{
  const {ctx,page,erreurs,sol}=await ouvrir(browser,{erreurCompas:0});
  await orienter(page,(sol.azDeg+150)%360);
  await page.evaluate(()=>document.getElementById('btnAlign').click());
  await expect(page.locator('#guideMsg')).toBeVisible({timeout:3000});
  await page.evaluate(()=>document.getElementById('btnAlign').click());
  await expect(page.locator('#guideMsg')).toBeHidden(); await expect(page.locator('#note')).toContainText('annulé');
  expect(erreurs).toEqual([]); await ctx.close();
});

test('« Caler » cale tout de suite sur ce qui est devant (comme la v1), sans guidage ; un second toucher lance le guidage',async({browser})=>{
  const {ctx,page,erreurs}=await ouvrir(browser,{erreurCompas:4}); // le soleil est dans le champ, la boussole se trompe de 4°
  await page.evaluate(()=>document.getElementById('btnAlign').click());
  await expect(page.locator('#note')).toContainText('calé sur le soleil',{timeout:9000});
  await expect(page.locator('#guideMsg')).toBeHidden();
  expect(await page.evaluate(()=>window.__vh2.S.headOff)).toBeCloseTo(-4,0); // la boussole lit 4° de trop : correction de −4°
  await page.evaluate(()=>document.getElementById('btnAlign').click()); // second toucher : le guidage
  await expect(page.locator('#guideMsg')).toBeVisible({timeout:3000});
  await page.evaluate(()=>document.getElementById('btnAlign').click()); // et un troisième l'annule
  await expect(page.locator('#guideMsg')).toBeHidden();
  expect(erreurs).toEqual([]); await ctx.close();
});

test('boussole douteuse (en voiture) : jamais de guidage, ni après un échec ni au second toucher',async({browser})=>{
  const {ctx,page,erreurs,sol}=await ouvrir(browser,{erreurCompas:0,vitesse:12});
  await orienter(page,(sol.azDeg+150)%360); // le soleil n'est pas dans l'image : le calage échoue
  await page.evaluate(()=>document.getElementById('btnAlign').click());
  await expect.poll(()=>page.evaluate(()=>document.getElementById('btnAlign').classList.contains('on')),{timeout:20000}).toBe(false);
  await expect(page.locator('#guideMsg')).toBeHidden();
  await page.evaluate(()=>document.getElementById('btnAlign').click());
  await expect.poll(()=>page.evaluate(()=>document.getElementById('btnAlign').classList.contains('on')),{timeout:20000}).toBe(false);
  await expect(page.locator('#guideMsg')).toBeHidden();
  expect(erreurs).toEqual([]); await ctx.close();
});
