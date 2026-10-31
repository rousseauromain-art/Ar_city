// Parité du calque « lieux » v2 avec la v1 sur des scènes RÉELLES (photos et caches du dépôt privé Ar_city-photos) :
//  1. les lieux chargés par la v2 depuis les mêmes caches = `cities` de la v1 ;
//  2. le classement (portée, relief, photo, doublons, ordre) = les drapeaux de visibleCities() de la v1 ;
//  3. TOUT ce que la v1 trace sur le canvas (horizon, réticule, fils, points, noms avec liseré, détails) = les commandes v2 rejouées, mémoire
//     de placement des noms comprise, en Essentiel et en Tout voir, avec et sans silhouette lue sur la photo ;
//  4. comptes (nets, fantômes, sans place) et badge « +N » du bouton œil.
// Lieux habités, lieux remarquables (phares, caps, îles, plages…) et sommets lointains sont gardés dans la v1 ; monuments, télécom et bâtiments retirés : les deux côtés voient les mêmes éléments.
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
const POSES=[[0,0],[37,3],[-80,-2],[150,6]]; // [écart de cap, inclinaison]
const REGLAGES={relief:true,skyline:false,hamlets:true,telecom:false,buildings:false,sea:false,air:false,photoVis:false,
  layers:{places:true,monuments:false,equip:false,urban:false,urbClip:true,urbSmooth:true,urbFill:true},
  poi:{lighthouse:true,cape:true,rock:true,view:true,heritage:true,beach:true}};
const EXTRAIRE_V1=`(()=>{
  const L=visibleCities(), dom=[];
  for(const el of [$('tools'),$('chips'),$('btnSet'),$('shutter'),$('btnBeyond'),$('layers')]){ if(!el) continue; const r=el.getBoundingClientRect(); if(r.width&&r.height) dom.push([r.left,r.right,r.top,r.bottom]); }
  return {list:L.map(c=>({name:c.name,lat:c.lat,lon:c.lon,kind:c.kind,dist:c.dist,brg:c.brg,far:!!c.far,hidden:!!c.hidden,photoHid:!!c.photoHid,aG:c.aG??null,aP:c.aP??null,mask:c.mask??null})),
    stats:{...placeStats}, badge:_eyeBadgeN, ui:uiObstacles().map(r=>r.slice()).concat(dom), safeT, FD, FM, W, H, dpr, P:pose(), fov:vFov(), S:{radius:S.radius,relief:S.relief,beyond:!!S.beyond,photoVis:S.photoVis===true,places:S.layers.places,showDist:S.showDist,camFov:S.camFov,filter:S.filter}, flux:camSrc()};
})()`;

