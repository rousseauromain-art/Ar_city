// Ouverture d'une SCÈNE RÉELLE dans la v1 figée (photos et caches du dépôt privé Ar_city-photos) : le vrai code relit les caches rejoués,
// rien n'est simulé. Sert aux tests de parité v1/v2. Ignorer le test si le dépôt privé est absent (CI sans jeton, REFONTE.md §9).
const fs=require('fs'), path=require('path');
const {openApp}=require('./app.js');
const {readExports,seedCaches}=require('./cache.js');
const {reliefUrls}=require('./relief-urls.js');

const PHOTOS_DIR=process.env.PHOTOS_DIR||'/home/user/ar_city-photos';
const fichiersExport=()=>fs.existsSync(PHOTOS_DIR)?fs.readdirSync(PHOTOS_DIR).filter(f=>/^villes-horizon-.*\.json$/.test(f)).map(f=>path.join(PHOTOS_DIR,f)):[];
let memo=null;
const exportsCache=()=>memo||(memo=readExports(fichiersExport()));
/** Les caches et la photo de la scène sont-ils disponibles ? */
const disponible=sc=>fichiersExport().length>0&&(!sc.photo||fs.existsSync(path.join(PHOTOS_DIR,sc.photo)));

// attend que les chargements (lieux, relief, monuments...) soient finis ET que les compteurs ne bougent plus
async function attendreStable(app,minMs=3000){
  const signature='[cities.length,monumentSites.length,telecomSites.length,buildingSites.length,farPeaks.length,citiesVer,terrain?terrain.at:0,loading,terrainBusy,monBusy,telecomBusy,buildingsBusy].join("|")';
  let derniere='', stable=0; const t0=Date.now();
  while(Date.now()-t0<150000){
    const sig=await app.ev(signature); stable=sig===derniere?stable+500:0; derniere=sig;
    const occupe=sig.split('|').slice(7).some(v=>v==='true');
    if(stable>=minMs&&!occupe) return;
    await new Promise(r=>setTimeout(r,500));
  }
  throw new Error('la scène ne se stabilise pas : '+derniere);
}

/**
 * sc : { id, photo?, pos?, capDeg?, radius, heure? (ISO), ecran? }. opts.reglages : réglages de la v1 en plus des réglages de base.
 * Retourne { app, page, ctx, pos, erreurs, cap0 } ; après l'appel le relief est complet et les altitudes des lieux relues.
 */
async function ouvrirSceneReelle(browser,sc,opts={}){
  const {lireExif}=await import('../../src/noyau/exif.js');
  let pos=sc.pos;
  if(sc.photo){ const b=fs.readFileSync(path.join(PHOTOS_DIR,sc.photo)), ex=lireExif(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)); pos={lat:ex.lat,lon:ex.lon}; }
  const ecran=sc.ecran||{width:915,height:412};
  const ctx=await browser.newContext({viewport:ecran,deviceScaleFactor:2,hasTouch:true,locale:'fr-FR',timezoneId:'Europe/Paris',baseURL:`http://127.0.0.1:${+(process.env.PORT||4173)}`,permissions:['geolocation']});
  const page=await ctx.newPage(), erreurs=[]; page.on('pageerror',e=>erreurs.push(String(e)));
  await page.addInitScript({path:path.join(__dirname,'enregistreur.js')});
  const settings={radius:sc.radius,headOff:sc.capDeg||0,pitchOff:0,...(opts.reglages||{})};
  const app=await openApp(page,{reel:true,start:false,time:sc.heure?new Date(sc.heure):undefined,settings,pos});
  const urls=reliefUrls(pos).tout;
  await seedCaches(page,{entries:exportsCache().entries.filter(e=>e.c==='dc'||urls.has(e.k))});
  await page.click('#go');
  await page.waitForFunction(()=>document.getElementById('start').style.display==='none');
  if(sc.photo){ await page.setInputFiles('#photoFile',path.join(PHOTOS_DIR,sc.photo)); await app.waitFor('photoMode&&pos'); } else await app.waitFor('pos');
  await attendreStable(app);
  // horloge de test figée : terrain.at ne change pas entre les deux publications du relief et la v1 garderait l'altitude des lieux lue dans le
  // relief lointain (c.demT) ; en conditions réelles elles sont relues. On le reproduit.
  await app.ev('for(const c of cities.concat(farPeaks,monumentSites)) c.demT=0; applyOcclusion(false); true');
  await attendreStable(app,1500);
  if(sc.photo) await app.ev('photoMode.utc=Date.UTC(2026,0,1,1,0,0); true'); // heure de nuit : pas de symbole du soleil dans la scène
  const cap0=await app.ev('S.headOff');
  return {app,page,ctx,pos,erreurs,cap0};
}
module.exports={PHOTOS_DIR,ouvrirSceneReelle,disponible,attendreStable};
