// Parité de la BANDE DES ÉQUIPEMENTS v2 avec la v1 sur des scènes RÉELLES (photos et caches du dépôt privé Ar_city-photos) : équipements urbains, pylônes télécom
// (ANFR) et repères hauts (OpenStreetMap), avec les lieux et les monuments. La v2 reçoit les mêmes données que la v1 (leur fabrication est vérifiée aux étapes 6a et 7a)
// et doit reproduire, en Essentiel et en Tout voir, pour trois configurations de calques et cinq poses (dont une tête en l'air qui fait passer la bande AU-DESSUS de
// l'horizon) :
//  1. le classement commun (lieux, monuments, équipements urbains : ordre, drapeaux, plafond, portée par type, relief, dédoublonnage) ;
//  2. TOUT ce que la v1 trace : icônes, fils pointillés, pastilles du nombre, noms, distances, pastilles d'opérateurs, badge 5G, cartouches ;
//  3. la mémoire de placement des noms et celle des lignes de la bande, les comptes (nommés / icône seule) et l'étage choisi.
// Ignoré sans le dossier PHOTOS_DIR (CI sans jeton, REFONTE.md §9).
const {test,expect}=require('@playwright/test');
const {ouvrirSceneReelle,ignorerSiAbsent}=require('../helpers/scenes-reelles.js');

const SCENES=[
  {id:'saint-malo-rempart',photo:'PXL_20261025_112230293.jpg',radius:30},
  {id:'turin-san-carlo',photo:'PXL_20261022_104200724.jpg',radius:30},
  {id:'ibiza-coucher',photo:'PXL_20260927_173517301.jpg',radius:30},
  {id:'morgat-plage',photo:'PXL_20260824_175454144.jpg',radius:180},
  {id:'paris-grenelle-nuit',pos:{lat:48.8494956,lon:2.2865298},capDeg:28,radius:180,heure:'2026-10-27T19:30:00Z',ecran:{width:412,height:915}},
];
const POSES=[[0,0],[37,3],[-80,-2],[150,6],[20,28]]; // [écart de cap, inclinaison] ; +28° : l'horizon sort de l'écran par le bas, la bande passe au-dessus
const CONFIGS=[{places:true,mon:true},{places:false,mon:true},{places:false,mon:false}]; // calques Lieux / Monuments
const REGLAGES={relief:true,skyline:false,hamlets:true,telecom:true,buildings:true,sea:false,air:false,photoVis:false,
  layers:{places:true,monuments:true,equip:true,urban:false,urbClip:true,urbSmooth:true,urbFill:true},
  poi:{lighthouse:true,cape:true,rock:true,view:true,heritage:true,beach:true}};
const CHAMPS=['name','lat','lon','kind','cat','qid','type','links','prot','htWd','htOsm','ht','types','why','minor','src','tdf','loc','unnamed','hint','osm','anfr','osmTall','tags'];
const PROJ=`(m=>{ const o={}; for(const k of ${JSON.stringify(CHAMPS)}) if(m[k]!==undefined) o[k]=m[k]; return o; })`;
const CHAMPS_REPERE=['name','lat','lon','kind','height_m','named','id','ess'];
const STRIP='({name:c.name,lat:c.lat,lon:c.lon,kind:c.kind,pop:c.pop,ele:c.ele})';
const EXTRAIRE_V1=`(()=>{
  const L=visibleCities().filter(c=>SETTLE.has(c.kind)||c.kind==='monument'), dom=[];
  for(const el of [$('tools'),$('chips'),$('btnSet'),$('shutter'),$('btnBeyond'),$('layers')]){ if(!el) continue; const r=el.getBoundingClientRect(); if(r.width&&r.height) dom.push([r.left,r.right,r.top,r.bottom]); }
  return {list:L.map(c=>c.kind==='monument'&&c.cat==='equip'
      ?{name:c.name,lat:c.lat,lon:c.lon,kind:c.kind,dist:c.dist,brg:c.brg,angH:c.angH,far:!!c.far,cap:!!c.cap,hidden:!!c.hidden,rang:c._rk??null,aG:c.aG??null,aP:c.aP??null,mask:c.mask??null}
      :c.kind==='monument'
      ?{name:c.name,lat:c.lat,lon:c.lon,kind:c.kind,dist:c.dist,brg:c.brg,angH:c.angH,far:!!c.far,hidden:!!c.hidden,low:!!c.low,roof:!!c.roof,cap:!!c.cap,near:!!c.near,occBy:c.occBy||null,photoHid:!!c.photoHid,snapDB:c._snapDB||0,aG:c.aG??null,aP:c.aP??null,mask:c.mask??null}
      :{name:c.name,lat:c.lat,lon:c.lon,kind:c.kind,dist:c.dist,brg:c.brg,far:!!c.far,hidden:!!c.hidden,photoHid:!!c.photoHid,aG:c.aG??null,aP:c.aP??null,mask:c.mask??null}),
    stats:{...placeStats}, badge:_eyeBadgeN, ui:uiObstacles().map(r=>r.slice()).concat(dom), safeT, FD, FM, W, H, dpr, P:pose(), fov:vFov(), flux:camSrc(),
    safeB:parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-b'))||0,
    S:{radius:S.radius,relief:S.relief,beyond:!!S.beyond,photoVis:S.photoVis===true,places:S.layers.places,monuments:!!S.layers.monuments,equip:S.layers.equip!==false,showDist:S.showDist,camFov:S.camFov,filter:S.filter,
      telecom:!!S.telecom,telecomMax:S.telecomMax,buildings:!!S.buildings,buildingsMax:S.buildingsMax}};
})()`;

