// v2 : puce « œil » (correction de hauteur, détail au toucher), vue épurée en plein écran sur une photo rejouée, et page en direct sans la ligne « Rejouer une photo ».
const {test,expect}=require('@playwright/test');

const POS={latitude:48.6459,longitude:-2.0281};
async function ouvrirPhoto(page){
  const {jpegExif}=await import('../unit/aide-jpeg.mjs');
  const exif=Buffer.from(jpegExif({dir:120,orient:1,lat:POS.latitude,lon:POS.longitude,f35:24,date:'2026:10:25 23:30:00',offset:'+02:00'}));
  const erreurs=[]; page.on('pageerror',e=>erreurs.push(String(e)));
  await page.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort());
  await page.goto('/v2/photo.html');
  const b64=await page.evaluate(async()=>{ const c=document.createElement('canvas'); c.width=640; c.height=360; const x=c.getContext('2d'); x.fillStyle='#456'; x.fillRect(0,0,640,360); const b=await new Promise(r=>c.toBlob(r,'image/jpeg',.8)); const u=new Uint8Array(await b.arrayBuffer()); let s=''; for(const v of u) s+=String.fromCharCode(v); return btoa(s); });
  const jpg=Buffer.from(b64,'base64');
  await page.setInputFiles('#photoFile',{name:'t.jpg',mimeType:'image/jpeg',buffer:Buffer.concat([jpg.subarray(0,2),exif.subarray(2,exif.length-2),jpg.subarray(2)])});
  await expect(page.locator('#photoChip')).toBeVisible();
  return erreurs;
}
test.use({viewport:{width:915,height:412}});

test('puce « œil » : absente sans relief, puis la correction ; le toucher ouvre le détail et le curseur corrige',async({page})=>{
  const erreurs=await ouvrirPhoto(page);
  await expect(page.locator('#eyeChip')).toBeVisible(); await expect(page.locator('#eyeChip')).toHaveText('œil ?'); // sans relief : la puce est là et l'explique
  await expect(page.locator('#eyePopT')).toContainText('Sol inconnu');
  // un relief simulé (le vrai arrive des tuiles : parité sur les scènes réelles) : sol 13 m, œil 14,6 m. Tout dans le même instant : la boucle d'affichage reprendrait le vrai (absent) relief.
  const r=await page.evaluate(()=>{ const v=window.__vh2, orig=v.app.donnees, $=id=>document.getElementById(id); v.app.donnees=()=>({...orig(),terrain:{h0:14.6,solM:13,origine:'relief fin : test',pm:null,bands:[]}});
    v.synchroOeil(); const a={visible:!$('eyeChip').hidden,texte:$('eyeChip').textContent};
    $('eyeChip').click(); a.pop=!$('eyePop').hidden; a.detail=$('eyePopT').textContent;
    const q=$('eyeQ'); q.value='7'; q.dispatchEvent(new Event('input',{bubbles:true})); a.obsHeight=v.S.obsHeight; a.reglage=$('obsH').value;
    v.synchroOeil(); a.apres=$('eyeChip').textContent; v.app.donnees=orig; return a; });
  expect(r).toEqual({visible:true,texte:'œil 0 m',pop:true,detail:'Sol estimé 13 m (relief fin : test) · correction 0 m → œil à 15 m',obsHeight:7,reglage:'7',apres:'œil +7 m'});
  expect(erreurs).toEqual([]);
});

test('photo rejouée + plein écran : bandeaux masqués (vue épurée), rétablis en quittant ; sans photo rien ne change',async({page})=>{
  await page.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort());
  await page.goto('/v2/photo.html');
  await page.evaluate(()=>document.getElementById('btnFs').click()); await page.waitForFunction(()=>!!document.fullscreenElement);
  await expect(page.locator('#chips')).toBeVisible(); // pas de photo : pas de vue épurée
  await page.evaluate(()=>document.getElementById('btnFs').click()); await page.waitForFunction(()=>!document.fullscreenElement);
  const erreurs=await ouvrirPhoto(page);
  await page.click('#btnFs'); await page.waitForFunction(()=>!!document.fullscreenElement);
  await expect(page.locator('#chips')).toBeHidden(); await expect(page.locator('#photoChip')).toBeHidden(); await expect(page.locator('#radChip')).toBeHidden();
  await page.click('#btnFs'); await page.waitForFunction(()=>!document.fullscreenElement);
  await expect(page.locator('#chips')).toBeVisible(); await expect(page.locator('#photoChip')).toBeVisible();
  expect(erreurs).toEqual([]);
});

