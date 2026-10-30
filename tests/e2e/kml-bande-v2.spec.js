// Parité des COUCHES PERSONNELLES (KML) v2 avec la v1 : deux couches synthétiques (aucune donnée réelle) posées autour d'une scène réelle, avec et sans recherche
// (sites en gras, cartouches jaunes, pastilles au bord pour les sites hors écran), calques Lieux allumé ou éteint (la bande récupère alors le haut de l'écran), six poses.
// La v2 doit reproduire les sites affichés (ordre, distances) et TOUT ce que la v1 trace. Ignoré sans le dossier PHOTOS_DIR.
const {test,expect}=require('@playwright/test');
const {ouvrirSceneReelle,ignorerSiAbsent}=require('../helpers/scenes-reelles.js');

const SC={id:'saint-malo-rempart',photo:'PXL_20261025_112230293.jpg',radius:30};
const POSES=[[0,0],[37,3],[-80,-2],[150,6],[200,-4],[20,28]];
const REGLAGES={relief:true,skyline:false,hamlets:true,telecom:false,buildings:false,sea:false,air:false,photoVis:false,
  layers:{places:true,monuments:false,equip:false,urban:false,urbClip:true,urbSmooth:true,urbFill:true},poi:{lighthouse:true,cape:true,rock:true,view:true,heritage:true,beach:true}};
const REQUETES=['','relais','zzz'];
/** Points synthétiques autour de `pos` : anneaux de distances, groupes de noms identiques serrés, noms avec champ. */
function points(pos,graine){
  let a=graine; const r=()=>{ a=(a*1664525+1013904223)>>>0; return a/4294967296; };
  const noms=['Relais Nord','Site Alpha','Antenne rue','Relais plage','Pylône bleu','Château d’eau','Site Bêta','Relais gare'], out=[];
  for(let i=0;i<260;i++){
    const d=0.3+Math.pow(r(),2)*45, brg=(r()*360)*Math.PI/180, lat=pos.lat+Math.cos(brg)*d/111.19, lon=pos.lon+Math.sin(brg)*d/(111.19*Math.cos(pos.lat*Math.PI/180));
    const nom=noms[Math.floor(r()*noms.length)]+(r()<0.3?' '+i:'');
    out.push([+lat.toFixed(6),+lon.toFixed(6),nom,r()<0.2?'Une description '+i:'',r()<0.05?['https://exemple.org/'+i]:[],['C'+i,['Dinard','Cancale','Rance'][i%3]]]);
  }
  for(let k=0;k<3;k++) for(let j=0;j<12;j++){ // grappes : même nom, quelques mètres d'écart
    const d=1+k*3, brg=(40+k*100+j*0.15)*Math.PI/180;
    out.push([+(pos.lat+Math.cos(brg)*d/111.19).toFixed(6),+(pos.lon+Math.sin(brg)*d/(111.19*Math.cos(pos.lat*Math.PI/180))).toFixed(6),'Relais grappe '+k,'',[],['G'+k,'Dinard']]);
  }
  return out;
}

