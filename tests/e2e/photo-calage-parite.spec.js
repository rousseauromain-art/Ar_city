// Parité avec la v1 du CALAGE SUR LE SOLEIL et du POINTAGE sur des photos RÉELLES (dépôt privé Ar_city-photos), à l'heure RÉELLE de la prise de vue :
//  1. les pixels lus (480 px de large, recadrés comme l'écran) sont identiques octet pour octet (somme et empreinte) ;
//  2. `sunAlign()` de la v1 = `calerSurSoleil` de la v2 : même résultat (cap, horizon, nombre de candidats) ou même message de refus ;
//  3. `pointCalibrate` de la v1 = `pointer` de la v2 sur une grille de touchers : mêmes corrections et même texte.
// Ignoré sans le dossier PHOTOS_DIR (CI sans jeton).
const {test,expect}=require('@playwright/test');
const path=require('path'), fs=require('fs');
const {ouvrirSceneReelle,ignorerSiAbsent,PHOTOS_DIR}=require('../helpers/scenes-reelles.js');
const {seedCaches,readExports}=require('../helpers/cache.js');
const {reliefUrls}=require('../helpers/relief-urls.js');

test.describe.configure({retries:1});
const SCENES=[
  {id:'ibiza-coucher',photo:'PXL_20260927_173517301.jpg',radius:30,heureReelle:true},
  {id:'saint-malo-rempart',photo:'PXL_20261025_112230293.jpg',radius:30,heureReelle:true},
  {id:'turin-san-carlo',photo:'PXL_20261022_104200724.jpg',radius:30,heureReelle:true},
  {id:'morgat-plage',photo:'PXL_20260824_175454144.jpg',radius:180,heureReelle:true},
];
const REGLAGES={relief:true,skyline:false,hamlets:true,telecom:true,buildings:true,sea:false,air:false,photoVis:false,cross:false,
  layers:{places:true,monuments:true,equip:true,urban:false,urbClip:true,urbSmooth:true,urbFill:true},poi:{lighthouse:true,cape:true,rock:true,view:true,heritage:true,beach:true}};
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
const EMPREINTE='(r=>{ if(!r) return null; let s=0,t=0; for(let i=0;i<r.d.length;i++){ s+=r.d[i]; t=(Math.imul(t,31)+r.d[i])>>>0; } return {cw:r.cw,ch:r.ch,s,t}; })';