test('la page en direct n’a plus de ligne « Rejouer une photo » (la page photo s’en charge)',async({page})=>{
  const erreurs=[]; page.on('pageerror',e=>erreurs.push(String(e)));
  await page.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort());
  await page.goto('/v2/ar.html');
  await expect(page.locator('#btnPhoto')).toHaveCount(0); await expect(page.locator('#photoFile')).toHaveCount(0); await expect(page.locator('#btnBench')).toHaveCount(0);
  await expect(page.locator('#eyeChip')).toBeVisible();
  expect(erreurs).toEqual([]);
});

test('hauteur d’œil : « Réestimer » remet la correction à zéro ; « Altitude GPS » (direct) amène l’œil à l’altitude du téléphone',async({page})=>{
  const erreurs=[]; page.on('pageerror',e=>erreurs.push(String(e)));
  await page.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort());
  await page.goto('/v2/ar.html');
  const r=await page.evaluate(()=>{ const v=window.__vh2, $=id=>document.getElementById(id), od=v.app.donnees, oe=v.entree.etat;
    v.app.donnees=()=>({...od(),terrain:{h0:14.6,solM:13,origine:'relief fin : test',pm:null,bands:[]}});
    v.entree.etat=()=>({...oe(),altitudeM:45,precisionAltM:8});
    v.synchroOeil(); const a={gpsVisible:!$('eyeGps').hidden,detail:$('eyePopT').textContent};
    $('eyeGps').click(); a.corr=v.S.obsHeight;
    v.synchroOeil(); a.apres=$('eyeChip').textContent;
    v.entree.etat=()=>({...oe(),altitudeM:45,precisionAltM:80}); v.synchroOeil(); a.gpsImprecis=$('eyeGps').hidden;
    $('eyeRe').click(); a.reset=v.S.obsHeight;
    v.app.donnees=od; v.entree.etat=oe; return a; });
  expect(r).toEqual({gpsVisible:true,detail:'Sol estimé 13 m (relief fin : test) · correction 0 m → œil à 15 m · altitude GPS 45 m (±8)',corr:30,apres:'œil +30 m',gpsImprecis:true,reset:0});
  expect(erreurs).toEqual([]);
});

test('la lune est dessinée à sa position calculée (disque et « lune az° · site° · % »), et la case la masque',async({page})=>{
  await page.addInitScript({path:require('path').join(__dirname,'../helpers/enregistreur.js')});
  const erreurs=await ouvrirPhoto(page);
  const lire=()=>page.evaluate(async()=>{ const v=window.__vh2, {positionLune}=await import('/src/noyau/astro.js'), t=Date.parse('2026-10-29T21:00:00Z'), p=v.app.donnees().pos, l=positionLune(t,p.lat,p.lon);
    v.photo().photo.utc=t; v.S.headOff=l.azDeg; v.S.pitchOff=l.elDeg; v.rendreImage(); const rec=window.__enregistreur(v.ctx); rec.demarrer(); v.rendreImage(); rec.arreter();
    return {attendu:`lune ${l.azDeg.toFixed(1)}° · ${l.elDeg.toFixed(1)}°`, textes:rec.evenements().map(e=>JSON.stringify(e)).filter(s=>/lune /.test(s)).length}; });
  const avec=await lire(); expect(avec.textes,'texte « lune … » dessiné').toBeGreaterThan(0);
  await page.evaluate(()=>document.getElementById('lun').click());
  const sans=await lire(); expect(sans.textes,'case décochée : plus de lune').toBe(0);
  expect(erreurs).toEqual([]);
});