test(`couches personnelles v2 = v1 (bande et pastilles hors champ) sur la scène réelle ${SC.id}`,async({browser})=>{
  ignorerSiAbsent(test,SC);
  test.setTimeout(900000);
  const {app,page,ctx,erreurs,cap0,pos}=await ouvrirSceneReelle(browser,SC,{reglages:REGLAGES});
  await app.waitFor('!monBusy&&!towerBusy',120000);
  const couches=[{id:'a',name:'Couche A',color:'#FF8A3D',on:true,max:15,pts:points(pos,7),cols:['Code','Commune'],field:'@name',ignored:0,added:1},
    {id:'b',name:'Couche B',color:'#4FD1C5',on:true,max:40,pts:points(pos,99),cols:['Code','Commune'],field:'Commune',ignored:0,added:2}];
  await app.ev('S.layers.monuments=false; telecomSites=[]; buildingSites=[]; monumentSites=[]; cities=cities.filter(c=>SETTLE.has(c.kind)); farPeaks=[]; recompute(); citiesVer++; true');
  await app.ev(`userLayers=${JSON.stringify(couches)}.map(userMake); userRecompute(); true`);
  const lieux=await app.ev('cities.map(c=>({name:c.name,lat:c.lat,lon:c.lon,kind:c.kind,pop:c.pop,ele:c.ele}))');
  let nommes=0, iconeSeule=0, haut=0, hl=0, pointeurs=0, grappes=0;

  for(const places of [true,false]) for(const q of REQUETES) for(const [dCap,incl] of POSES){
    await app.ev(`S.layers.places=${places}; userSearch(${JSON.stringify(q)}); S.headOff=${(cap0+dCap+360)%360}; S.pitchOff=${incl}; citiesVer++; true`);
    await app.ev('for(const c of cities){ c.demT=0; c._skyT=0; } applyOcclusion(false); true');
    for(let i=0;i<2;i++) await app.frame();
    const v1=await page.evaluate(()=>window.__vh.frameOps());
    const e1=await app.ev(`(()=>{
      const dom=[]; for(const el of [$('tools'),$('chips'),$('btnSet'),$('shutter'),$('btnBeyond'),$('layers')]){ if(!el) continue; const r=el.getBoundingClientRect(); if(r.width&&r.height) dom.push([r.left,r.right,r.top,r.bottom]); }
      const list=visibleCities().filter(c=>SETTLE.has(c.kind)).map(c=>({name:c.name,lat:c.lat,lon:c.lon,kind:c.kind,dist:c.dist,brg:c.brg,far:!!c.far,hidden:!!c.hidden,photoHid:!!c.photoHid,aG:c.aG??null,aP:c.aP??null,mask:c.mask??null}));
      return {list,shown:userLayers.map(L=>L.shown.map(it=>[it.name,it.lab,it.dist,it.brg,it.hl])),ui:uiObstacles().map(r=>r.slice()).concat(dom),safeT,FD,FM,W,H,dpr,P:pose(),fov:vFov(),flux:camSrc(),stats:{...placeStats},
        safeB:parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-b'))||0,S:{radius:S.radius,relief:S.relief,beyond:!!S.beyond,places:S.layers.places,showDist:S.showDist,camFov:S.camFov,filter:S.filter}}; })()`);
    const v2=await page.evaluate(async({e1,mem0,lane0,couches,lieux,q,places})=>{
      const pr=await import('/src/rendu/projection.js'), cv=await import('/src/rendu/canvas.js'), hz=await import('/src/rendu/repere-horizon.js'), pl=await import('/src/rendu/placement.js'),
        et=await import('/src/rendu/etiquettes.js'), bd=await import('/src/rendu/bande.js'), ly=await import('/src/calques/lieux.js'), km=await import('/src/calques/kml.js'), dk=await import('/src/donnees/kml.js'), la=await import('/src/scene/liste-affichage.js');
      const ev=s=>window.__vh.ev(s), T=ev('terrain'), S=e1.S, pos=ev('pos');
      const bands=T.bands.map(b=>({z:b.z,max:b.max,ts:b.ts,shift:b.shift,garantie:b.guaranteed,tx0:b.tx0,ty0:b.ty0,nx:b.nx,ny:b.ny,tiles:b.tiles,altIdx:b.altIdx}));
      const terrain={h0:T.h0,pm:T.pm,bands};
      const vue={largeurPx:e1.W,hauteurPx:e1.H,capDeg:e1.P.heading,inclinaisonDeg:e1.P.pitch,roulisDeg:e1.P.roll,champDeg:pr.champAffiche(S.camFov,{largeurPx:e1.W,hauteurPx:e1.H},{largeurPx:e1.flux.w,hauteurPx:e1.flux.h})};
      const rg={rayonKm:S.radius,relief:S.relief,toutVoir:S.beyond,analyseActive:false,couche:S.places,distances:S.showDist,filtre:S.filter};
      const scene={pos,terrain,analysePhoto:null,maintenantMs:Date.now(),cities:lieux,batiments:[]};
      const Lb=ly.classerLieux(lieux,scene,rg), liste=la.assemblerListe([Lb.map(c=>c.el)],false), gardes=new Set(la.dedoublonner(liste)), classesL=Lb.filter(c=>gardes.has(c.el)), listeG=liste.filter(e=>gardes.has(e));
      const pL=ly.preparerLieux(classesL,vue,rg), etiquettes=la.ordonnerEtiquettes(listeG,pL.etiquettes);
      const perso=couches.map(o=>{ const L=dk.creerCouche(JSON.parse(JSON.stringify(o)),q); dk.positionnerCouche(L,pos); return L; });
      const cb=perso.map(L=>km.preparerCouche(L)).filter(Boolean), trouves=km.sitesTrouves(perso);
      const cn=document.createElement('canvas'); cn.width=e1.W*e1.dpr; cn.height=e1.H*e1.dpr; const c2=cn.getContext('2d'), rec=window.__enregistreur(c2);
      const mesurerTexte=(police,t)=>{ c2.font=police; return c2.measureText(t).width; }, familles={affichage:e1.FD,mono:e1.FM};
      const memoire=new Map(mem0), memoireLignes=new Map(lane0), placeur=pl.creerPlaceur({largeurPx:e1.W,hauteurPx:e1.H,limiteHautePx:e1.safeT+24+14,reservations:e1.ui.map(r=>r.slice()),memoire});
      const hy=pr.ordonneeHorizon(vue), debutBas=hy+30, basLimite=e1.H-Math.max(8,e1.safeB)-6, etageBas=basLimite-debutBas>=46;
      const opt=etage=>({etage,hy,basTexteLimite:basLimite,hautLimite:e1.safeT+24+14,debutBas,calquesHautActifs:S.places,lignesMax:60,memoireLignes,mesurerTexte,familles});
      let bande=null;
      const {commandes}=et.composerEtiquettes(etiquettes,placeur,{mesurerTexte,familles,avantNoms:etageBas?undefined:()=>{ bande=bd.composerBande(cb,vue,placeur,opt('haut')); }});
      if(etageBas) bande=bd.composerBande(cb,vue,placeur,opt('bas'));
      const pointeurs=bd.pointeursHorsChamp(trouves,vue,placeur,{hy,mesurerTexte,familles});
      c2.setTransform(e1.dpr,0,0,e1.dpr,0,0); rec.demarrer();
      cv.avecRoulis(c2,vue,()=>cv.dessiner(c2,[...hz.commandesHorizon(vue),...(etageBas?[]:bande.commandes),...commandes,...(etageBas?bande.commandes:[]),...pointeurs]));
      rec.arreter();
      return {ops:rec.evenements(),mem1:[...memoire],lane1:[...memoireLignes],stats:bande.stats,shown:perso.map(L=>L.shown.map(it=>[it.name,it.lab,it.dist,it.brg,it.hl])),nPointeurs:pointeurs.length/3};
    },{e1,mem0:v1.mem0,lane0:v1.lane0,couches,lieux,q,places});

    const tag=`places ${places} · recherche « ${q} » · cap+${dCap} incl ${incl}`;
    expect(v2.shown,`${tag} : sites affichés par couche`).toEqual(e1.shown);
    expect({labeled:v2.stats.nommes,iconOnly:v2.stats.iconeSeule,deck:v2.stats.etage},`${tag} : comptes de la bande`).toEqual(v1.infraStats);
    expect(v2.ops.length,`${tag} : nombre d'opérations de dessin`).toBe(v1.ops.length);
    { const k=v1.ops.findIndex((o,i)=>JSON.stringify(o)!==JSON.stringify(v2.ops[i])); if(k>=0) console.log('DIFF',tag,k,'\nV1',JSON.stringify(v1.ops.slice(Math.max(0,k-1),k+2)),'\nV2',JSON.stringify(v2.ops.slice(Math.max(0,k-1),k+2))); }
    for(let i=0;i<v1.ops.length;i++) expect(v2.ops[i],`${tag} : opération ${i}`).toEqual(v1.ops[i]);
    expect(v2.mem1,`${tag} : mémoire de placement des noms`).toEqual(v1.mem1);
    expect(v2.lane1,`${tag} : mémoire des lignes de la bande`).toEqual(v1.lane1);
    nommes+=v1.infraStats.labeled; iconeSeule+=v1.infraStats.iconOnly; if(v1.infraStats.deck==='haut') haut++;
    hl+=v1.ops.filter(o=>o.t==='trait'&&o.couleur==='#ffd23f'&&o.largeur===2.5).length; pointeurs+=v2.nPointeurs; grappes+=v1.ops.filter(o=>o.t==='contour'&&/^\d+ × /.test(o.texte)).length;
  }
  console.log('nommés',nommes,'· icône seule',iconeSeule,'· bande dessus',haut,'· halos de sites trouvés',hl,'· pastilles hors champ',pointeurs,'· grappes nommées',grappes);
  expect(nommes+iconeSeule,'des sites doivent être posés').toBeGreaterThan(0);
  expect(hl,'des sites trouvés doivent avoir leur halo').toBeGreaterThan(0);
  expect(pointeurs,'des pastilles hors champ doivent être dessinées').toBeGreaterThan(0);
  expect(erreurs).toEqual([]);
  await ctx.close();
});
