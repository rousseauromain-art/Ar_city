// Calage sur l'axe de la rue (rues et bâtiments simulés) : la boussole est fausse de 30°, la rue la ramène à ±1°, l'axe est tracé au sol, le carnet garde une entrée « rue » ; carrefour et boussole douteuse : boutons.
const {test,expect}=require('@playwright/test');
const {installerVille}=require('../helpers/ville-simulee.js');

const POS={lat:48.8566,lon:2.3522};
async function nuit(){ const {positionSoleil,positionLune}=await import('../../src/noyau/astro.js'); for(let h=0;h<24;h++){ const t=Date.UTC(2026,10,5,h); if(positionSoleil(t,POS.lat,POS.lon).elDeg<-8&&positionLune(t,POS.lat,POS.lon).elDeg<-2) return t; } throw new Error('pas de nuit sans lune'); }

async function ouvrir(browser,{rues,vitesse=null,capAffiche}){
  const t=await nuit();
  const ctx=await browser.newContext({viewport:{width:915,height:412},deviceScaleFactor:1,hasTouch:true,locale:'fr-FR',baseURL:`http://127.0.0.1:${+(process.env.PORT||4173)}`,permissions:['geolocation','camera'],geolocation:{latitude:POS.lat,longitude:POS.lon,accuracy:8}});
  const page=await ctx.newPage(), erreurs=[]; page.on('pageerror',e=>erreurs.push(String(e)));
  await page.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort());
  await installerVille(page,{pos:POS,batiments:[],rues,lieux:[{nom:'Paris',classe:'city',population:2200000,N:500,E:500}]});
  if(vitesse!==null) await page.addInitScript((v)=>{ const w=navigator.geolocation.watchPosition.bind(navigator.geolocation); navigator.geolocation.watchPosition=(ok,ko,o)=>w((p)=>ok({coords:{latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy,altitude:null,altitudeAccuracy:null,speed:v,heading:null,altitudeAccuracy2:null},timestamp:p.timestamp}),ko,o); },vitesse);
  await page.addInitScript(()=>{ try{ localStorage.setItem('vh2:reglages',JSON.stringify({v:1,d:{radius:20,calculRelief:false,relief:false,skyline:false}})); }catch(e){} });
  await page.clock.setFixedTime(new Date(t));
  await page.goto('/v2/ar.html'); await page.click('#go');
  await expect.poll(()=>page.evaluate(()=>!!window.__vh2.app.donnees().pos),{timeout:15000}).toBe(true);
  await expect.poll(()=>page.evaluate(()=>window.__vh2.app.donnees().rues.length),{timeout:15000}).toBeGreaterThan(0);
  await page.evaluate(({cap})=>{ for(let i=0;i<200;i++) window.dispatchEvent(new DeviceOrientationEvent('deviceorientationabsolute',{alpha:(360-cap+360)%360,beta:90,gamma:0,absolute:true})); },{cap:capAffiche});
  return {ctx,page,erreurs};
}
const RIVOLI={nom:'Rue de Rivoli',points:[[0,-150],[0,150]]}; // axe est-ouest : 90° / 270°

test('de nuit en ville : la rue ramène une boussole fausse de 30° à ±1°, l\'axe est tracé au sol, carnet « rue »',async({browser})=>{
  const {ctx,page,erreurs}=await ouvrir(browser,{rues:[{...RIVOLI,points:RIVOLI.points.map(([N,E])=>[N,E])}],capAffiche:120}); // la vraie direction visée est 90° : la boussole dit 120°
  await page.evaluate(()=>document.getElementById('btnAlign').click());
  await expect(page.locator('#guideMsg')).toContainText('Visez le point où se rejoignent les bords de la rue',{timeout:5000});
  await expect(page.locator('#guideMsg button')).toHaveText(/Caler sur Rue de Rivoli \(90°\)/);
  expect(await page.evaluate(()=>window.__vh2.S.headOff)).toBe(0); // rien n'est calé avant le toucher du bouton
  await page.locator('#guideMsg button').click();
  await expect(page.locator('#note')).toContainText('Calé sur l\'axe de Rue de Rivoli (90°)');
  const dh=await page.evaluate(()=>window.__vh2.S.headOff); expect(Math.abs(dh+30)).toBeLessThan(1);
  expect(Math.abs(await page.evaluate(()=>window.__vh2.pose().capDeg)-90)).toBeLessThan(1);
  await expect(page.locator('#guideMsg')).toBeHidden();
  await page.evaluate(()=>window.__vh2.rendreImage());
  const jaune=await page.evaluate(()=>{ const c=document.getElementById('ov'), d=c.getContext('2d').getImageData(0,0,c.width,c.height).data; let n=0; for(let i=0;i<d.length;i+=4) if(d[i+3]>200&&d[i]>240&&d[i+1]>190&&d[i+1]<225&&d[i+2]<90) n++; return n; });
  expect(jaune).toBeGreaterThan(30); // l'axe de la rue tracé au sol (#FFD23F)
  const mesures=await page.evaluate(()=>window.__vh2.carnet.lire().mesures.map(m=>m.src)); expect(mesures).toContain('rue');
  expect(erreurs).toEqual([]); await ctx.close();
});

test('carrefour : deux rues possibles, un bouton par rue (jamais de choix silencieux)',async({browser})=>{
  const {ctx,page,erreurs}=await ouvrir(browser,{rues:[RIVOLI,{nom:'Rue du Louvre',points:[[-150,0],[150,0]]}],capAffiche:45});
  await page.evaluate(()=>document.getElementById('btnAlign').click());
  await expect(page.locator('#guideMsg button')).toHaveCount(2,{timeout:5000});
  await expect(page.locator('#guideMsg')).toContainText('carrefour');
  await page.locator('#guideMsg button',{hasText:'Rue du Louvre'}).click();
  const cap=await page.evaluate(()=>window.__vh2.pose().capDeg); expect(Math.min(Math.abs(cap-0),Math.abs(cap-360))).toBeLessThan(1);
  expect(erreurs).toEqual([]); await ctx.close();
});

test('boussole douteuse (en voiture) : les deux sens de la rue en boutons',async({browser})=>{
  const {ctx,page,erreurs}=await ouvrir(browser,{rues:[RIVOLI],vitesse:15,capAffiche:200});
  await page.evaluate(()=>document.getElementById('btnAlign').click());
  await expect(page.locator('#guideMsg button')).toHaveCount(2,{timeout:15000});
  await expect(page.locator('#guideMsg')).toContainText('boussole douteuse');
  await page.locator('#guideMsg button',{hasText:'270°'}).click();
  expect(Math.abs(await page.evaluate(()=>window.__vh2.pose().capDeg)-270)).toBeLessThan(1);
  expect(erreurs).toEqual([]); await ctx.close();
});