for(const sc of SCENES){
  test(`calque lieux v2 = v1 sur la scène réelle ${sc.id}`,async({browser})=>{
    ignorerSiAbsent(test,sc);
    test.setTimeout(600000);
    const {app,page,ctx,erreurs,cap0}=await ouvrirSceneReelle(browser,sc,{reglages:REGLAGES});

    // 1. données : la v2 relit les MÊMES caches (celui de la v1) et doit reconstituer la liste de lieux de la v1
    const strip='({name:c.name,lat:c.lat,lon:c.lon,kind:c.kind,pop:c.pop,ele:c.ele})';
    const complete=await app.ev(`cities.map(c=>${strip})`);
    expect(complete.length,'des lieux doivent avoir été chargés').toBeGreaterThan(20);
    const donnees=await page.evaluate(async()=>{
      const cd=await import('/src/donnees/cache-donnees.js'), at=await import('/src/donnees/atlas.js'), li=await import('/src/donnees/lieux.js');
      const ev=s=>window.__vh.ev(s), S=ev('S'), mem={};
      const cache=cd.creerCacheDonnees('vh-data-v1'), panne=async()=>{ throw new Error('hors ligne (test)'); };
      const src=li.creerSourceLieux({cache,atlas:at.creerAtlas({lire:(n,d)=>mem[n]??d,ecrire:(n,v)=>{ mem[n]=v; return true; }}),
        overpass:{interroger:panne},openfreemap:{charger:panne},relais:{disponible:ev('!!relayBase()'),geoapify:panne,geonames:panne}});
      const r=await src.charger({pos:ev('pos'),rayonKm:S.radius,hameaux:S.hamlets,reperes:S.poi});
      return {lieux:r.lieux,source:r.source};
    });
    console.log(sc.id,'lieux v1',complete.length,'· v2',donnees.lieux.length,'· source v2',donnees.source);
    expect(donnees.lieux).toEqual(complete);

    // seuls les lieux restent dans la v1
    await app.ev('monumentSites=[]; telecomSites=[]; buildingSites=[]; recompute(); true');
    const strip2='({name:c.name,lat:c.lat,lon:c.lon,kind:c.kind,pop:c.pop,ele:c.ele,farPeak:c.farPeak})';
    const bilan={}; let nRemarquables=0, nPeaks=0, nPhotoHid=0, nFantomes=0, nNets=0, nAffiches=0;

    for(const mode of ['essentiel','tout-voir']) for(const avecPhoto of [false,true]) for(const [dCap,incl] of POSES){
      await app.ev(`setBeyond(${mode==='tout-voir'}); S.headOff=${(cap0+dCap+360)%360}; S.pitchOff=${incl}; true`);
      if(avecPhoto){ // silhouette lue factice : des « murs » proches (12°) en alternance autour du cap, qui cachent ce qui est derrière
        await app.ev(`S.photoVis=true; photoT=Date.now(); photoSky={ok:true,t:Date.now(),cols:Array.from({length:360},(_, i)=>({brg:(pose().heading-90+i*0.5+720)%360,a:(Math.floor(i/24)%2?12:1)+0.3*Math.sin(i/5)})),heading:pose().heading,pitch:pose().pitch,fh:0}; citiesVer++; true`);
      } else await app.ev('S.photoVis=false; photoSky=null; citiesVer++; true');
      for(let i=0;i<2;i++) await app.frame();
      const v1=await page.evaluate(()=>window.__vh.frameOps());
      const e1=await app.ev(EXTRAIRE_V1);
      const v2=await page.evaluate(async({e1,mem0,lieux})=>{
        const pr=await import('/src/noyau/projection.js'), cv=await import('/src/rendu/canvas.js'), hz=await import('/src/rendu/repere-horizon.js'),
          pl=await import('/src/rendu/placement.js'), et=await import('/src/rendu/etiquettes.js'), ly=await import('/src/calques/lieux.js'), ph=await import('/src/calques/photo-silhouette.js'), la=await import('/src/scene/liste-affichage.js');
        const ev=s=>window.__vh.ev(s), T=ev('terrain'), photoSky=ev('photoSky'), S=e1.S;
        const bands=T.bands.map(b=>({z:b.z,max:b.max,ts:b.ts,shift:b.shift,garantie:b.guaranteed,tx0:b.tx0,ty0:b.ty0,nx:b.nx,ny:b.ny,tiles:b.tiles,altIdx:b.altIdx}));
        const vue={largeurPx:e1.W,hauteurPx:e1.H,capDeg:e1.P.heading,inclinaisonDeg:e1.P.pitch,roulisDeg:e1.P.roll,champDeg:pr.champAffiche(S.camFov,{largeurPx:e1.W,hauteurPx:e1.H},{largeurPx:e1.flux.w,hauteurPx:e1.flux.h})};
        if(Math.abs(vue.champDeg-e1.fov)>1e-12) throw new Error('champ affiché différent');
        const reglages={rayonKm:S.radius,relief:S.relief,toutVoir:S.beyond,analyseActive:S.photoVis,couche:S.places,distances:S.showDist,filtre:S.filter};
        const brut=ly.classerLieux(lieux,{pos:ev('pos'),terrain:{h0:T.h0,pm:T.pm,bands},analysePhoto:photoSky,maintenantMs:Date.now()},reglages);
        const tri=la.assemblerListe([brut.map(c=>c.el)],false), gardes=new Set(la.dedoublonner(tri)); // tri et doublons : communs à tous les calques
        const classes=tri.filter(e=>gardes.has(e)).map(el=>brut.find(c=>c.el===el));
        const {etiquettes,fantomesEnChamp}=ly.preparerLieux(classes,vue,reglages);
        const cn=document.createElement('canvas'); cn.width=e1.W*e1.dpr; cn.height=e1.H*e1.dpr; const c2=cn.getContext('2d'), rec=window.__enregistreur(c2);
        const mesurerTexte=(police,t)=>{ c2.font=police; return c2.measureText(t).width; };
        const memoire=new Map(mem0), placeur=pl.creerPlaceur({largeurPx:e1.W,hauteurPx:e1.H,limiteHautePx:e1.safeT+24+14,reservations:e1.ui.map(r=>r.slice()),memoire});
        const {commandes,comptes}=et.composerEtiquettes(etiquettes,placeur,{mesurerTexte,familles:{affichage:e1.FD,mono:e1.FM}});
        c2.setTransform(e1.dpr,0,0,e1.dpr,0,0); rec.demarrer();
        const silhouettePhoto=ph.calque.preparer(photoSky,vue,{reglages:{toutVoir:S.beyond,analyseActive:S.photoVis},maintenantMs:Date.now(),jointure:'miter'}); // réglage « ligne d'horizon » coupé : la v1 n'a pas laissé de jointure ronde
        cv.avecRoulis(c2,vue,()=>cv.dessiner(c2,[...hz.commandesHorizon(vue),...silhouettePhoto,...commandes]));
        rec.arreter();
        return {ops:rec.evenements(),comptes,fantomesEnChamp,fantomesVus:comptes.fantomesVus,mem1:[...memoire],
          liste:classes.map(c=>({name:c.el.name,lat:c.el.lat,lon:c.el.lon,kind:c.el.kind,dist:c.el.dist,brg:c.el.brg,far:c.el.far,hidden:c.el.hidden,photoHid:c.el.photoHid,aG:c.el.aG,aP:c.el.aP,mask:c.el.mask}))};
      },{e1,mem0:v1.mem0,lieux:await app.ev(`cities.concat(farPeaks).map(c=>${strip2})`)});

      const tag=`${mode}${avecPhoto?' +photo':''} cap+${dCap} incl ${incl}`;
      // 2. classement
      expect(v2.liste.length,`${tag} : nombre de lieux classés`).toBe(e1.list.length);
      expect(v2.liste,`${tag} : lieux classés (ordre, portée, relief, photo, doublons)`).toEqual(e1.list);
      // 4. comptes et badge
      expect({eligible:v2.comptes.eligibles,shown:v2.comptes.affichees,ghost:v2.comptes.fantomes,noRoom:v2.comptes.sansPlace,ghostInView:mode==='tout-voir'?v2.fantomesVus:v2.fantomesEnChamp},`${tag} : comptes`).toEqual(e1.stats);
      expect(mode==='tout-voir'?0:v2.fantomesEnChamp,`${tag} : badge de l'œil`).toBe(e1.badge);
      // 3. dessin
      expect(v1.mem0.length>=0).toBe(true);
      expect(v2.ops.length,`${tag} : nombre d'opérations de dessin`).toBe(v1.ops.length);
      for(let i=0;i<v1.ops.length;i++) expect(v2.ops[i],`${tag} : opération ${i}`).toEqual(v1.ops[i]);
      expect(v2.mem1,`${tag} : mémoire de placement`).toEqual(v1.mem1);
      nRemarquables+=e1.list.filter(c=>!['city','town','village','hamlet','isolated_dwelling'].includes(c.kind)).length; nPeaks+=e1.list.filter(c=>c.kind==='peak').length;
      nPhotoHid+=e1.list.filter(c=>c.photoHid).length; nFantomes+=e1.list.filter(c=>c.far||c.hidden).length; nNets+=e1.stats.shown; nAffiches+=v1.ops.filter(o=>o.t==='contour').length;
      bilan[tag]={classes:e1.list.length,ops:v1.ops.length,...e1.stats};
    }
    console.log(sc.id,'lieux remarquables classés',nRemarquables,'dont sommets',nPeaks,'· photoHid',nPhotoHid,'fantômes',nFantomes,'nets posés',nNets,'noms tracés',nAffiches);
    expect(sc.id==='morgat-plage'?nAffiches:nNets,'des noms doivent être posés').toBeGreaterThan(0); // Morgat regarde la mer : seulement des fantômes
    expect(nAffiches,'des noms doivent être dessinés').toBeGreaterThan(0);
    expect(nRemarquables,'des lieux remarquables (phares, caps, plages, sommets…) doivent être classés').toBeGreaterThan(0);
    expect(erreurs).toEqual([]);
    await ctx.close();
  });
}