for(const sc of SCENES){
  test(`bande des équipements v2 = v1 sur la scène réelle ${sc.id}`,async({browser})=>{
    ignorerSiAbsent(test,sc);
    test.setTimeout(1200000);
    const {app,page,ctx,erreurs,cap0}=await ouvrirSceneReelle(browser,sc,{reglages:REGLAGES});
    await app.waitFor('!monBusy&&!towerBusy&&!telecomBusy&&!buildingsBusy',120000);
    // horloge de test figée : terrain.at ne change pas, la v1 garderait l'altitude (demT), la silhouette (_skyT) et le sol des repères (_gT) lus dans le relief lointain ; en conditions réelles ils sont relus
    const REMISE='for(const c of cities.concat(farPeaks,monumentSites)){ c.demT=0; c._skyT=0; } for(const b of buildingSites) b._gT=0; applyOcclusion(false); true';
    await app.ev(REMISE);
    // la v2 reçoit exactement les données de la v1 ; la v1 ne garde que lieux (établissements) et ses calques d'infrastructure
    const monuments=await app.ev(`monumentSites.map(${PROJ})`), batiments=await app.ev('buildingSites.map(b=>({kind:b.kind,lat:b.lat,lon:b.lon}))');
    const sites=await app.ev('telecomSites.map(s=>{ const o={}; for(const k in s) if(k!=="dist"&&k!=="brg") o[k]=s[k]; return o; })');
    const reperes=await app.ev(`buildingSites.map(b=>{ const o={}; for(const k of ${JSON.stringify(CHAMPS_REPERE)}) o[k]=b[k]; return o; })`), doublons=await app.ev('buildingSites.map(b=>!!b.dupMon)');
    await app.ev('cities=cities.filter(c=>SETTLE.has(c.kind)); farPeaks=[]; recompute(); true');
    const lieux=await app.ev(`cities.map(c=>${STRIP})`);
    const nEq=monuments.filter(m=>m.cat==='equip').length;
    console.log(sc.id,'équipements',nEq,'· pylônes',sites.length,'· repères hauts',reperes.length);
    expect(nEq+sites.length+reperes.length,'des équipements doivent être chargés').toBeGreaterThan(5);
    let nommes=0, iconeSeule=0, haut=0, bas=0, eqNets=0, pastilles=0, ops5g=0, mur=0;

    for(const cfg of CONFIGS) for(const mode of ['essentiel','tout-voir']) for(const [dCap,incl] of POSES){
      await app.ev(`S.layers.places=${cfg.places}; S.layers.monuments=${cfg.mon}; setBeyond(${mode==='tout-voir'}); S.headOff=${(cap0+dCap+360)%360}; S.pitchOff=${incl}; S.photoVis=false; photoSky=null; for(const c of monumentSites) c._snapDB=0; citiesVer++; true`);
      await app.ev(REMISE);
      for(let i=0;i<2;i++) await app.frame();
      const v1=await page.evaluate(()=>window.__vh.frameOps());
      const e1=await app.ev(EXTRAIRE_V1);
      const v2=await page.evaluate(async({e1,mem0,lane0,cfg,monuments,lieux,batiments,sites,reperes,doublons})=>{
        const pr=await import('/src/rendu/projection.js'), cv=await import('/src/rendu/canvas.js'), hz=await import('/src/rendu/repere-horizon.js'),
          pl=await import('/src/rendu/placement.js'), et=await import('/src/rendu/etiquettes.js'), bd=await import('/src/rendu/bande.js'), ly=await import('/src/calques/lieux.js'),
          mo=await import('/src/calques/monuments.js'), eq=await import('/src/calques/equipements.js'), rp=await import('/src/calques/reperes.js'), la=await import('/src/scene/liste-affichage.js');
        const ev=s=>window.__vh.ev(s), T=ev('terrain'), S=e1.S, pos=ev('pos');
        const bands=T.bands.map(b=>({z:b.z,max:b.max,ts:b.ts,shift:b.shift,garantie:b.guaranteed,tx0:b.tx0,ty0:b.ty0,nx:b.nx,ny:b.ny,tiles:b.tiles,altIdx:b.altIdx}));
        const terrain={h0:T.h0,pm:T.pm,bands};
        const vue={largeurPx:e1.W,hauteurPx:e1.H,capDeg:e1.P.heading,inclinaisonDeg:e1.P.pitch,roulisDeg:e1.P.roll,champDeg:pr.champAffiche(S.camFov,{largeurPx:e1.W,hauteurPx:e1.H},{largeurPx:e1.flux.w,hauteurPx:e1.flux.h})};
        const rg={rayonKm:S.radius,relief:S.relief,toutVoir:S.beyond,analyseActive:false,couche:S.monuments,distances:S.showDist,filtre:S.filter};
        const scene={pos,terrain,analysePhoto:null,maintenantMs:Date.now(),cities:lieux,batiments,monuments};
        const M=mo.classerMonuments(monuments,scene,rg), Mc=S.monuments?M.classes:[];
        const Lb=ly.classerLieux(lieux,scene,{...rg,couche:S.places});
        const E=eq.classerEquipements(monuments,scene,{rayonKm:S.radius,relief:S.relief,couche:S.monuments&&S.equip});
        const assemblee=la.assemblerListe([Mc.map(c=>c.el),Lb.map(c=>c.el),E.classes.map(c=>c.el)],M.dense), gardes=new Set(la.dedoublonner(assemblee));
        const liste=assemblee.filter(e=>gardes.has(e));
        const classesM=Mc.filter(c=>gardes.has(c.el)), classesL=Lb.filter(c=>gardes.has(c.el)), classesE=E.classes.filter(c=>gardes.has(c.el));
        const pm=mo.preparerMonuments(classesM,vue,rg,{terrain,cities:lieux}), pL=ly.preparerLieux(classesL,vue,{...rg,couche:S.places});
        const etiquettes=la.ordonnerEtiquettes(liste,[...pm.etiquettes,...pL.etiquettes]);
        // couches de la bande, dans l'ordre de la v1 : équipements urbains, pylônes, repères hauts
        const couches=[eq.preparerEquipements(classesE,{filtre:S.filter}),
          eq.preparerPylones(eq.classerPylones(sites,{pos},{telecom:S.telecom,portee:S.telecomMax})),
          rp.preparerReperes(rp.classerReperes(reperes,{pos},{reperes:S.buildings,portee:S.buildingsMax,toutVoir:S.beyond,doublons}),S.relief?{h0:T.h0,bands}:null)].filter(Boolean);
        const cn=document.createElement('canvas'); cn.width=e1.W*e1.dpr; cn.height=e1.H*e1.dpr; const c2=cn.getContext('2d'), rec=window.__enregistreur(c2);
        const mesurerTexte=(police,t)=>{ c2.font=police; return c2.measureText(t).width; };
        const familles={affichage:e1.FD,mono:e1.FM};
        const memoire=new Map(mem0), memoireLignes=new Map(lane0), placeur=pl.creerPlaceur({largeurPx:e1.W,hauteurPx:e1.H,limiteHautePx:e1.safeT+24+14,reservations:e1.ui.map(r=>r.slice()),memoire});
        const hy=pr.ordonneeHorizon(vue), debutBas=hy+30, basLimite=e1.H-Math.max(8,e1.safeB)-6, etageBas=basLimite-debutBas>=46;
        const optBande=etage=>({etage,hy,basTexteLimite:basLimite,hautLimite:e1.safeT+24+14,debutBas,calquesHautActifs:S.places||S.monuments,lignesMax:60,memoireLignes,mesurerTexte,familles});
        let bande=null;
        const {commandes,comptes}=et.composerEtiquettes(etiquettes,placeur,{mesurerTexte,familles,avantNoms:etageBas?undefined:()=>{ bande=bd.composerBande(couches,vue,placeur,optBande('haut')); }});
        if(etageBas) bande=bd.composerBande(couches,vue,placeur,optBande('bas'));
        const sp=[];
        c2.setTransform(e1.dpr,0,0,e1.dpr,0,0); rec.demarrer();
        cv.avecRoulis(c2,vue,()=>cv.dessiner(c2,[...hz.commandesHorizon(vue),...sp,...(etageBas?[]:bande.commandes),...commandes,...(etageBas?bande.commandes:[])]));
        rec.arreter();
        const out=e=>e.kind==='monument'&&e.cat==='equip'
          ?{name:e.name,lat:e.lat,lon:e.lon,kind:e.kind,dist:e.dist,brg:e.brg,angH:e.angH,far:e.far,cap:e.cap,hidden:e.hidden,rang:e.rang,aG:e.aG,aP:e.aP,mask:e.mask}
          :e.kind==='monument'
          ?{name:e.name,lat:e.lat,lon:e.lon,kind:e.kind,dist:e.dist,brg:e.brg,angH:e.angH,far:e.far,hidden:e.hidden,low:e.low,roof:e.roof,cap:e.cap,near:e.near,occBy:e.occBy,photoHid:e.photoHid,snapDB:e.snapDB,aG:e.aG,aP:e.aP,mask:e.mask}
          :{name:e.name,lat:e.lat,lon:e.lon,kind:e.kind,dist:e.dist,brg:e.brg,far:e.far,hidden:e.hidden,photoHid:e.photoHid,aG:e.aG,aP:e.aP,mask:e.mask};
        return {ops:rec.evenements(),comptes,mem1:[...memoire],lane1:[...memoireLignes],liste:liste.map(out),stats:bande.stats,couches:couches.map(c=>c.cle+':'+c.elements.length)};
      },{e1,mem0:v1.mem0,lane0:v1.lane0,cfg,monuments,lieux,batiments,sites,reperes,doublons});

      const tag=`places ${cfg.places} · monuments ${cfg.mon} · ${mode} cap+${dCap} incl ${incl}`;
      expect(v2.liste.length,`${tag} : nombre d'éléments classés`).toBe(e1.list.length);
      expect(v2.liste,`${tag} : éléments classés (ordre, drapeaux)`).toEqual(e1.list);
      expect({eligible:v2.comptes.eligibles,shown:v2.comptes.affichees,ghost:v2.comptes.fantomes,noRoom:v2.comptes.sansPlace},`${tag} : comptes des noms`).toEqual({eligible:e1.stats.eligible,shown:e1.stats.shown,ghost:e1.stats.ghost,noRoom:e1.stats.noRoom});
      expect({labeled:v2.stats.nommes,iconOnly:v2.stats.iconeSeule,deck:v2.stats.etage},`${tag} : comptes de la bande`).toEqual(v1.infraStats);
      expect(v2.ops.length,`${tag} : nombre d'opérations de dessin`).toBe(v1.ops.length);
      { const k=v1.ops.findIndex((o,i)=>JSON.stringify(o)!==JSON.stringify(v2.ops[i])); if(k>=0) console.log('DIFF',tag,k,'\nV1',JSON.stringify(v1.ops.slice(Math.max(0,k-1),k+2)),'\nV2',JSON.stringify(v2.ops.slice(Math.max(0,k-1),k+2))); }
      for(let i=0;i<v1.ops.length;i++) expect(v2.ops[i],`${tag} : opération ${i}`).toEqual(v1.ops[i]);
      expect(v2.mem1,`${tag} : mémoire de placement des noms`).toEqual(v1.mem1);
      expect(v2.lane1,`${tag} : mémoire des lignes de la bande`).toEqual(v1.lane1);
      nommes+=v1.infraStats.labeled; iconeSeule+=v1.infraStats.iconOnly; if(v1.infraStats.deck==='haut') haut++; else bas++;
      eqNets+=v1.ops.filter(o=>o.t==='trait'&&o.couleur==='#78cde8'&&o.largeur===1.5).length; pastilles+=v1.ops.filter(o=>o.t==='texte'&&/^\d+\+?$/.test(o.texte)&&o.alignement==='center').length;
      ops5g+=v1.ops.filter(o=>o.t==='texte'&&o.texte==='5G').length; mur+=v1.ops.filter(o=>o.t==='remplissage'&&o.chemin.length===1&&o.chemin[0][0]==='rect').length;
    }
    console.log(sc.id,'nommés',nommes,'· icône seule',iconeSeule,'· bande dessous',bas,'/ dessus',haut,'· icônes d’équipements urbains',eqNets,'· pastilles du nombre',pastilles,'· 5G',ops5g,'· cartouches',mur);
    expect(nommes+iconeSeule,'des éléments de la bande doivent être posés').toBeGreaterThan(0);
    if(['saint-malo-rempart','turin-san-carlo','paris-grenelle-nuit'].includes(sc.id)) expect(eqNets,'des équipements urbains doivent être dessinés').toBeGreaterThan(0);
    expect(haut,'la bande doit passer au-dessus de l’horizon dans au moins une pose').toBeGreaterThan(0);
    expect(erreurs).toEqual([]);
    await ctx.close();
  });
}
