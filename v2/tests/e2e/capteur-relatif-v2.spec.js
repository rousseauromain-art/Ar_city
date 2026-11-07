// Capteur d'orientation relatif (essai) : un faux RelativeOrientationSensor envoie des quaternions ; la page en direct en tire la pose (même cap que deviceorientation) ; sans l'API, repli propre.
const {test,expect}=require('@playwright/test');

async function ouvrir(browser,{avecApi=true}={}){
  const ctx=await browser.newContext({viewport:{width:640,height:360},hasTouch:true,baseURL:`http://127.0.0.1:${+(process.env.PORT||4173)}`,permissions:['geolocation','camera'],geolocation:{latitude:48.6459,longitude:-2.0281}});
  const page=await ctx.newPage(), erreurs=[]; page.on('pageerror',e=>erreurs.push(String(e)));
  await page.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort());
  await page.addInitScript((avecApi)=>{
    if(!avecApi){ delete window.RelativeOrientationSensor; return; }
    window.RelativeOrientationSensor=class extends EventTarget{ constructor(o){ super(); this.options=o; this.quaternion=null; window.__capteurRelatif=this; } start(){ this.demarre=true; } stop(){ this.demarre=false; } };
  },avecApi);
  await page.goto('/v2/ar.html'); await page.click('#go');
  await expect.poll(()=>page.evaluate(()=>!!window.__vh2.app.donnees().pos),{timeout:15000}).toBe(true);
  return {ctx,page,erreurs};
}
const quaternion=(alpha,beta,gamma)=>{ const d=Math.PI/180, mul=(a,b)=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
  return mul(mul([0,0,Math.sin(alpha*d/2),Math.cos(alpha*d/2)],[Math.sin(beta*d/2),0,0,Math.cos(beta*d/2)]),[0,Math.sin(gamma*d/2)*1,0,Math.cos(gamma*d/2)].map((x,i)=>i===1?Math.sin(gamma*d/2):x)); };

test('capteur relatif : case cochée, quaternions → même cap que deviceorientation, source « quaternion » dans le diagnostic',async({browser})=>{
  const {ctx,page,erreurs}=await ouvrir(browser);
  await page.evaluate(()=>{ const c=document.getElementById('capRel'); c.checked=true; c.dispatchEvent(new Event('change',{bubbles:true})); });
  expect(await page.evaluate(()=>window.__capteurRelatif&&window.__capteurRelatif.demarre)).toBe(true);
  expect(await page.evaluate(()=>window.__capteurRelatif.options.frequency)).toBe(60);
  const cap=137, q=quaternion((360-cap+70+720)%360,85,0);
  await page.evaluate(({cap,q})=>{ // la boussole (absolue) et le capteur relatif (décalé de 70° : repère arbitraire) disent le même cap réel
    for(let i=0;i<150;i++){ window.dispatchEvent(new DeviceOrientationEvent('deviceorientationabsolute',{alpha:(360-cap+720)%360,beta:85,gamma:0,absolute:true})); const s=window.__capteurRelatif; s.quaternion=q; s.dispatchEvent(new Event('reading')); } },{cap,q});
  const pose=await page.evaluate(()=>window.__vh2.pose()); expect(Math.abs(((pose.capDeg-cap+540)%360)-180)).toBeLessThan(1);
  await page.evaluate(()=>document.getElementById('btnDbg').click());
  await expect(page.locator('#dbgBody')).toContainText('source des rotations : quaternion 60 Hz');
  // case décochée : retour à deviceorientation
  await page.evaluate(()=>document.getElementById('btnClose')&&document.getElementById('dbgClose')&&document.getElementById('dbgClose').click());
  await page.evaluate(()=>{ const c=document.getElementById('capRel'); c.checked=false; c.dispatchEvent(new Event('change',{bubbles:true})); });
  expect(await page.evaluate(()=>window.__capteurRelatif.demarre)).toBe(false);
  expect(erreurs).toEqual([]); await ctx.close();
});

test('capteur relatif demandé sans l\'API : repli sur deviceorientation, message au diagnostic, aucune erreur',async({browser})=>{
  const {ctx,page,erreurs}=await ouvrir(browser,{avecApi:false});
  await page.evaluate(()=>{ const c=document.getElementById('capRel'); c.checked=true; c.dispatchEvent(new Event('change',{bubbles:true})); });
  await page.evaluate(()=>document.getElementById('btnDbg').click());
  await expect(page.locator('#dbgBody')).toContainText('RelativeOrientationSensor indisponible');
  await expect(page.locator('#dbgBody')).toContainText('source des rotations : deviceorientation');
  expect(erreurs).toEqual([]); await ctx.close();
});
