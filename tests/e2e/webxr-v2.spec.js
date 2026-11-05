// Suivi visuel WebXR (essai) : un faux navigator.xr envoie des poses ; le cap suit (après un nord posé par la boussole), la session se termine proprement ; sans WebXR, le bouton reste caché.
const {test,expect}=require('@playwright/test');

async function ouvrir(browser,{avecXr=true,features=null}={}){
  const ctx=await browser.newContext({viewport:{width:412,height:915},hasTouch:true,baseURL:`http://127.0.0.1:${+(process.env.PORT||4173)}`,permissions:['geolocation','camera'],geolocation:{latitude:48.6459,longitude:-2.0281}});
  const page=await ctx.newPage(), erreurs=[]; page.on('pageerror',e=>erreurs.push(String(e)));
  await page.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort());
  await page.addInitScript(([avecXr,features])=>{
    if(!avecXr) return;
    if(features) window.__xrFeatures=features;
    window.XRWebGLLayer=class{ constructor(s,gl){ this.framebuffer=null; } };
    const session=new (class extends EventTarget{ constructor(){ super(); this.renderState={baseLayer:null}; this.cadre=null; }
      async updateRenderState(o){ this.renderState.baseLayer=o.baseLayer; } async requestReferenceSpace(){ return {}; }
      requestAnimationFrame(f){ this.cadre=f; return 1; } async end(){ this.cadre=null; this.dispatchEvent(new Event('end')); } })();
    session.enabledFeatures=window.__xrFeatures||['local','dom-overlay'];
    window.__xrSession=session;
    window.__xrImage=(q)=>{ const f=session.cadre; if(!f) return false; session.cadre=null; f(performance.now(),{getViewerPose:()=>({transform:{orientation:{x:q[0],y:q[1],z:q[2],w:q[3]}}})}); return true; };
    Object.defineProperty(navigator,'xr',{value:{ isSessionSupported:async(m)=>m==='immersive-ar', requestSession:async()=>session },configurable:true});
    const g=HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext=function(t,o){ if(t==='webgl'&&o&&o.xrCompatible) return { makeXRCompatible:async()=>{}, bindFramebuffer(){}, clearColor(){}, clear(){}, FRAMEBUFFER:1, COLOR_BUFFER_BIT:1, DEPTH_BUFFER_BIT:2 }; return g.call(this,t,o); };
  },[avecXr,features]);
  await page.goto('/v2/ar.html'); await page.click('#go');
  await expect.poll(()=>page.evaluate(()=>!!window.__vh2.app.donnees().pos),{timeout:15000}).toBe(true);
  return {ctx,page,erreurs};
}
const aY=(deg)=>[0,Math.sin(deg*Math.PI/360),0,Math.cos(deg*Math.PI/360)];

test('WebXR : bouton visible, session démarrée, le cap suit les poses du suivi visuel (nord posé par la boussole), fin propre',async({browser})=>{
  const {ctx,page,erreurs}=await ouvrir(browser);
  await expect.poll(()=>page.evaluate(()=>!document.getElementById('btnXr').hidden),{timeout:5000}).toBe(true); // le bouton est dans les réglages (feuille fermée)
  // la boussole dit 200° ; le suivi visuel (repère arbitraire) dit « nord » à l'identité
  await page.evaluate(()=>{ for(let i=0;i<150;i++) window.dispatchEvent(new DeviceOrientationEvent('deviceorientationabsolute',{alpha:160,beta:85,gamma:0,absolute:true})); }); // cap 200°, légère inclinaison
  await page.evaluate(()=>document.getElementById('btnXr').click());
  await expect.poll(()=>page.evaluate(()=>window.__vh2.fusion.suiviExterne)).toBe(true);
  // images du suivi : identité (caméra horizontale vers « le nord » du suivi) puis boussole
  const poser=async(q)=>{ for(let i=0;i<150;i++){ await page.evaluate((q)=>{ window.dispatchEvent(new DeviceOrientationEvent('deviceorientationabsolute',{alpha:160,beta:85,gamma:0,absolute:true})); return window.__xrImage(q); },q); } };
  await poser([0,0,0,1]);
  const cap0=await page.evaluate(()=>window.__vh2.pose().capDeg);
  await poser(aY(-30)); // on tourne de 30° à droite sans que la boussole bouge : le suivi visuel fait tourner le cap
  const cap1=await page.evaluate(()=>window.__vh2.pose().capDeg);
  expect(Math.abs(((cap1-cap0-30+540)%360)-180)).toBeLessThan(2);
  await page.evaluate(()=>document.getElementById('btnDbg').click());
  await expect(page.locator('#dbgBody')).toContainText('suivi visuel WebXR : ACTIF');
  await page.evaluate(()=>window.__xrSession.end());
  await expect.poll(()=>page.evaluate(()=>window.__vh2.fusion.suiviExterne)).toBe(false);
  expect(await page.evaluate(()=>document.body.classList.contains('xr'))).toBe(false);
  expect(erreurs).toEqual([]); await ctx.close();
});

