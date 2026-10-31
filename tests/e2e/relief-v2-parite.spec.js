// Parité du relief v2 avec la v1 sur des scènes RÉELLES (photos et caches du dépôt privé Ar_city-photos) :
// la v1 calcule son terrain avec le vrai code et les caches rejoués ; les modules v2 (donnees/ et scene/) relisent les MÊMES tuiles
// et doivent donner : mêmes tuiles décodées, même hauteur d'œil, même masque, même verdict de relief pour chaque lieu.
// Ignoré sans le dossier PHOTOS_DIR (CI sans jeton, REFONTE.md §9).
const {test,expect}=require('@playwright/test');
const fs=require('fs'), path=require('path');
const {openApp}=require('../helpers/app.js');
const {readExports,seedCaches}=require('../helpers/cache.js');
const {reliefUrls}=require('../helpers/relief-urls.js');

const {PHOTOS_DIR,ignorerSiAbsent}=require('../helpers/scenes-reelles.js');
const fichiers=fs.existsSync(PHOTOS_DIR)?fs.readdirSync(PHOTOS_DIR).filter(f=>/^villes-horizon-.*\.json$/.test(f)).map(f=>path.join(PHOTOS_DIR,f)):[];
const SCENES=[
  {id:'saint-malo-rempart',photo:'PXL_20261025_112230293.jpg',radius:30,heure:'2026-10-25T11:22:30Z'},
  {id:'ibiza-coucher',photo:'PXL_20260927_173517301.jpg',radius:30,heure:'2026-09-27T17:35:17Z'},
];
let exportsCache=null;
const exports_=()=>exportsCache||(exportsCache=readExports(fichiers));

