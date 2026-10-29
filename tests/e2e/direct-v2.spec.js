// v2/ar.html (direct) : caméra factice, GPS et capteurs simulés, réseau coupé. Critère de l'étape 9 : « les deux modes affichent la même scène » — pour la même vue (position, cap,
// inclinaison, champ), la page en direct trace exactement ce que trace la page photo.
const {test,expect}=require('@playwright/test');
const path=require('path');

const POS={latitude:48.6459,longitude:-2.0281};
const NUIT_UTC='2026-10-25T21:30:00Z'; // pas de soleil dans l'image

/** Capteurs : téléphone debout, caméra vers `cap` ; alpha = 360 − cap. */
const orienter=(page,cap,beta=90)=>page.evaluate(({cap,beta})=>{ for(let i=0;i<200;i++) window.dispatchEvent(new DeviceOrientationEvent('deviceorientationabsolute',{alpha:(360-cap+360)%360,beta,gamma:0,absolute:true})); },{cap,beta});

async function ouvrirDirect(browser,{viewport={width:915,height:412}}={}){
  const ctx=await browser.newContext({viewport,deviceScaleFactor:2,hasTouch:true,locale:'fr-FR',timezoneId:'Europe/Paris',baseURL:`http://127.0.0.1:${+(process.env.PORT||4173)}`,permissions:['geolocation','camera'],geolocation:POS});
  const page=await ctx.newPage(), erreurs=[]; page.on('pageerror',e=>erreurs.push(String(e)));
  await page.addInitScript({path:path.join(__dirname,'../helpers/enregistreur.js')});
  await page.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort());
  await page.clock.setFixedTime(new Date(NUIT_UTC));
  await page.goto('/v2/ar.html');
  return {ctx,page,erreurs};
}

test('la page en direct démarre : caméra, position, cap des capteurs, scène dessinée',async({browser})=>{
  const {ctx,page,erreurs}=await ouvrirDirect(browser);
  await expect(page.locator('#start')).toBeVisible();
  await page.click('#go');
  await expect(page.locator('#start')).toBeHidden();
  await expect.poll(()=>page.evaluate(()=>!!window.__vh2.app.donnees().pos),{timeout:15000}).toBe(true);
  await expect.poll(()=>page.evaluate(()=>window.__vh2.entree.etat().cameraOk),{timeout:15000}).toBe(true);
  await orienter(page,210);
  const pose=await page.evaluate(()=>window.__vh2.pose());
  expect(pose.capDeg).toBeCloseTo(210,3); expect(pose.inclinaisonDeg).toBeCloseTo(0,3); expect(pose.roulisDeg).toBeCloseTo(0,3);
  await expect(page.locator('#status')).toContainText('lieux',{timeout:20000});
  const pixels=await page.evaluate(()=>{ const c=document.getElementById('ov'), d=c.getContext('2d').getImageData(0,0,c.width,c.height).data; let n=0; for(let i=3;i<d.length;i+=4) if(d[i]) n++; return n; });
  expect(pixels).toBeGreaterThan(2000);
  // tenir le téléphone penché de 20° : l'inclinaison suit ; glisser corrige le cap et met la boussole en pause
  await orienter(page,210,70);
  expect((await page.evaluate(()=>window.__vh2.pose())).inclinaisonDeg).toBeCloseTo(-20,3);
  await orienter(page,210,90);
  await page.mouse.move(400,200); await page.mouse.down(); await page.mouse.move(520,200,{steps:5}); await page.mouse.up();
  expect(await page.evaluate(()=>window.__vh2.S.headOff)).not.toBe(0);
  await expect(page.locator('#calib')).toContainText('remettre');
  await page.click('#calib'); expect(await page.evaluate(()=>window.__vh2.S.headOff)).toBe(0);
  expect(erreurs).toEqual([]);
  await ctx.close();
});

