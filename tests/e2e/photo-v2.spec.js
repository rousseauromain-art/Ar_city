// v2/photo.html : parcours de bout en bout avec une photo synthétique (EXIF Pixel, Saint-Malo) et un réseau coupé : la page lit l'EXIF, se place, charge ce qu'elle peut
// (liste intégrée en secours), dessine le ruban de cap et les lieux, mémorise les réglages sous vh2:, et la sortie de la photo rétablit le calage.
const {test,expect}=require('@playwright/test');

async function photoDeTest(page,{dir=120,orient=1}={}){
  const {jpegExif}=await import('../unit/aide-jpeg.mjs');
  const exif=Buffer.from(jpegExif({dir,orient,lat:48.6459,lon:-2.0281,f35:24}));
  const b64=await page.evaluate(async()=>{
    const c=document.createElement('canvas'); c.width=640; c.height=360; const x=c.getContext('2d'); x.fillStyle='#4a7ab0'; x.fillRect(0,0,640,180); x.fillStyle='#355'; x.fillRect(0,180,640,180);
    const b=await new Promise(r=>c.toBlob(r,'image/jpeg',.8)); const u=new Uint8Array(await b.arrayBuffer()); let s=''; for(const v of u) s+=String.fromCharCode(v); return btoa(s);
  });
  const jpg=Buffer.from(b64,'base64'), app1=exif.subarray(2,exif.length-2); // APP1 sans SOI ni EOI
  return Buffer.concat([jpg.subarray(0,2),app1,jpg.subarray(2)]);
}

async function ouvrir(page){
  const erreurs=[]; page.on('pageerror',e=>erreurs.push(String(e)));
  await page.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort());
  await page.goto('/v2/photo.html');
  await expect(page.locator('#start')).toBeVisible();
  return erreurs;
}
const pixelsDessines=page=>page.evaluate(()=>{ const c=document.getElementById('ov'), d=c.getContext('2d').getImageData(0,0,c.width,c.height).data; let n=0; for(let i=3;i<d.length;i+=4) if(d[i]) n++; return n; });

test('une photo rejouée : EXIF lu, scène dessinée, calage restauré à la sortie',async({page})=>{
  const erreurs=await ouvrir(page);
  const buffer=await photoDeTest(page);
  await page.setInputFiles('#photoFile',{name:'PXL_test.jpg',mimeType:'image/jpeg',buffer});
  await expect(page.locator('#start')).toBeHidden();
  await expect(page.locator('#photoChip')).toContainText('photo');
  await expect(page.locator('#photoChip')).toContainText('210°'); // 120° + 90° (Pixel horizontal)
  await expect(page.locator('#status')).toContainText('lieux',{timeout:20000});
  await expect.poll(()=>pixelsDessines(page),{timeout:10000}).toBeGreaterThan(2000); // au moins le ruban de cap
  const avant=await page.evaluate(()=>({S:window.__vh2.S.headOff,fov:window.__vh2.S.camFov}));
  expect(avant.S).toBeCloseTo(210,0); expect(avant.fov).toBeGreaterThan(60); expect(avant.fov).toBeLessThan(95);
  // réglage mémorisé sous vh2:, jamais sous les clés de la v1
  await page.click('#btnSet'); await page.click('details[data-grp=cap] summary'); await page.check('#crs'); const m=await page.evaluate(()=>({v2:localStorage.getItem('vh2:reglages'),v1:localStorage.getItem('vh_settings_v2')}));
  expect(JSON.parse(m.v2).d.cross).toBe(true); expect(m.v1).toBeNull();
  await page.click('#btnClose'); await page.click('#photoChip'); await expect(page.locator('#start')).toBeVisible();
  expect(await page.evaluate(()=>window.__vh2.S.headOff)).toBe(0);
  expect(erreurs).toEqual([]);
});

test('une photo sans position ni position simulée est refusée avec une explication',async({page})=>{
  const erreurs=await ouvrir(page);
  const buffer=await page.evaluate(async()=>{ const c=document.createElement('canvas'); c.width=64; c.height=48; const b=await new Promise(r=>c.toBlob(r,'image/jpeg')); const u=new Uint8Array(await b.arrayBuffer()); let s=''; for(const v of u) s+=String.fromCharCode(v); return btoa(s); });
  await page.setInputFiles('#photoFile',{name:'sans.jpg',mimeType:'image/jpeg',buffer:Buffer.from(buffer,'base64')});
  await expect(page.locator('#photoInfo')).toContainText('Pas de position GPS');
  await expect(page.locator('#start')).toBeVisible();
  expect(erreurs).toEqual([]);
});

test('le bouton œil bascule Essentiel / Tout voir ; le banc d’essai s’active avec la photo, le calage appris reste actif (étape 10d)',async({page})=>{
  const erreurs=await ouvrir(page);
  await page.setInputFiles('#photoFile',{name:'PXL_test.jpg',mimeType:'image/jpeg',buffer:await photoDeTest(page)});
  await expect(page.locator('#photoChip')).toBeVisible();
  await page.click('#btnBeyond'); await expect(page.locator('#eyeLbl')).toHaveText('Tout voir');
  await page.click('#btnBeyond'); await expect(page.locator('#eyeLbl')).toHaveText('Essentiel');
  await expect(page.locator('#btnLearned')).toBeEnabled(); await expect(page.locator('#btnBench')).toBeEnabled();
  await page.click('#photoChip'); await expect(page.locator('#btnBench')).toBeDisabled();
  expect(erreurs).toEqual([]);
});

