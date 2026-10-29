// Ouverture d'une SCÈNE RÉELLE (photo + caches du dépôt privé Ar_city-photos) dans la page photo de la v2, en face de la v1 ouverte par `ouvrirSceneReelle` : mêmes caches rejoués
// sous les noms vh2-, même écran, mêmes réglages, réseau coupé comme pour la v1. La page est rendue quand la v2 a fini de charger (relief fini, lieux des sources vivantes, plus rien d'occupé).
const path=require('path'), fs=require('fs');
const {PHOTOS_DIR}=require('./scenes-reelles.js');
const {seedCaches,readExports}=require('./cache.js');
const {reliefUrls}=require('./relief-urls.js');

/** Réseau coupé : relief absent du cache = 404, gabarit OpenFreeMap, le reste en panne (comme tests/helpers/app.js pour la v1). */
function reseauCoupe(){
  const reel=window.fetch.bind(window);
  window.fetch=async(input,init)=>{
    const url=typeof input==='string'?input:(input&&input.url)||String(input), u=new URL(url,location.href);
    if(u.origin===location.origin) return reel(input,init);
    if(/tiles\.mapterhorn\.com|elevation-tiles-prod/.test(u.href)) return new Response('',{status:404});
    if(u.href==='https://tiles.openfreemap.org/planet') return new Response(JSON.stringify({tiles:['https://tiles.openfreemap.org/planet/rejeu/{z}/{x}/{y}.pbf']}),{status:200,headers:{'Content-Type':'application/json'}});
    return new Response('{"error":"hors ligne (test)"}',{status:503,headers:{'Content-Type':'application/json'}});
  };
}
const fichiersExport=()=>fs.readdirSync(PHOTOS_DIR).filter(f=>/^villes-horizon-.*\.json$/.test(f)).map(f=>path.join(PHOTOS_DIR,f));

/**
 * @param {import('@playwright/test').Browser} browser @param {{photo:string, radius:number, ecran?:{width:number,height:number}}} sc
 * @param {{pos:{lat:number,lon:number}}} v1 la scène ouverte dans la v1 @param {{reglages:object, nuit?:boolean}} opts `nuit` : l'heure de prise de vue est forcée de nuit (pas de symbole du soleil), comme dans la v1 des tests
 */
async function ouvrirV2Reelle(browser,sc,v1,{reglages,nuit=true}){
  const ecran=sc.ecran||{width:915,height:412};
  const ctx=await browser.newContext({viewport:ecran,deviceScaleFactor:2,hasTouch:true,locale:'fr-FR',timezoneId:'Europe/Paris',baseURL:`http://127.0.0.1:${+(process.env.PORT||4173)}`,permissions:['geolocation']});
  const page=await ctx.newPage(), erreurs=[]; page.on('pageerror',e=>erreurs.push(String(e)));
  await page.addInitScript({path:path.join(__dirname,'enregistreur.js')});
  await page.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort());
  await page.addInitScript(reseauCoupe);
  await page.addInitScript(s=>{ try{ localStorage.setItem('vh2:reglages',JSON.stringify({v:1,d:s})); }catch(e){} },{...reglages,radius:sc.radius,headOff:0,pitchOff:0});
  await page.goto('/v2/photo.html');
  const urls=reliefUrls(v1.pos).tout, exp=readExports(fichiersExport());
  await seedCaches(page,{entries:exp.entries.filter(e=>e.c==='dc'||urls.has(e.k))},{noms:{t:'vh2-terrain',dc:'vh2-donnees'}});
  await page.setInputFiles('#photoFile',path.join(PHOTOS_DIR,sc.photo));
  await page.waitForFunction(()=>window.__vh2&&window.__vh2.photo());
  if(nuit) await page.evaluate(()=>{ window.__vh2.photo().photo.utc=Date.UTC(2026,0,1,1,0,0); });
  let derniere='', stable=0; const t0=Date.now();
  while(Date.now()-t0<240000){
    const sig=await page.evaluate(()=>{ const a=window.__vh2.app, e=a.etat(), pret=e.etatRelief==='ok'&&!e.chargementLieux&&!/en cours|atlas|intégrée/.test(e.source); return [e.version,pret,a.occupe()].join('|'); });
    stable=sig===derniere&&sig.endsWith('|true|false')?stable+500:0; derniere=sig; if(stable>=4000) break; await new Promise(r=>setTimeout(r,500));
  }
  if(stable<4000) throw new Error('la v2 ne finit pas de charger');
  return {ctx,page,erreurs,ecran};
}
module.exports={ouvrirV2Reelle,fichiersExport};