test('direct = photo : pour la même vue, les deux pages tracent la même scène',async({browser})=>{
  const {jpegExif}=await import('../unit/aide-jpeg.mjs');
  const REGLAGES={camFov:67,radius:30,relief:true,skyline:false,cross:true,telecom:false,buildings:false,sea:false,air:false,layers:{places:true,monuments:true,equip:true,urban:false,urbClip:true,urbSmooth:true,urbFill:true}};
  const graine=p=>p.addInitScript(s=>{ try{ localStorage.setItem('vh2:reglages',JSON.stringify({v:1,d:s})); }catch(e){} },REGLAGES);
  const approx=(a,b,chemin='')=>{ // égalité à 1e-6 près sur les nombres (les capteurs lissés ne sont exacts qu'à 1e-14)
    if(typeof a==='number'&&typeof b==='number') return Math.abs(a-b)<1e-6||(()=>{ throw new Error(`${chemin} : ${a} ≠ ${b}`); })();
    if(a&&typeof a==='object'){ expect(Object.keys(b||{}).sort(),chemin).toEqual(Object.keys(a).sort()); for(const k of Object.keys(a)) approx(a[k],b[k],chemin+'.'+k); return true; }
    const nz=t=>typeof t==='string'?t.replace(/-0\.0(?!\d)/g,'+0.0'):t; // « -0.0° » et « +0.0° » : même valeur, bruit de signe des capteurs lissés
    expect(nz(b),chemin).toEqual(nz(a)); };
  const trace=page=>page.evaluate(async()=>{ await new Promise(r=>setTimeout(r,1200)); document.getElementById('chips').style.display='none'; await new Promise(r=>setTimeout(r,1200));
    const v=window.__vh2, rec=window.__enregistreur(v.ctx); for(let i=0;i<2;i++) v.rendreImage(); rec.demarrer(); v.rendreImage(); rec.arreter(); return rec.evenements(); });

  // direct
  const d=await ouvrirDirect(browser,{viewport:{width:640,height:360}});
  await graine(d.page); await d.page.goto('/v2/ar.html');
  await d.page.click('#go');
  await expect.poll(()=>d.page.evaluate(()=>!!window.__vh2.app.donnees().pos),{timeout:15000}).toBe(true);
  await expect.poll(()=>d.page.evaluate(()=>!!window.__vh2.entree.flux()),{timeout:15000}).toBe(true);
  const flux=await d.page.evaluate(()=>window.__vh2.entree.flux());
  await orienter(d.page,210);
  await expect(d.page.locator('#status')).toContainText('lieux',{timeout:20000});
  const opsDirect=await trace(d.page);

  // photo : mêmes dimensions que le flux de la caméra, même position, même cap (120° + 90°), même champ
  const ctx2=await browser.newContext({viewport:{width:640,height:360},deviceScaleFactor:2,hasTouch:true,locale:'fr-FR',timezoneId:'Europe/Paris',baseURL:`http://127.0.0.1:${+(process.env.PORT||4173)}`});
  const p2=await ctx2.newPage(), erreurs2=[]; p2.on('pageerror',e=>erreurs2.push(String(e)));
  await p2.addInitScript({path:path.join(__dirname,'../helpers/enregistreur.js')});
  await p2.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort());
  await graine(p2); await p2.goto('/v2/photo.html');
  const exif=Buffer.from(jpegExif({dir:120,orient:1,lat:POS.latitude,lon:POS.longitude,f35:24,date:'2026:10:25 23:30:00',offset:'+02:00'}));
  const b64=await p2.evaluate(async({w,h})=>{ const c=document.createElement('canvas'); c.width=w; c.height=h; const x=c.getContext('2d'); x.fillStyle='#456'; x.fillRect(0,0,w,h); const b=await new Promise(r=>c.toBlob(r,'image/jpeg',.8)); const u=new Uint8Array(await b.arrayBuffer()); let s=''; for(const v of u) s+=String.fromCharCode(v); return btoa(s); },{w:flux.largeurPx,h:flux.hauteurPx});
  const jpg=Buffer.from(b64,'base64');
  await p2.setInputFiles('#photoFile',{name:'nuit.jpg',mimeType:'image/jpeg',buffer:Buffer.concat([jpg.subarray(0,2),exif.subarray(2,exif.length-2),jpg.subarray(2)])});
  await p2.waitForFunction(()=>window.__vh2.photo());
  await p2.evaluate(()=>{ window.__vh2.S.camFov=67; window.__vh2.S.pitchOff=0; });
  await expect(p2.locator('#status')).toContainText('lieux',{timeout:20000});
  expect(await p2.evaluate(()=>window.__vh2.S.headOff)).toBe(210);
  const opsPhoto=await trace(p2);

  expect(opsDirect.length,'nombre d’opérations').toBe(opsPhoto.length);
  expect(opsDirect.length).toBeGreaterThan(30);
  approx(opsPhoto,opsDirect,'trame');
  expect(d.erreurs).toEqual([]); expect(erreurs2).toEqual([]);
  await d.ctx.close(); await ctx2.close();
});

