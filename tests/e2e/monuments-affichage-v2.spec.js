// Parité de l'AFFICHAGE des monuments v2 avec la v1 sur des scènes RÉELLES (photos et caches du dépôt privé Ar_city-photos). La v1 charge ses monuments avec
// le vrai code ; la v2 reçoit la même liste de monuments et doit reproduire, en Essentiel et en Tout voir, avec et sans silhouette lue :
//  1. le classement : mêmes lieux et monuments dans le même ordre, mêmes drapeaux (loin, toits, plafond, proche, masqué par un monument, par le relief, par la photo,
//     calage de pointe) ;
//  2. TOUT ce que la v1 trace sur le canvas (silhouettes, pictogrammes, pastilles « +N », fils, noms, détails), mémoire de placement des noms comprise ;
//  3. les comptes et le badge « +N » du bouton œil.
// Deux configurations : (a) calque « lieux » éteint (les lieux participent encore au dédoublonnage) ; (b) lieux et monuments ensemble, le cas réel.
// Équipements urbains et silhouette d'immeubles éteints (étape 7). Ignoré sans le dossier PHOTOS_DIR (CI sans jeton, REFONTE.md §9).
const {test,expect}=require('@playwright/test');
const {ouvrirSceneReelle,disponible}=require('../helpers/scenes-reelles.js');

const SCENES=[
  {id:'saint-malo-rempart',photo:'PXL_20261025_112230293.jpg',radius:30},
  {id:'turin-san-carlo',photo:'PXL_20261022_104200724.jpg',radius:30},
  {id:'ibiza-coucher',photo:'PXL_20260927_173517301.jpg',radius:30},
  {id:'morgat-plage',photo:'PXL_20260824_175454144.jpg',radius:180},
  {id:'paris-grenelle-nuit',pos:{lat:48.8494956,lon:2.2865298},capDeg:28,radius:180,heure:'2026-10-27T19:30:00Z',ecran:{width:412,height:915}},
];
const POSES=[[0,0],[37,3],[-80,-2],[150,6]]; // [écart de cap, inclinaison]
const REGLAGES={relief:true,skyline:false,hamlets:true,telecom:true,buildings:true,sea:false,air:false,photoVis:false,
  layers:{places:true,monuments:true,equip:false,urban:false,urbClip:true,urbSmooth:true,urbFill:true},
  poi:{lighthouse:true,cape:true,rock:true,view:true,heritage:true,beach:true}};
const CHAMPS=['name','lat','lon','kind','cat','qid','type','links','prot','htWd','htOsm','ht','types','why','minor','src','tdf','loc','unnamed','hint','osm','anfr','osmTall','tags'];
const PROJ=`(m=>{ const o={}; for(const k of ${JSON.stringify(CHAMPS)}) if(m[k]!==undefined) o[k]=m[k]; return o; })`;
const STRIP='({name:c.name,lat:c.lat,lon:c.lon,kind:c.kind,pop:c.pop,ele:c.ele})';
const EXTRAIRE_V1=`(()=>{
  const L=visibleCities().filter(c=>SETTLE.has(c.kind)||(c.kind==='monument'&&c.cat!=='equip')), dom=[];
  for(const el of [$('tools'),$('chips'),$('btnSet'),$('shutter'),$('btnBeyond'),$('layers')]){ if(!el) continue; const r=el.getBoundingClientRect(); if(r.width&&r.height) dom.push([r.left,r.right,r.top,r.bottom]); }
  return {list:L.map(c=>c.kind==='monument'
      ?{name:c.name,lat:c.lat,lon:c.lon,kind:c.kind,dist:c.dist,brg:c.brg,angH:c.angH,far:!!c.far,hidden:!!c.hidden,low:!!c.low,roof:!!c.roof,cap:!!c.cap,near:!!c.near,occBy:c.occBy||null,photoHid:!!c.photoHid,snapDB:c._snapDB||0,aG:c.aG??null,aP:c.aP??null,mask:c.mask??null}
      :{name:c.name,lat:c.lat,lon:c.lon,kind:c.kind,dist:c.dist,brg:c.brg,far:!!c.far,hidden:!!c.hidden,photoHid:!!c.photoHid,aG:c.aG??null,aP:c.aP??null,mask:c.mask??null}),
    stats:{...placeStats}, badge:_eyeBadgeN, ui:uiObstacles().map(r=>r.slice()).concat(dom), safeT, FD, FM, W, H, dpr, P:pose(), fov:vFov(), flux:camSrc(),
    S:{radius:S.radius,relief:S.relief,beyond:!!S.beyond,photoVis:S.photoVis===true,places:S.layers.places,showDist:S.showDist,camFov:S.camFov,filter:S.filter}};
})()`;