for(const sc of SCENES){
  test(`relief v2 = v1 sur la scène réelle ${sc.id}`,async({browser})=>{
    ignorerSiAbsent(test,sc);
    test.setTimeout(420000);
    const {lireExif}=await import('../../src/noyau/exif.js');
    const b=fs.readFileSync(path.join(PHOTOS_DIR,sc.photo)), ex=lireExif(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
    const pos={lat:ex.lat,lon:ex.lon};
    const ctx=await browser.newContext({viewport:{width:915,height:412},deviceScaleFactor:2,hasTouch:true,locale:'fr-FR',timezoneId:'Europe/Paris',baseURL:`http://127.0.0.1:${+(process.env.PORT||4173)}`,permissions:['geolocation']});
    const page=await ctx.newPage(), erreurs=[]; page.on('pageerror',e=>erreurs.push(String(e)));
    const settings={relief:true,hamlets:true,telecom:true,buildings:true,poi:{lighthouse:true,cape:true,rock:true,view:true,heritage:true,beach:true},sea:false,air:false,photoVis:false,radius:sc.radius};
    const app=await openApp(page,{reel:true,start:false,time:new Date(sc.heure),settings,pos});
    const urls=reliefUrls(pos).tout;
    await seedCaches(page,{entries:exports_().entries.filter(e=>e.c==='dc'||urls.has(e.k))});
    await page.click('#go');
    await page.waitForFunction(()=>document.getElementById('start').style.display==='none');
    await page.setInputFiles('#photoFile',path.join(PHOTOS_DIR,sc.photo));
    await app.waitFor('photoMode&&pos');
    await app.waitFor('terrain&&!terrain.refining&&!terrainBusy&&reliefState==="ok"',240000);
    await new Promise(r=>setTimeout(r,2000));
    // L'horloge de test est figée : terrain.at est identique aux deux publications et la v1 garde l'altitude des lieux lue dans le relief lointain
    // (c.demT). En conditions réelles l'horloge avance et ces altitudes sont relues après le relief fin : on le reproduit.
    await app.ev('for(const c of cities.concat(farPeaks,monumentSites)) c.demT=0; applyOcclusion(false)');
    await app.waitFor('terrain&&!terrain.refining&&!terrainBusy',60000);

    const r=await page.evaluate(async()=>{
      const rel=await import('/src/scene/relief.js'), mq=await import('/src/scene/masque.js'), ho=await import('/src/scene/hauteur-oeil.js'),
        vis=await import('/src/scene/visibilite.js'), tr=await import('/src/donnees/tuiles-relief.js'), rs=await import('/src/donnees/reseau.js'),
        ca=await import('/src/donnees/cache-api.js'), dec=await import('/src/donnees/decodage-navigateur.js');
      const T=window.__vh.ev('terrain'), c=T.c, out={};
      // bandes de la v1 → format v2
      const bands=T.bands.map(b=>({z:b.z,max:b.max,ts:b.ts,shift:b.shift,garantie:b.guaranteed,tx0:b.tx0,ty0:b.ty0,nx:b.nx,ny:b.ny,tiles:b.tiles,altIdx:b.altIdx}));
      out.source=T.src; out.nTuiles=bands.reduce((s,b)=>s+b.tiles.length,0); out.nTuilesNulles=bands.reduce((s,b)=>s+b.tiles.filter(t=>!t).length,0);
      // 1. hauteur d'œil
      const sol0=ho.estimerSol(bands,c), ef=ho.solFin(bands,c);
      out.h0={v1:T.h0,v2:ho.altitudeOeil(Number.isNaN(ef)?sol0.solM:ef,0),fin:!Number.isNaN(ef),origineV1:window.__vh.ev('obsGroundSrc'),origineV2:Number.isNaN(ef)?sol0.origine:ho.ORIGINE_SOL.finRelu};
      // 2. masque (720 relèvements, angles bruts compris)
      const pm=await mq.calculerMasque(bands,c,T.h0,async()=>{});
      let diffs=0; for(let i=0;i<720;i++){ for(let k=0;k<pm[i].length;k++){ if(!Object.is(pm[i][k],T.pm[i][k])) diffs++; if(!Object.is(pm.raw[i][k],T.pm.raw[i][k])) diffs++; } }
      out.masque={diffs}; out.silhouetteMax=Math.max(...T.pm.map(r=>r[r.length-1]));
      // 3. verdict de relief de chaque lieu / monument / sommet
      const tous=[...window.__vh.ev('cities'),...window.__vh.ev('farPeaks'),...window.__vh.ev('monumentSites')].filter(x=>x.dist!=null);
      const masque={oeilM:T.h0,pm:T.pm}; const ecarts=[]; let nCaches=0;
      for(const x of tous){ const v=vis.verdictRelief(masque,bands,{...x,dem:undefined});
        if(x.hidden) nCaches++;
        if(v.hidden!==x.hidden||!Object.is(v.aG,x.aG)||!Object.is(v.aP,x.aP)||!Object.is(v.mask,x.mask)||v.low!==!!x.low) ecarts.push({nom:x.name,kind:x.kind,src:x.src,ht:x.ht,dem1:x.dem,dem2:vis.verdictRelief&&null,dist:x.dist,v1:{h:x.hidden,low:x.low,aG:x.aG,aP:x.aP,m:x.mask},v2:v}); }
      out.verdicts={n:tous.length,caches:nCaches,ecarts:ecarts.slice(0,5),nEcarts:ecarts.length,parType:Object.entries(ecarts.reduce((a,e)=>{ const k=(e.kind||'?')+'/'+(e.src||'?'); a[k]=(a[k]||0)+1; return a; },{}))};
      // 4. tuiles : le chargeur v2 relit les mêmes octets (cache de la v1) et décode les mêmes pixels
      const reseau=rs.creerReseau({fetchImpl:(u,i)=>fetch(u,i),cache:ca.creerCacheOctets('vh-terrain-v1')}), ch=tr.creerChargeurTuiles({reseau,decoder:dec.decoderTuile});
      const src=T.src==='mapterhorn'?'mapterhorn':'aws'; let comparees=0, differentes=0, manquantes=0;
      for(const b of T.bands){ for(let idx=0;idx<b.tiles.length;idx++){ const t1=b.tiles[idx]; if(!t1||idx%3) continue; // un tiers des tuiles : le temps reste raisonnable
          const r2=await ch.charger({z:b.z,x:b.tx0+idx%b.nx,y:b.ty0+Math.floor(idx/b.nx)},src,b.ts,b.guaranteed);
          if(!r2.data){ manquantes++; continue; }
          comparees++; let d=r2.data.length!==t1.length; for(let i=0;!d&&i<t1.length;i++) if(t1[i]!==r2.data[i]) d=true; if(d) differentes++; } }
      out.tuiles={comparees,differentes,manquantes};
      return out;
    });
    console.log(sc.id,JSON.stringify({...r,verdicts:{...r.verdicts,ecarts:r.verdicts.nEcarts}}));
    expect(r.nTuiles-r.nTuilesNulles,'des tuiles de relief doivent être présentes').toBeGreaterThan(50);
    expect(r.h0.v2).toBe(r.h0.v1); expect(r.h0.origineV2).toBe(r.h0.origineV1);
    expect(r.masque.diffs).toBe(0); expect(r.silhouetteMax).toBeGreaterThan(-90);
    expect(r.verdicts.n).toBeGreaterThan(20); expect(r.verdicts.ecarts).toEqual([]);
    expect(r.tuiles.comparees).toBeGreaterThan(10); expect(r.tuiles.differentes).toBe(0);
    expect(erreurs).toEqual([]);
    await ctx.close();
  });
}