test('trafic en direct : avions et bateaux du relais (simulé) arrivent dans la scène ; rien en photo',async({browser})=>{
  const ctx=await browser.newContext({viewport:{width:915,height:412},deviceScaleFactor:2,hasTouch:true,locale:'fr-FR',timezoneId:'Europe/Paris',baseURL:`http://127.0.0.1:${+(process.env.PORT||4173)}`,permissions:['geolocation','camera'],geolocation:POS});
  const page=await ctx.newPage(), erreurs=[]; page.on('pageerror',e=>erreurs.push(String(e)));
  const requetes=[];
  await page.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>{
    const u=r.request().url(), ok=b=>r.fulfill({status:200,headers:{'access-control-allow-origin':'*','content-type':'application/json'},body:JSON.stringify(b)});
    requetes.push(u);
    if(/\/planes\?/.test(u)) return ok({states:[['abc123','AF1234 ',null,null,null,POS.longitude+0.05,POS.latitude+0.04,null,false,200,90,0,null,3000]],auth:'relais'});
    if(/\/ships\?/.test(u)) return ok({ships:[{mmsi:227000001,name:'ARMEN',lat:POS.latitude+0.01,lon:POS.longitude+0.01,cog:45,sog:5,type:36,t:Date.now()}],confirmed:true,received:3});
    return r.abort();
  });
  await page.addInitScript(s=>{ try{ localStorage.setItem('vh2:reglages',JSON.stringify({v:1,d:s})); }catch(e){} },{air:true,sea:true,radius:30,relief:false,layers:{places:true,monuments:false,equip:false,urban:false,urbClip:true,urbSmooth:true,urbFill:true}});
  await page.goto('/v2/ar.html'); await page.click('#go');
  await expect.poll(()=>page.evaluate(()=>{ const a=window.__vh2.app; a.actualiserMobiles(Date.now()+Math.random()); return a.donnees().mobiles.map(m=>m.kind).sort().join(','); }),{timeout:20000}).toBe('plane,ship');
  const e=await page.evaluate(()=>window.__vh2.app.etat());
  expect(e.messageAir).toBe('1 av.'); expect(e.messageSea).toBe('1 bat.');
  expect(requetes.some(u=>/workers\.dev\/ships\?/.test(u))&&requetes.some(u=>/workers\.dev\/planes\?/.test(u))).toBe(true);
  // décocher les avions les retire ; en photo, aucun mobile
  await page.evaluate(()=>{ window.__vh2.S.air=false; window.__vh2.app.synchroniserTrafic(); });
  await expect.poll(()=>page.evaluate(()=>{ const a=window.__vh2.app; a.actualiserMobiles(Date.now()+Math.random()); return a.donnees().mobiles.map(m=>m.kind).join(','); })).toBe('ship');
  await page.evaluate(()=>window.__vh2.app.definirMode('photo'));
  expect(await page.evaluate(()=>{ const a=window.__vh2.app; a.actualiserMobiles(Date.now()+1e6); return a.donnees().mobiles.length; })).toBe(0);
  expect(erreurs).toEqual([]);
  await ctx.close();
});

test('capteurs branchés dès le chargement (comme la v1) ; le diagnostic donne les mesures et la trace du cap',async({browser})=>{
  const {ctx,page,erreurs}=await ouvrirDirect(browser);
  await orienter(page,120);                                       // AVANT de toucher « Ouvrir la caméra »
  expect(await page.evaluate(()=>window.__vh2.fusion.capteur)).toBe(true);
  expect((await page.evaluate(()=>window.__vh2.pose())).capDeg).toBeCloseTo(120,3);
  await page.click('#go');
  await expect.poll(()=>page.evaluate(()=>!!window.__vh2.app.donnees().pos),{timeout:15000}).toBe(true);
  await page.waitForTimeout(2500);                                // quelques échantillons de la trace du cap
  await page.click('#btnSet'); await page.click('details[data-grp=off] summary'); await page.click('#btnDbg');
  const diag=page.locator('#dbgBody');
  await expect(diag).toContainText('mesures : boussole 120.0°');
  await expect(diag).toContainText('trace du cap (10 dernières secondes) : 120');
  await expect(diag).toContainText('cap affiché 120.0°');
  // un saut du repère du gyroscope est journalisé avec toutes les mesures
  await page.evaluate(()=>{ for(let i=0;i<4;i++){ window.dispatchEvent(new DeviceOrientationEvent('deviceorientation',{alpha:300,beta:90,gamma:0,absolute:false})); } });
  expect(erreurs).toEqual([]);
  await ctx.close();
});
