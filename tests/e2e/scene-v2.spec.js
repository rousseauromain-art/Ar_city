// Parité de la TRAME COMPLÈTE de la v2 (moteur de scène, src/moteur/scene.js) avec la v1 sur des scènes RÉELLES (dépôt privé Ar_city-photos) : horizon et réticule, croix de visée,
// lieux, monuments, bande des équipements (pylônes, repères hauts), ruban de cap, message central. Le moteur reçoit les données de la v1 et ses réglages, et doit reproduire CHAQUE
// trait et chaque texte de la trame, en Essentiel et en Tout voir, pour cinq poses, avec et sans la croix de visée, avec relief et ligne de relief allumés ou non.
// Pas dans cette trame (étape 10) : symbole du soleil, silhouette lue sur la photo. Ignoré sans PHOTOS_DIR.
const {test,expect}=require('@playwright/test');
const {ouvrirSceneReelle,disponible}=require('../helpers/scenes-reelles.js');

const SCENES=[
  {id:'saint-malo-rempart',photo:'PXL_20261025_112230293.jpg',radius:30},
  {id:'turin-san-carlo',photo:'PXL_20261022_104200724.jpg',radius:30},
  {id:'ibiza-coucher',photo:'PXL_20260927_173517301.jpg',radius:30},
  {id:'morgat-plage',photo:'PXL_20260824_175454144.jpg',radius:180},
  {id:'paris-grenelle-nuit',pos:{lat:48.8494956,lon:2.2865298},capDeg:28,radius:180,heure:'2026-10-27T19:30:00Z',ecran:{width:412,height:915}},
];
const POSES=[[0,0],[37,3],[-80,-2],[150,6],[20,28]];
const CONFIGS=[{cross:false,skyline:false},{cross:true,skyline:true}];
const REGLAGES={relief:true,skyline:false,hamlets:true,telecom:true,buildings:true,sea:false,air:false,photoVis:false,
  layers:{places:true,monuments:true,equip:true,urban:false,urbClip:true,urbSmooth:true,urbFill:true},poi:{lighthouse:true,cape:true,rock:true,view:true,heritage:true,beach:true}};
const CHAMPS=['name','lat','lon','kind','cat','qid','type','links','prot','htWd','htOsm','ht','types','why','minor','src','tdf','loc','unnamed','hint','osm','anfr','osmTall','tags'];
const PROJ=`(m=>{ const o={}; for(const k of ${JSON.stringify(CHAMPS)}) if(m[k]!==undefined) o[k]=m[k]; return o; })`;
const CHAMPS_REPERE=['name','lat','lon','kind','height_m','named','id','ess'];
const STRIP='({name:c.name,lat:c.lat,lon:c.lon,kind:c.kind,pop:c.pop,ele:c.ele})';
const EXTRAIRE_V1=`(()=>{
  const dom=[]; for(const el of [$('tools'),$('chips'),$('btnSet'),$('shutter'),$('btnBeyond'),$('layers')]){ if(!el) continue; const r=el.getBoundingClientRect(); if(r.width&&r.height) dom.push([r.left,r.right,r.top,r.bottom]); }
  return {ui:uiObstacles().map(r=>r.slice()).concat(dom), safeT, FD, FM, W, H, dpr, P:pose(), fov:vFov(), flux:camSrc(), now:Date.now(), photo:!!photoMode, capteur:!!sensor, nbLieux:cities.length,
    safeB:parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-b'))||0, S:JSON.parse(JSON.stringify(S))};
})()`;