test('sans WebXR : le bouton reste caché, la page fonctionne',async({browser})=>{
  const {ctx,page,erreurs}=await ouvrir(browser,{avecXr:false});
  await page.waitForTimeout(500); expect(await page.evaluate(()=>document.getElementById('btnXr').hidden)).toBe(true);
  expect(erreurs).toEqual([]); await ctx.close();
});

test('WebXR : fond transparent (html, body), caméra libérée puis relancée, calages sur l\'image grisés sans camera-access',async({browser})=>{
  const {ctx,page,erreurs}=await ouvrir(browser); // session sans « camera-access »
  await expect.poll(()=>page.evaluate(()=>!document.getElementById('btnXr').hidden),{timeout:5000}).toBe(true);
  await expect.poll(()=>page.evaluate(()=>window.__vh2.entree.etat().cameraOk),{timeout:8000}).toBe(true);
  await page.evaluate(()=>document.getElementById('btnXr').click());
  await expect.poll(()=>page.evaluate(()=>window.__vh2.fusion.suiviExterne)).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.classList.contains('xr')&&document.body.classList.contains('xr'))).toBe(true);
  expect(await page.evaluate(()=>getComputedStyle(document.getElementById('stage')).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  expect(await page.evaluate(()=>getComputedStyle(document.documentElement).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  expect(await page.evaluate(()=>window.__vh2.entree.etat().cameraOk)).toBe(false); // flux arrêté avant la session
  for(const id of ['btnAlign','btnAutoAlign','phv','calCont']) expect(await page.evaluate((id)=>document.getElementById(id).disabled,id)).toBe(true);
  await page.evaluate(()=>window.__xrSession.end());
  await expect.poll(()=>page.evaluate(()=>window.__vh2.entree.etat().cameraOk),{timeout:8000}).toBe(true); // relancé à la fin
  expect(await page.evaluate(()=>document.documentElement.classList.contains('xr'))).toBe(false);
  for(const id of ['btnAlign','btnAutoAlign','phv']) expect(await page.evaluate((id)=>document.getElementById(id).disabled,id)).toBe(false);
  expect(erreurs).toEqual([]); await ctx.close();
});

test('WebXR : avec camera-access, les calages sur l\'image restent actifs',async({browser})=>{
  const {ctx,page,erreurs}=await ouvrir(browser,{features:['local','dom-overlay','camera-access']});
  await expect.poll(()=>page.evaluate(()=>!document.getElementById('btnXr').hidden),{timeout:5000}).toBe(true);
  await page.evaluate(()=>document.getElementById('btnXr').click());
  await expect.poll(()=>page.evaluate(()=>window.__vh2.fusion.suiviExterne)).toBe(true);
  expect(await page.evaluate(()=>document.getElementById('btnAlign').disabled)).toBe(false);
  expect(erreurs).toEqual([]); await ctx.close();
});
