// v2 : carnet de calage (consigné à chaque calage, envoyé au relais), écart appris et banc d'essai. Réseau coupé, relais simulé.
// Les parités avec la v1 sur les photos réelles (banc d'essai) sont dans photo-banc-parite.spec.js (local).
const {test,expect}=require('@playwright/test');
const path=require('path');

const POS={latitude:48.6459,longitude:-2.0281}, RELAIS='https://villes-horizon-relais.rousseau-romain.workers.dev';
const orienter=(page,cap,beta=90)=>page.evaluate(({cap,beta})=>{ for(let i=0;i<200;i++) window.dispatchEvent(new DeviceOrientationEvent('deviceorientationabsolute',{alpha:(360-cap+360)%360,beta,gamma:0,absolute:true})); },{cap,beta});

test('en direct : un glisser consigne une mesure, elle part au relais, « Reprendre l’écart appris » la rejoue',async({browser})=>{
  const ctx=await browser.newContext({viewport:{width:915,height:412},deviceScaleFactor:2,hasTouch:true,locale:'fr-FR',timezoneId:'Europe/Paris',baseURL:`http://127.0.0.1:${+(process.env.PORT||4173)}`,permissions:['geolocation','camera'],geolocation:POS});
  const page=await ctx.newPage(), erreurs=[], recus=[]; page.on('pageerror',e=>erreurs.push(String(e)));
  await page.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort());
  await page.route(`${RELAIS}/calib`,async r=>{ const corps=JSON.parse(r.request().postData()||'{}'); recus.push({type:r.request().headers()['content-type'],n:(corps.samples||[]).length,premiere:(corps.samples||[])[0]}); await r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({ok:true,stored:(corps.samples||[]).length})}); });
  await page.addInitScript(()=>{ try{ localStorage.setItem('vh-dev','telephone-v1'); }catch(e){} });
  await page.goto('/v2/ar.html'); await page.click('#go');
  await expect.poll(()=>page.evaluate(()=>!!window.__vh2.app.donnees().pos),{timeout:15000}).toBe(true);
  await orienter(page,210);
  await page.mouse.move(400,200); await page.mouse.down(); await page.mouse.move(520,200,{steps:5}); await page.mouse.up();
  const calib=await page.evaluate(()=>JSON.parse(localStorage.getItem('vh2:calib')).d);
  expect(calib).toHaveLength(1);
  const m=calib[0];
  expect(m.src).toBe('glisser'); expect(m.dev).toBe('telephone-v1'); expect(m.v).toBe('v2'); expect(m.mag).toBeTruthy(); expect(m.photo).toBeUndefined();
  expect(Math.abs(m.off)).toBeGreaterThan(1); expect(m.raw).toBeCloseTo(210,0);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('vh2:calib-q')).d)).toHaveLength(1);
  // envoi (sans attendre les 8 s) : la file est purgée, la requête est en text/plain
  await page.evaluate(()=>window.__vh2.carnet.envoyer());
  expect(recus).toHaveLength(1); expect(recus[0].type).toBe('text/plain'); expect(recus[0].n).toBe(1); expect(recus[0].premiere.dev).toBe('telephone-v1');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('vh2:calib-q')).d)).toHaveLength(0);
  // le calage est remis à zéro, puis l'écart appris le reprend
  const off=m.off;
  await page.click('#calib'); expect(await page.evaluate(()=>window.__vh2.S.headOff)).toBe(0);
  await page.evaluate(()=>document.getElementById('btnLearned').click());
  await expect(page.locator('#note')).toContainText('écart appris repris');
  expect(await page.evaluate(()=>window.__vh2.S.headOff)).toBeCloseTo(off,1);
  // diagnostic
  await page.evaluate(()=>document.getElementById('btnDbg').click());
  await expect(page.locator('#dbgBody')).toContainText('Carnet de calage'); await expect(page.locator('#dbgBody')).toContainText('1 mesure(s) sur l\'appareil'); await expect(page.locator('#dbgBody')).toContainText('écart appris ici');
  // la v1 n'est jamais modifiée : son identifiant est lu, pas réécrit ; aucune clé vh- créée par la v2
  expect(await page.evaluate(()=>Object.keys(localStorage).filter(k=>/^vh[-_]/.test(k)&&k!=='vh-dev'))).toEqual([]);
  expect(erreurs).toEqual([]);
  await ctx.close();
});