for(const sc of SCENES){
  test(`affichage des monuments v2 = v1 sur la scène réelle ${sc.id}`,async({browser})=>{
    test.skip(!disponible(sc),'dépôt privé Ar_city-photos absent');
    test.setTimeout(900000);
    const {app,page,ctx,erreurs,cap0}=await ouvrirSceneReelle(browser,sc,{reglages:REGLAGES});
    await app.waitFor('!monBusy&&!towerBusy',120000);
    // horloge de test figée : terrain.at ne change pas, la v1 garderait l'altitude (demT) et la silhouette (_skyT) lues dans le relief lointain ; en conditions réelles elles sont relues
    await app.ev('for(const c of cities.concat(farPeaks,monumentSites)){ c.demT=0; c._skyT=0; } applyOcclusion(false); true');
    // la v2 reçoit exactement les monuments de la v1 (leur fabrication est vérifiée à l'étape 6a) ; la v1 ne garde que lieux et monuments
    const monuments=await app.ev(`monumentSites.map(${PROJ})`), batiments=await app.ev('buildingSites.map(b=>({kind:b.kind,lat:b.lat,lon:b.lon}))');
    await app.ev('S.telecom=false; S.buildings=false; cities=cities.filter(c=>SETTLE.has(c.kind)); farPeaks=[]; telecomSites=[]; recompute(); true');
    const lieux=await app.ev(`cities.map(c=>${STRIP})`);
    expect(monuments.filter(m=>m.cat!=='equip').length,'des monuments doivent être chargés').toBeGreaterThan(5);
    const bilan={}; let nets=0, glyphes=0, silhouettes=0, pastilles=0, plats=0, occ=0, cap=0, roof=0, photoHid=0;

    for(const places of [false,true]) for(const mode of ['essentiel','tout-voir']) for(const avecPhoto of [false,true]) for(const [dCap,incl] of POSES){
      await app.ev(`S.layers.places=${places}; setBeyond(${mode==='tout-voir'}); S.headOff=${(cap0+dCap+360)%360}; S.pitchOff=${incl}; true`);
      if(avecPhoto){
        await app.ev(`for(const c of monumentSites) c._snapDB=0; S.photoVis=true; photoT=Date.now(); photoSky={ok:true,t:Date.now(),cols:Array.from({length:360},(_, i)=>({brg:(pose().heading-90+i*0.5+720)%360,a:(Math.floor(i/24)%2?12:1)+0.3*Math.sin(i/5)})),heading:pose().heading,pitch:pose().pitch,fh:0}; citiesVer++; true`);
      } else await app.ev('for(const c of monumentSites) c._snapDB=0; S.photoVis=false; photoSky=null; citiesVer++; true');
      for(let i=0;i<2;i++) await app.frame();
      const v1=await page.evaluate(()=>window.__vh.frameOps());
      const e1=await app.ev(EXTRAIRE_V1);
      const v2=await page.evaluate(async({e1,mem0,monuments,lieux,batiments})=>{
        const pr=await import('/src/rendu/projection.js'), cv=await import('/src/rendu/canvas.js'), hz=await import('/src/rendu/repere-horizon.js'),
          pl=await import('/src/rendu/placement.js'), et=await import('/src/rendu/etiquettes.js'), ly=await import('/src/calques/lieux.js'),
          mo=await import('/src/calques/monuments.js'), ph=await import('/src/calques/photo-silhouette.js'), la=await import('/src/scene/liste-affichage.js');
        const ev=s=>window.__vh.ev(s), T=ev('terrain'), photoSky=ev('photoSky'), S=e1.S, pos=ev('pos');
        const bands=T.bands.map(b=>({z:b.z,max:b.max,ts:b.ts,shift:b.shift,garantie:b.guaranteed,tx0:b.tx0,ty0:b.ty0,nx:b.nx,ny:b.ny,tiles:b.tiles,altIdx:b.altIdx}));
        const terrain={h0:T.h0,pm:T.pm,bands};
        const vue={largeurPx:e1.W,hauteurPx:e1.H,capDeg:e1.P.heading,inclinaisonDeg:e1.P.pitch,roulisDeg:e1.P.roll,champDeg:pr.champAffiche(S.camFov,{largeurPx:e1.W,hauteurPx:e1.H},{largeurPx:e1.flux.w,hauteurPx:e1.flux.h})};
        const rg={rayonKm:S.radius,relief:S.relief,toutVoir:S.beyond,analyseActive:S.photoVis,couche:true,distances:S.showDist,filtre:S.filter};
        const scene={pos,terrain,analysePhoto:photoSky,maintenantMs:Date.now(),cities:lieux,batiments};
        const M=mo.classerMonuments(monuments,scene,rg);
        const Lb=ly.classerLieux(lieux,scene,{...rg,couche:S.places});
        const assemblee=la.assemblerListe([M.classes.map(c=>c.el),Lb.map(c=>c.el)],M.dense), gardes=new Set(la.dedoublonner(assemblee));
        const liste=assemblee.filter(e=>gardes.has(e));
        const classesM=M.classes.filter(c=>gardes.has(c.el)), classesL=Lb.filter(c=>gardes.has(c.el));
        const pm=mo.preparerMonuments(classesM,vue,rg,{terrain,cities:lieux}), pL=ly.preparerLieux(classesL,vue,{...rg,couche:S.places});
        const etiquettes=la.ordonnerEtiquettes(liste,[...pm.etiquettes,...pL.etiquettes]);
        const cn=document.createElement('canvas'); cn.width=e1.W*e1.dpr; cn.height=e1.H*e1.dpr; const c2=cn.getContext('2d'), rec=window.__enregistreur(c2);
        const mesurerTexte=(police,t)=>{ c2.font=police; return c2.measureText(t).width; };
        const memoire=new Map(mem0), placeur=pl.creerPlaceur({largeurPx:e1.W,hauteurPx:e1.H,limiteHautePx:e1.safeT+24+14,reservations:e1.ui.map(r=>r.slice()),memoire});
        const {commandes,comptes}=et.composerEtiquettes(etiquettes,placeur,{mesurerTexte,familles:{affichage:e1.FD,mono:e1.FM}});
        const sp=ph.calque.preparer(photoSky,vue,{reglages:{toutVoir:S.beyond,analyseActive:S.photoVis},maintenantMs:Date.now(),jointure:'miter'});
        c2.setTransform(e1.dpr,0,0,e1.dpr,0,0); rec.demarrer();
        cv.avecRoulis(c2,vue,()=>cv.dessiner(c2,[...hz.commandesHorizon(vue),...sp,...commandes]));
        rec.arreter();
        const out=e=>e.kind==='monument'
          ?{name:e.name,lat:e.lat,lon:e.lon,kind:e.kind,dist:e.dist,brg:e.brg,angH:e.angH,far:e.far,hidden:e.hidden,low:e.low,roof:e.roof,cap:e.cap,near:e.near,occBy:e.occBy,photoHid:e.photoHid,snapDB:e.snapDB,aG:e.aG,aP:e.aP,mask:e.mask}
          :{name:e.name,lat:e.lat,lon:e.lon,kind:e.kind,dist:e.dist,brg:e.brg,far:e.far,hidden:e.hidden,photoHid:e.photoHid,aG:e.aG,aP:e.aP,mask:e.mask};
        return {ops:rec.evenements(),comptes,fantomesEnChamp:pm.fantomesEnChamp+pL.fantomesEnChamp,mem1:[...memoire],liste:liste.map(out),dense:M.dense};
      },{e1,mem0:v1.mem0,monuments,lieux,batiments});

      const tag=`${places?'lieux+monuments':'monuments seuls'} · ${mode}${avecPhoto?' +photo':''} cap+${dCap} incl ${incl}`;
      expect(v2.liste.length,`${tag} : nombre d'éléments classés`).toBe(e1.list.length);
      expect(v2.liste,`${tag} : éléments classés (ordre, drapeaux)`).toEqual(e1.list);
      expect({eligible:v2.comptes.eligibles,shown:v2.comptes.affichees,ghost:v2.comptes.fantomes,noRoom:v2.comptes.sansPlace,ghostInView:mode==='tout-voir'?v2.comptes.fantomesVus:v2.fantomesEnChamp},`${tag} : comptes`).toEqual(e1.stats);
      expect(mode==='tout-voir'?0:v2.fantomesEnChamp,`${tag} : badge de l'œil`).toBe(e1.badge);
      expect(v2.ops.length,`${tag} : nombre d'opérations de dessin`).toBe(v1.ops.length);
      { const k=v1.ops.findIndex((o,i)=>JSON.stringify(o)!==JSON.stringify(v2.ops[i])); if(k>=0) console.log('DIFF',tag,k,'\nV1',JSON.stringify(v1.ops.slice(Math.max(0,k-1),k+2)),'\nV2',JSON.stringify(v2.ops.slice(Math.max(0,k-1),k+2))); }
      for(let i=0;i<v1.ops.length;i++) expect(v2.ops[i],`${tag} : opération ${i}`).toEqual(v1.ops[i]);
      expect(v2.mem1,`${tag} : mémoire de placement`).toEqual(v1.mem1);
      nets+=e1.stats.shown; glyphes+=v1.ops.filter(o=>o.t==='trait'&&o.couleur==='rgba(14, 26, 43, 0.85)').length;
      silhouettes+=v1.ops.filter(o=>o.couleur==='rgba(14, 26, 43, 0.75)').length; pastilles+=v1.ops.filter(o=>o.t==='texte'&&/^\+\d+$/.test(o.texte)).length;
      plats+=v1.ops.filter(o=>o.t==='contour'&&o.alignement==='left'&&o.m[0]===e1.dpr&&o.m[1]===0).length;
      occ+=e1.list.filter(c=>c.occBy).length; cap+=e1.list.filter(c=>c.cap).length; roof+=e1.list.filter(c=>c.roof).length; photoHid+=e1.list.filter(c=>c.kind==='monument'&&c.photoHid).length;
      bilan[tag]={classes:e1.list.length,ops:v1.ops.length};
    }
    console.log(sc.id,'nets posés',nets,'· pictogrammes',glyphes,'· silhouettes',silhouettes,'· pastilles +N',pastilles,'· noms à plat',plats,'· masqués par un monument',occ,'· plafond',cap,'· toits',roof,'· photo',photoHid,'');
    expect(glyphes+silhouettes,'des pictogrammes ou des silhouettes doivent être dessinés').toBeGreaterThan(0);
    expect(nets,'des noms nets doivent être posés').toBeGreaterThan(0);
    expect(erreurs).toEqual([]);
    await ctx.close();
  });
}
