// Parité de BOUT EN BOUT de la page photo v2 (v2/photo.html) avec la v1 : la même photo réelle, les mêmes caches rejoués (sous les noms vh- pour la v1, vh2- pour la v2), aucun réseau.
// La v2 charge ELLE-MÊME ses données (lieux, relief en deux passes, monuments, tours, pylônes, repères hauts) : sa trame doit être celle de la v1 — chaque trait et chaque texte,
// ruban de cap et bandeau compris — en Essentiel et en Tout voir, pour trois poses. Ignoré sans le dépôt privé Ar_city-photos (PHOTOS_DIR).
const {test,expect}=require('@playwright/test');
const path=require('path');
const {ouvrirSceneReelle,ignorerSiAbsent,PHOTOS_DIR}=require('../helpers/scenes-reelles.js');
const {seedCaches,readExports}=require('../helpers/cache.js');
const {reliefUrls}=require('../helpers/relief-urls.js');
const fs=require('fs');

// local seulement (dépôt privé) : sous forte charge, un seul rejeu sur une dizaine tombait pendant qu'une des deux pages finissait de charger (écart d'ops à la 1re pose) ; une reprise suffit, un vrai écart échoue deux fois
test.describe.configure({retries:1});

const SCENES=[
  {id:'saint-malo-rempart',photo:'PXL_20261025_112230293.jpg',radius:30},
  {id:'turin-san-carlo',photo:'PXL_20261022_104200724.jpg',radius:30},
  {id:'morgat-plage',photo:'PXL_20260824_175454144.jpg',radius:180},
  {id:'ibiza-coucher-soleil',photo:'PXL_20260927_173517301.jpg',radius:30,heureReelle:true,soleil:true}, // heure réelle de la photo : le soleil est dans l'image
];
const POSES=[[0,0],[37,3],[-80,-2]];
const REGLAGES={relief:true,skyline:true,hamlets:true,telecom:true,buildings:true,sea:false,air:false,photoVis:false,cross:false,
  layers:{places:true,monuments:true,equip:true,urban:false,urbClip:true,urbSmooth:true,urbFill:true},poi:{lighthouse:true,cape:true,rock:true,view:true,heritage:true,beach:true}};
const NOMS_V2=process.env.CACHE_V1?{t:'vh-terrain-v1',dc:'vh-data-v1'}:{t:'vh2-terrain',dc:'vh2-donnees'}; // CACHE_V1=1 : la v2 ne trouve ses données que dans les caches de la v1

function fichiersExport(){ return fs.readdirSync(PHOTOS_DIR).filter(f=>/^villes-horizon-.*\.json$/.test(f)).map(f=>path.join(PHOTOS_DIR,f)); }

/** Réseau coupé comme dans les tests de la v1 : relief absent du cache = 404, gabarit OpenFreeMap, le reste en panne. */
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