for(const sc of SCENES){
  test(`calage sur le soleil et pointage v2 = v1 sur la scène réelle ${sc.id}`,async({browser})=>{
    ignorerSiAbsent(test,sc);
    test.setTimeout(900000);
    const v1=await ouvrirSceneReelle(browser,sc,{reglages:REGLAGES}), {app,page}=v1;
    await app.waitFor('!monBusy&&!towerBusy&&!telecomBusy&&!buildingsBusy',120000);
    await app.ev('for(const c of cities.concat(farPeaks,monumentSites)){ c.demT=0; c._skyT=0; } for(const b of buildingSites) b._gT=0; applyOcclusion(false); _ridgesAt=0; _skyDistAt=0; true');

    const ecran=sc.ecran||{width:915,height:412};
    const ctx2=await browser.newContext({viewport:ecran,deviceScaleFactor:2,hasTouch:true,locale:'fr-FR',timezoneId:'Europe/Paris',baseURL:`http://127.0.0.1:${+(process.env.PORT||4173)}`,permissions:['geolocation']});
    const p2=await ctx2.newPage(), erreurs=[]; p2.on('pageerror',e=>erreurs.push(String(e)));
    await p2.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort());
    await p2.addInitScript(reseauCoupe);
    await p2.addInitScript(s=>{ try{ localStorage.setItem('vh2:reglages',JSON.stringify({v:1,d:s})); }catch(e){} },{...REGLAGES,radius:sc.radius,headOff:0,pitchOff:0});
    await p2.goto('/v2/photo.html');
    const urls=reliefUrls(v1.pos).tout, exp=readExports(fichiersExport());
    await seedCaches(p2,{entries:exp.entries.filter(e=>e.c==='dc'||urls.has(e.k))},{noms:{t:'vh2-terrain',dc:'vh2-donnees'}});
    await p2.setInputFiles('#photoFile',path.join(PHOTOS_DIR,sc.photo));
    await p2.waitForFunction(()=>window.__vh2&&window.__vh2.photo());
    let derniere='', stable=0; const t0=Date.now();
    while(Date.now()-t0<240000){
      const sig=await p2.evaluate(()=>{ const a=window.__vh2.app, e=a.etat(), pret=e.etatRelief==='ok'&&!e.chargementLieux&&!/en cours|atlas|intégrée/.test(e.source); return [e.version,pret,a.occupe()].join('|'); });
      stable=sig===derniere&&sig.endsWith('|true|false')?stable+500:0; derniere=sig; if(stable>=4000) break; await new Promise(r=>setTimeout(r,500));
    }
    expect(stable,'la v2 doit finir de charger').toBeGreaterThanOrEqual(4000);
    await app.ev('S.photoVis=false; $("note").style.display="none"; true'); await p2.evaluate(()=>{ window.__vh2.S.photoVis=false; for(let i=0;i<3;i++) window.__vh2.rendreImage(); });
    await app.frame(); await app.frame();

    // 1. pixels
    const e1=await app.ev(`${EMPREINTE}(grabFrameRGB(480))`);
    const e2=await p2.evaluate(async(src)=>{ const m=await import('/src/vision/lire-pixels.js'); const W=innerWidth,H=innerHeight; return eval(src)(m.lirePixelsRecadres(document.getElementById('photoBg'),480,{largeurPx:W,hauteurPx:H})); },EMPREINTE);
    console.log(sc.id,'pixels',JSON.stringify(e1));
    expect(e2,'pixels réduits identiques à la v1').toEqual(e1);

    // 2. calage sur le soleil, à l'heure réelle de la photo
    const s1=await app.ev('sunAlign()'), s2=await p2.evaluate(()=>window.__vh2.evaluerSoleil());
    console.log(sc.id,'soleil v1',JSON.stringify(s1),'v2',JSON.stringify(s2));
    expect(s2.ok,'soleil : même verdict').toBe(s1.ok);
    if(s1.ok){ expect(Math.abs(s2.dh-s1.dh)).toBeLessThan(1e-6); expect(Math.abs(s2.dp-s1.dp)).toBeLessThan(1e-6); expect(s2.n).toBe(s1.n); } else expect(s2.message).toBe(s1.msg);

    // 3. pointage : grille de touchers (la v1 les applique : on rétablit le calage entre deux touchers)
    const W=ecran.width, H=ecran.height; let compares=0, trouves=0;
    for(const fy of [0.2,0.35,0.5,0.65,0.8]) for(const fx of [0.08,0.2,0.35,0.5,0.65,0.8]){
      const x=Math.round(W*fx), y=Math.round(H*fy);
      const a=await app.ev(`(()=>{ const h=S.headOff,p=S.pitchOff,n=$('note'); n.textContent=''; const r=pointCalibrate(${x},${y}); const o={ok:!!r,dh:S.headOff-h,dp:S.pitchOff-p,note:n.textContent}; S.headOff=h; S.pitchOff=p; return o; })()`);
      const b=await p2.evaluate(([x,y])=>{ const r=window.__vh2.evaluerPointage(x,y); return r.aucun?{ok:false,note:r.note}:{ok:true,dh:r.correctionCapDeg,dp:r.correctionHorizonDeg||0,note:r.note}; },[x,y]);
      expect(b.ok,`toucher (${x},${y}) : même verdict`).toBe(a.ok);
      if(a.ok){ trouves++; expect(Math.abs(b.dh-a.dh),`toucher (${x},${y}) : cap`).toBeLessThan(1e-6); expect(Math.abs(b.dp-a.dp),`toucher (${x},${y}) : horizon`).toBeLessThan(1e-6); expect(b.note,`toucher (${x},${y}) : texte`).toBe(a.note); }
      else expect(b.note).toBe(a.note);
      compares++;
    }
    console.log(sc.id,'touchers comparés',compares,'· repères trouvés',trouves);
    expect(trouves,'des touchers doivent tomber sur un repère').toBeGreaterThan(0);
    expect(erreurs).toEqual([]);
    await ctx2.close(); await v1.ctx.close();
  });
}
