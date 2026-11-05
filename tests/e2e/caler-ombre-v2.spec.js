// Calage sur une ombre : l'ombre d'un poteau est tracée au doigt, la boussole est fausse de 30° → cap à ±2° ; soleil trop bas : refus.
const {test,expect}=require('@playwright/test');

const POS={lat:48.8566,lon:2.3522}, D=Math.PI/180;
async function ouvrir(browser,utc){
  const ctx=await browser.newContext({viewport:{width:800,height:400},deviceScaleFactor:1,hasTouch:false,locale:'fr-FR',baseURL:`http://127.0.0.1:${+(process.env.PORT||4173)}`,permissions:['geolocation','camera'],geolocation:{latitude:POS.lat,longitude:POS.lon,accuracy:8}});
  const page=await ctx.newPage(), erreurs=[]; page.on('pageerror',e=>erreurs.push(String(e)));
  await page.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort());
  await page.addInitScript(()=>{ try{ localStorage.setItem('vh2:reglages',JSON.stringify({v:1,d:{radius:20,calculRelief:false,relief:false,skyline:false}})); }catch(e){} });
  await page.clock.setFixedTime(new Date(utc));
  await page.goto('/v2/ar.html'); await page.click('#go');
  await expect.poll(()=>page.evaluate(()=>!!window.__vh2.app.donnees().pos),{timeout:15000}).toBe(true);
  return {ctx,page,erreurs};
}
/** Pixel où l'on voit un point du sol (est, nord en m), caméra réellement dirigée vers capVrai, inclinée de incl. */
function pixel(est,nord,{capVrai,incl,fh,oeil=1.6,W=800,H=400}){
  const C=capVrai*D,E=incl*D,w=[est,nord,-oeil],f=[Math.cos(E)*Math.sin(C),Math.cos(E)*Math.cos(C),Math.sin(E)],r=[Math.cos(C),-Math.sin(C),0],u=[-Math.sin(E)*Math.sin(C),-Math.sin(E)*Math.cos(C),Math.cos(E)];
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2], cz=dot(w,f);
  return {x:W/2+fh*dot(w,r)/cz,y:H/2-fh*dot(w,u)/cz};
}

test('de jour : tracer l\'ombre d\'un poteau cale le cap à ±2° malgré une boussole fausse de 30°',async({browser})=>{
  const {ctx,page,erreurs}=await ouvrir(browser,'2026-11-05T12:00:00Z');
  const {positionSoleil}=await import('../../src/noyau/astro.js'), so=positionSoleil(Date.parse('2026-11-05T12:00:00Z'),POS.lat,POS.lon);
  expect(so.elDeg).toBeGreaterThan(10);
  const CAP_VRAI=100, INCL=-25;
  await page.evaluate(({cap,beta})=>{ for(let i=0;i<200;i++) window.dispatchEvent(new DeviceOrientationEvent('deviceorientationabsolute',{alpha:(360-cap+360)%360,beta,gamma:0,absolute:true})); },{cap:CAP_VRAI+30,beta:90+INCL});
  const po=await page.evaluate(()=>window.__vh2.pose()); expect(Math.abs(po.inclinaisonDeg-INCL)).toBeLessThan(1);
  const fh=await page.evaluate(()=>(800/2)/Math.tan(window.__vh2.vFov()/2*Math.PI/180));
  const az=(so.azDeg+180)*D, pied=[3*Math.sin((CAP_VRAI+5)*D),3*Math.cos((CAP_VRAI+5)*D)], bout=[pied[0]+2*Math.sin(az),pied[1]+2*Math.cos(az)];
  const a=pixel(...pied,{capVrai:CAP_VRAI,incl:po.inclinaisonDeg,fh}), b=pixel(...bout,{capVrai:CAP_VRAI,incl:po.inclinaisonDeg,fh});
  await page.evaluate(()=>document.getElementById('btnShadow').click());
  await page.mouse.move(a.x,a.y); await page.mouse.down(); await page.mouse.move((a.x+b.x)/2,(a.y+b.y)/2,{steps:3}); await page.mouse.move(b.x,b.y,{steps:3});
  await page.evaluate(()=>window.__vh2.rendreImage());
  const jaune=await page.evaluate(()=>{ const c=document.getElementById('ov'), d=c.getContext('2d').getImageData(0,0,c.width,c.height).data; let n=0; for(let i=0;i<d.length;i+=4) if(d[i+3]>200&&d[i]>240&&d[i+1]>190&&d[i+2]<90) n++; return n; });
  expect(jaune).toBeGreaterThan(20); // le trait est visible pendant le geste
  await page.mouse.up();
  await expect(page.locator('#note')).toContainText('calé sur l\'ombre');
  const dh=await page.evaluate(()=>window.__vh2.S.headOff); expect(Math.abs(dh+30)).toBeLessThan(2);
  expect(await page.evaluate(()=>window.__vh2.carnet.lire().mesures.map(m=>m.src))).toContain('ombre');
  expect(erreurs).toEqual([]); await ctx.close();
});

test('soleil trop bas (fin de journée) : refus avec le message',async({browser})=>{
  const {ctx,page,erreurs}=await ouvrir(browser,'2026-11-05T16:00:00Z'); // soleil à ~2° : trop bas
  await page.evaluate(()=>document.getElementById('btnShadow').click());
  await page.mouse.move(300,300); await page.mouse.down(); await page.mouse.move(380,330,{steps:4}); await page.mouse.up();
  await expect(page.locator('#note')).toContainText('soleil trop bas');
  expect(await page.evaluate(()=>window.__vh2.S.headOff)).toBe(0);
  expect(erreurs).toEqual([]); await ctx.close();
});