test('la v2 reprend l’atlas des lieux de la v1 (même origine) quand le réseau est coupé',async({page})=>{
  const atlas={zones:[],items:{'Dinard@48.633,-2.067':{name:'Dinard',lat:48.6333,lon:-2.0667,kind:'town',pop:10000,ele:null,t:1},'Cancale@48.676,-1.852':{name:'Cancale',lat:48.6761,lon:-1.8519,kind:'town',pop:5000,ele:null,t:1}}};
  await page.addInitScript(a=>{ try{ localStorage.setItem('vh_atlas_v1',JSON.stringify(a)); }catch(e){} },atlas);
  const erreurs=await ouvrir(page);
  await page.setInputFiles('#photoFile',{name:'PXL_test.jpg',mimeType:'image/jpeg',buffer:await photoDeTest(page)});
  await expect(page.locator('#photoChip')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>window.__vh2.app.donnees().lieux.map(l=>l.name).sort().join(',')),{timeout:20000}).toContain('Dinard');
  expect(await page.evaluate(()=>window.__vh2.app.etat().source)).toMatch(/atlas local/);
  // la v1 n'est pas modifiée : sa clé est intacte
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('vh_atlas_v1')).items['Dinard@48.633,-2.067'].name)).toBe('Dinard');
  expect(erreurs).toEqual([]);
});

test('les lieux de l’atlas sont à l’écran tout de suite, avant la fin du chargement (Overpass qui ne répond pas)',async({page})=>{
  const atlas={zones:[],items:{'Dinard@48.633,-2.067':{name:'Dinard',lat:48.6333,lon:-2.0667,kind:'town',pop:10000,ele:null,t:1}}};
  await page.addInitScript(a=>{ try{ localStorage.setItem('vh_atlas_v1',JSON.stringify(a)); }catch(e){} },atlas);
  const erreurs=[]; page.on('pageerror',e=>erreurs.push(String(e)));
  await page.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>{ if(/overpass|maps\.mail\.ru/.test(r.request().url())) return; /* jamais de réponse */ return r.abort(); });
  await page.goto('/v2/photo.html');
  await page.setInputFiles('#photoFile',{name:'PXL_test.jpg',mimeType:'image/jpeg',buffer:await photoDeTest(page)});
  await expect(page.locator('#photoChip')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>window.__vh2.app.donnees().lieux.some(l=>l.name==='Dinard'))).toBe(true);
  const e=await page.evaluate(()=>window.__vh2.app.etat());
  expect(e.chargementLieux).toBe(true);   // la course entre miroirs dure encore
  expect(e.source).toMatch(/atlas local|\(en cours\)/);
  await page.click('#btnSet'); await page.click('details[data-grp=off] summary'); await page.click('#btnDbg');
  await expect(page.locator('#dbgBody')).toContainText('chargement en cours depuis');
  await expect(page.locator('#dbgBody')).toContainText('OSM : en cours');
  expect(erreurs).toEqual([]);
});

test('visibilité d’après la photo : la case lit la silhouette du ciel (ciel / décor), la publie, la diagnostique, et la retire quand on la décoche',async({page})=>{
  const erreurs=await ouvrir(page);
  await page.setInputFiles('#photoFile',{name:'PXL_test.jpg',mimeType:'image/jpeg',buffer:await photoDeTest(page)});
  await expect(page.locator('#photoChip')).toBeVisible();
  expect(await page.evaluate(()=>window.__vh2.app.donnees().analysePhoto)).toBeNull();
  await page.click('#btnSet'); await page.click('details[data-grp=cap] summary'); await page.check('#phv');
  await expect.poll(()=>page.evaluate(()=>{ const a=window.__vh2.app.donnees().analysePhoto; return a&&a.ok; }),{timeout:10000}).toBe(true);
  const a=await page.evaluate(()=>{ const x=window.__vh2.app.donnees().analysePhoto; return {n:x.cols.length,skyFrac:x.skyFrac,angles:x.cols.map(c=>c.a),top:x.cols.filter(c=>c.top).length}; });
  expect(a.n).toBeGreaterThan(120); expect(a.skyFrac).toBeGreaterThan(0.9); expect(a.top).toBe(0);
  // photo : ciel en haut, décor en bas, horizon au milieu de l'image ; l'écran affiche un horizon à 0° : la limite lue est à ~0°
  for(const v of a.angles) expect(Math.abs(v)).toBeLessThan(2.5);
  // mémorisé sous vh2:, diagnostic lisible
  expect(JSON.parse(await page.evaluate(()=>localStorage.getItem('vh2:reglages'))).d.photoVis).toBe(true);
  await page.click('details[data-grp=off] summary'); await page.click('#btnDbg');
  await expect(page.locator('#dbgBody')).toContainText('silhouette lue il y a');
  await expect(page.locator('#dbgBody')).toContainText('colonnes (ciel');
  await page.click('#dbgClose'); await page.click('#btnSet');
  await page.uncheck('#phv');
  expect(await page.evaluate(()=>window.__vh2.app.donnees().analysePhoto)).toBeNull();
  expect(erreurs).toEqual([]);
});

test('un libellé sous chaque icône de la colonne de boutons (photo et direct)',async({page})=>{
  await page.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort());
  for(const url of ['/v2/photo.html','/v2/ar.html']){
    await page.goto(url);
    const libelles=await page.evaluate(()=>[...document.querySelectorAll('#tools button')].map(b=>{ const l=b.querySelector('.lbl'), r=b.getBoundingClientRect(); return [l?l.textContent:'',Math.round(r.width)===Math.round(r.height)]; }));
    expect(libelles.map(x=>x[0]),url).toEqual(['Calques','Cherch.','Caler','Pointer','Relire','Écran']);
    expect(libelles.every(x=>x[1]),'les boutons restent carrés').toBe(true);
  }
});