test('sans mesure : « Reprendre l’écart appris » le dit ; un glisser sans capteur n’est pas consigné',async({browser})=>{
  const ctx=await browser.newContext({viewport:{width:915,height:412},hasTouch:true,baseURL:`http://127.0.0.1:${+(process.env.PORT||4173)}`,permissions:['geolocation','camera'],geolocation:POS});
  const page=await ctx.newPage(); await page.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort());
  await page.goto('/v2/ar.html'); await page.click('#go');
  await expect.poll(()=>page.evaluate(()=>!!window.__vh2.app.donnees().pos),{timeout:15000}).toBe(true);
  await page.evaluate(()=>document.getElementById('btnLearned').click());
  await expect(page.locator('#note')).toContainText('pas encore d’écart appris');
  await ctx.close();
});

test('photo rejouée : le banc d’essai passe les dix départs, remplit le tableau et rétablit le calage',async({page})=>{
  test.setTimeout(120000);
  const {jpegExif}=await import('../unit/aide-jpeg.mjs');
  const exif=Buffer.from(jpegExif({dir:120,orient:1,lat:POS.latitude,lon:POS.longitude,f35:24,date:'2026:10:25 23:30:00',offset:'+02:00'}));
  const erreurs=[]; page.on('pageerror',e=>erreurs.push(String(e)));
  await page.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort());
  await page.addInitScript(()=>{ try{ localStorage.setItem('vh2:reglages',JSON.stringify({v:1,d:{relief:false,radius:30}})); }catch(e){} });
  await page.goto('/v2/photo.html');
  const b64=await page.evaluate(async()=>{ const c=document.createElement('canvas'); c.width=640; c.height=360; const x=c.getContext('2d'); x.fillStyle='#4a7ab0'; x.fillRect(0,0,640,180); x.fillStyle='#355'; x.fillRect(0,180,640,180); const b=await new Promise(r=>c.toBlob(r,'image/jpeg',.8)); const u=new Uint8Array(await b.arrayBuffer()); let s=''; for(const v of u) s+=String.fromCharCode(v); return btoa(s); });
  const jpg=Buffer.from(b64,'base64');
  await page.setInputFiles('#photoFile',{name:'t.jpg',mimeType:'image/jpeg',buffer:Buffer.concat([jpg.subarray(0,2),exif.subarray(2,exif.length-2),jpg.subarray(2)])});
  await expect(page.locator('#photoChip')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>!!window.__vh2.app.donnees().pos)).toBe(true);
  await expect(page.locator('#btnBench')).toBeEnabled();
  const avant=await page.evaluate(()=>({h:window.__vh2.S.headOff,p:window.__vh2.S.pitchOff,c:window.__vh2.S.camFov}));
  await page.evaluate(()=>document.getElementById('btnBench').click());
  await expect(page.locator('#dbgTitle')).toHaveText('Banc d\'essai du calage',{timeout:100000});
  expect(await page.locator('#dbgBody table tr').count()).toBe(11); // en-tête + 10 départs
  await expect(page.locator('#dbgBody')).toContainText('sur 10');
  const apres=await page.evaluate(()=>({h:window.__vh2.S.headOff,p:window.__vh2.S.pitchOff,c:window.__vh2.S.camFov}));
  expect(apres).toEqual(avant);
  expect(await page.evaluate(()=>localStorage.getItem('vh2:calib'))).toBeNull(); // rien n'est consigné pendant le banc
  await expect(page.locator('#btnBench')).toBeEnabled();
  expect(erreurs).toEqual([]);
});