for(const sc of SCENES){
  test(`trame complète v2 = v1 sur la scène réelle ${sc.id}`,async({browser})=>{
    test.skip(!disponible(sc),'dépôt privé Ar_city-photos absent');
    test.setTimeout(1200000);
    const {app,page,ctx,erreurs,cap0}=await ouvrirSceneReelle(browser,sc,{reglages:REGLAGES});
    await app.waitFor('!monBusy&&!towerBusy&&!telecomBusy&&!buildingsBusy',120000);
    const REMISE='for(const c of cities.concat(farPeaks,monumentSites)){ c.demT=0; c._skyT=0; } for(const b of buildingSites) b._gT=0; applyOcclusion(false); true';
    await app.ev(REMISE);
    const monuments=await app.ev(`monumentSites.map(${PROJ})`), pylones=await app.ev('telecomSites.map(s=>{ const o={}; for(const k in s) if(k!=="dist"&&k!=="brg") o[k]=s[k]; return o; })');
    const reperes=await app.ev(`buildingSites.map(b=>{ const o={}; for(const k of ${JSON.stringify(CHAMPS_REPERE)}) o[k]=b[k]; return o; })`), doublons=await app.ev('buildingSites.map(b=>!!b.dupMon)');
    await app.ev('cities=cities.filter(c=>SETTLE.has(c.kind)); farPeaks=[]; recompute(); true');
    const lieux=await app.ev(`cities.map(c=>${STRIP})`);
    let ops=0, textes=0, rubans=0;
    for(const cfg of CONFIGS) for(const mode of ['essentiel','tout-voir']) for(const [dCap,incl] of POSES){
      await app.ev(`S.cross=${cfg.cross}; S.skyline=${cfg.skyline}; setBeyond(${mode==='tout-voir'}); S.headOff=${(cap0+dCap+360)%360}; S.pitchOff=${incl}; S.photoVis=false; photoSky=null; for(const c of monumentSites) c._snapDB=0; citiesVer++; true`);
      await app.ev(REMISE);
      for(let i=0;i<2;i++) await app.frame();
      const v1=await page.evaluate(()=>window.__vh.frameOps(false,true));
      const e1=await app.ev(EXTRAIRE_V1);
      const v2=await page.evaluate(async({e1,mem0,lane0,monuments,lieux,pylones,reperes,doublons})=>{
        const pr=await import('/src/rendu/projection.js'), cv=await import('/src/rendu/canvas.js'), sc=await import('/src/moteur/scene.js'), rg=await import('/src/moteur/reglages.js');
        const ev=s=>window.__vh.ev(s), T=ev('terrain'), pos=ev('pos');
        const bands=T.bands.map(b=>({z:b.z,max:b.max,ts:b.ts,shift:b.shift,garantie:b.guaranteed,tx0:b.tx0,ty0:b.ty0,nx:b.nx,ny:b.ny,tiles:b.tiles,altIdx:b.altIdx}));
        const terrain={h0:T.h0,pm:T.pm,bands}, S=rg.fusionnerReglages(e1.S);
        const vue={largeurPx:e1.W,hauteurPx:e1.H,capDeg:e1.P.heading,inclinaisonDeg:e1.P.pitch,roulisDeg:e1.P.roll,champDeg:pr.champAffiche(S.camFov,{largeurPx:e1.W,hauteurPx:e1.H},{largeurPx:e1.flux.w,hauteurPx:e1.flux.h})};
        const cn=document.createElement('canvas'); cn.width=e1.W*e1.dpr; cn.height=e1.H*e1.dpr; const c2=cn.getContext('2d'), rec=window.__enregistreur(c2);
        const mesurerTexte=(police,t)=>{ c2.font=police; return c2.measureText(t).width; };
        const M={placement:new Map(mem0),lignes:new Map(lane0),choixBateaux:{ids:null},calageMonuments:new Map()};
        const r=sc.composerScene({vue,reglages:S,donnees:{pos,terrain,lieux,monuments,pylones,reperes,doublonsReperes:doublons,couchesPerso:[],mobiles:[],analysePhoto:null},memoires:M,
          ecran:{reservations:e1.ui,safeT:e1.safeT,safeB:e1.safeB,mesurerTexte,familles:{affichage:e1.FD,mono:e1.FM}},maintenantMs:e1.now,
          etat:{photo:e1.photo,capteur:e1.capteur,erreurCamera:'',precisionM:0,chargement:false,source:'',etatRelief:'ok',messageAir:'',messageSea:''}});
        c2.setTransform(e1.dpr,0,0,e1.dpr,0,0); rec.demarrer();
        cv.avecRoulis(c2,vue,()=>cv.dessiner(c2,r.scene)); cv.dessiner(c2,r.ecran);
        rec.arreter();
        return {ops:rec.evenements(),mem1:[...M.placement],lane1:[...M.lignes],message:r.bilan.message};
      },{e1,mem0:v1.mem0,lane0:v1.lane0,monuments,lieux,pylones,reperes,doublons});
      const tag=`cross ${cfg.cross} skyline ${cfg.skyline} · ${mode} cap+${dCap} incl ${incl}`;
      { const k=v1.ops.findIndex((o,i)=>JSON.stringify(o)!==JSON.stringify(v2.ops[i])); if(k>=0||v1.ops.length!==v2.ops.length) console.log('DIFF',tag,k,'\nV1',JSON.stringify(v1.ops.slice(Math.max(0,k-1),k+2)),'\nV2',JSON.stringify(v2.ops.slice(Math.max(0,k-1),k+2))); }
      expect(v2.ops.length,`${tag} : nombre d'opérations de dessin`).toBe(v1.ops.length);
      for(let i=0;i<v1.ops.length;i++) expect(v2.ops[i],`${tag} : opération ${i}`).toEqual(v1.ops[i]);
      expect(v2.mem1,`${tag} : mémoire de placement des noms`).toEqual(v1.mem1);
      expect(v2.lane1,`${tag} : mémoire des lignes de la bande`).toEqual(v1.lane1);
      ops+=v1.ops.length; textes+=v1.ops.filter(o=>o.t==='texte').length; rubans+=v1.ops.filter(o=>o.t==='texte'&&/^\d+°$/.test(o.texte)).length;
    }
    console.log(sc.id,'opérations comparées',ops,'· textes',textes,'· rubans',rubans);
    expect(rubans,'le ruban de cap doit être dessiné à chaque image').toBeGreaterThan(0);
    expect(erreurs).toEqual([]);
    await ctx.close();
  });
}