for(const sc of SCENES){
  test(`page photo v2 = v1 de bout en bout sur la scène réelle ${sc.id}`,async({browser})=>{
    ignorerSiAbsent(test,sc);
    test.setTimeout(1500000);
    const v1=await ouvrirSceneReelle(browser,sc,{reglages:REGLAGES});
    const {app,page,cap0}=v1;
    await app.waitFor('!monBusy&&!towerBusy&&!telecomBusy&&!buildingsBusy',120000);
    await app.ev('for(const c of cities.concat(farPeaks,monumentSites)){ c.demT=0; c._skyT=0; } for(const b of buildingSites) b._gT=0; applyOcclusion(false); _ridgesAt=0; _skyDistAt=0; true');

    // ---- v2 : même écran, mêmes caches sous les noms vh2-, mêmes réglages
    const ecran=sc.ecran||{width:915,height:412};
    const ctx2=await browser.newContext({viewport:ecran,deviceScaleFactor:2,hasTouch:true,locale:'fr-FR',timezoneId:'Europe/Paris',baseURL:`http://127.0.0.1:${+(process.env.PORT||4173)}`,permissions:['geolocation']});
    const p2=await ctx2.newPage(), erreurs=[]; p2.on('pageerror',e=>erreurs.push(String(e)));
    await p2.addInitScript({path:path.join(__dirname,'../helpers/enregistreur.js')});
    await p2.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort()); // polices et scripts externes coupés, comme pour la v1
    await p2.addInitScript(reseauCoupe);
    const S0={...REGLAGES,radius:sc.radius,headOff:0,pitchOff:0};
    await p2.addInitScript(s=>{ try{ localStorage.setItem('vh2:reglages',JSON.stringify({v:1,d:s})); }catch(e){} },S0);
    await p2.goto('/v2/photo.html');
    const pos=v1.pos, urls=reliefUrls(pos).tout, exp=readExports(fichiersExport());
    await seedCaches(p2,{entries:exp.entries.filter(e=>e.c==='dc'||urls.has(e.k))},{noms:NOMS_V2});
    await p2.setInputFiles('#start ~ input#photoFile, #photoFile',path.join(PHOTOS_DIR,sc.photo));
    await p2.waitForFunction(()=>window.__vh2&&window.__vh2.photo());
    if(!sc.heureReelle) await p2.evaluate(()=>{ window.__vh2.photo().photo.utc=Date.UTC(2026,0,1,1,0,0); }); // heure de nuit comme dans la v1 des tests : pas de symbole du soleil (sauf la scène du soleil)
    // attendre que la v2 ait fini de charger et que rien ne bouge
    let derniere='', stable=0; const t0=Date.now();
    while(Date.now()-t0<240000){
      const sig=await p2.evaluate(()=>{ const a=window.__vh2.app, e=a.etat(), pret=e.etatRelief==='ok'&&!e.chargementLieux&&!/en cours|atlas|intégrée/.test(e.source); return [e.version,pret,a.occupe()].join('|'); }); // « prêt » : relief fini, lieux des sources vivantes (sous charge, la v2 peut rester immobile plusieurs secondes avant de finir)
      stable=sig===derniere&&sig.endsWith('|true|false')?stable+500:0; derniere=sig; if(stable>=4000) break; await new Promise(r=>setTimeout(r,500));
    }
    expect(stable,'la v2 doit finir de charger').toBeGreaterThanOrEqual(4000);
    const bilan=await p2.evaluate(()=>{ const d=window.__vh2.app.donnees(); return {lieux:d.lieux.length,monuments:d.monuments.length,pylones:d.pylones.length,reperes:d.reperes.length,terrain:!!d.terrain}; });
    const bilan1=await app.ev('({lieux:cities.length,monuments:monumentSites.length,pylones:telecomSites.length,reperes:buildingSites.length,terrain:!!terrain})');
    console.log(sc.id,'v1',JSON.stringify(bilan1),'v2',JSON.stringify(bilan));

    // mêmes données des deux côtés, dans le même ordre (les égalités de tri en dépendent), champ par champ
    { const CH=['name','lat','lon','kind','cat','qid','type','links','prot','htWd','htOsm','ht','types','why','minor','src','tdf','loc','unnamed','hint','osm','anfr','osmTall','tags'];
      const m1=await app.ev('monumentSites.map('+`(m=>{ const o={}; for(const k of ${JSON.stringify(CH)}) if(m[k]!==undefined) o[k]=m[k]; return o; })`+')');
      const m2=await p2.evaluate(CH=>window.__vh2.app.donnees().monuments.map(m=>{ const o={}; for(const k of CH) if(m[k]!==undefined) o[k]=m[k]; return o; }),CH);
      expect(m2.length,'monuments').toBe(m1.length); expect(m2,'monuments (ordre et champs)').toEqual(m1);
      const l1=await app.ev('cities.concat(farPeaks).map(c=>({name:c.name,lat:c.lat,lon:c.lon,kind:c.kind,pop:c.pop,ele:c.ele,farPeak:!!c.farPeak}))'), l2=await p2.evaluate(()=>window.__vh2.app.donnees().lieux.map(c=>({name:c.name,lat:c.lat,lon:c.lon,kind:c.kind,pop:c.pop,ele:c.ele,farPeak:!!c.farPeak})));
      expect(l2.length,'lieux et sommets lointains').toBe(l1.length); expect(l2,'lieux (ordre et champs)').toEqual(l1);
      const b1=await app.ev('buildingSites.map(b=>({kind:b.kind,lat:b.lat,lon:b.lon,height_m:b.height_m,named:b.named,id:b.id,ess:b.ess,name:b.name,dup:!!b.dupMon}))'), b2=await p2.evaluate(()=>{ const d=window.__vh2.app.donnees(); return d.reperes.map((b,i)=>({kind:b.kind,lat:b.lat,lon:b.lon,height_m:b.height_m,named:b.named,id:b.id,ess:b.ess,name:b.name,dup:!!d.doublonsReperes[i]})); });
      expect(b2,'repères hauts (ordre, champs, doublons)').toEqual(b1);
      const t1=await app.ev('telecomSites.length'), t2=await p2.evaluate(()=>window.__vh2.app.donnees().pylones.length); expect(t2,'pylônes').toBe(t1); }
    const sol=sc.soleil?await app.ev('sunNow()'):null, soleilAz=sol?sol.az:0, soleilEl=sol?sol.el:0;
    let ops=0, soleils=0;
    for(const mode of ['essentiel','tout-voir']) for(const [dCap,incl] of POSES){
      const cap=sc.soleil?(Math.round(soleilAz)+dCap+360)%360:(cap0+dCap+360)%360, inclPose=sc.soleil?Math.round(soleilEl)+incl:incl;
      await app.ev(`setBeyond(${mode==='tout-voir'}); S.headOff=${cap}; S.pitchOff=${inclPose}; S.photoVis=false; photoSky=null; for(const c of monumentSites) c._snapDB=0; citiesVer++; $('note').style.display='none'; true`);
      await app.ev('for(const c of cities.concat(farPeaks,monumentSites)){ c.demT=0; c._skyT=0; } for(const b of buildingSites) b._gT=0; applyOcclusion(false); _ridgesAt=0; _skyDistAt=0; true');
      await app.ev('lblMem.clear(); laneMem.clear(); true'); // mêmes mémoires de départ des deux côtés : l’historique des images d’avant n’est pas comparé
      for(let i=0;i<2;i++) await app.frame();
      const f1=await page.evaluate(()=>window.__vh.frameOps(false,true));
      await p2.evaluate(({cap,inclPose,beyond})=>{ const v=window.__vh2; v.S.headOff=cap; v.S.pitchOff=inclPose; v.S.beyond=beyond; document.getElementById('note').style.display='none'; v.memoires.placement.clear(); v.memoires.lignes.clear(); for(let i=0;i<2;i++) v.rendreImage(); },{cap,inclPose,beyond:mode==='tout-voir'});
      await p2.waitForTimeout(1100); // les obstacles d'interface de la v2 sont mesurés une fois par seconde : on laisse expirer la mesure faite pendant que la note était affichée
      const f2=await p2.evaluate(()=>{ const v=window.__vh2, rec=window.__enregistreur(v.ctx); rec.demarrer(); v.rendreImage(); rec.arreter(); return rec.evenements(); });
      const tag=`${mode} cap+${dCap} incl ${incl}`;
      { const k=f1.ops.findIndex((o,i)=>JSON.stringify(o)!==JSON.stringify(f2[i])); if(k>=0||f1.ops.length!==f2.length) console.log('DIFF',tag,k,f1.ops.length,f2.length,'\nV1',JSON.stringify(f1.ops.slice(Math.max(0,k-1),k+2)).slice(0,1500),'\nV2',JSON.stringify(f2.slice(Math.max(0,k-1),k+2)).slice(0,1500)); }
      expect(f2.length,`${tag} : nombre d'opérations`).toBe(f1.ops.length);
      for(let i=0;i<f1.ops.length;i++) expect(f2[i],`${tag} : opération ${i}`).toEqual(f1.ops[i]);
      ops+=f1.ops.length; soleils+=f1.ops.filter(o=>o.t==='texte'&&/^soleil /.test(o.texte)).length;
    }
    console.log(sc.id,'opérations comparées',ops,'· symboles du soleil',soleils);
    if(sc.soleil) expect(soleils,'le symbole du soleil doit être dessiné').toBeGreaterThan(0);
    expect(erreurs).toEqual([]);
    await ctx2.close(); await v1.ctx.close();
  });
}
