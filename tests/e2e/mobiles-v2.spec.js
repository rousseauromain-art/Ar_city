// Parité de l'AFFICHAGE des avions et des bateaux v2 avec la v1 sur une scène RÉELLE (relief du dépôt privé Ar_city-photos, quai de Saint-Malo, vue vers le large) avec du trafic
// SYNTHÉTIQUE (aucune donnée réelle) : un port dense (dizaines de bateaux serrés à quai et en mer) et des avions (un groupe serré). La v2 reçoit la même liste de mobiles proches que
// la v1 (`mobiles()`) et doit reproduire TOUT ce que la v1 trace : icônes (flèches, pentagones colorés, ronds), fils, noms à plat en escalier, noms d'avions inclinés ou à plat,
// « NOM +N », pastilles « +N » des bateaux sans place, textes de vitesse et de distance, mémoire de placement, choix des bateaux nommés — frais, puis gardé 0,4 s.
// Ignoré sans le dossier PHOTOS_DIR (CI sans jeton, REFONTE.md §9).
const {test,expect}=require('@playwright/test');
const {ouvrirSceneReelle,ignorerSiAbsent}=require('../helpers/scenes-reelles.js');
const {offset}=require('../helpers/app');

const SC={id:'saint-malo-quai',pos:{lat:48.6440,lon:-2.0230},capDeg:330,radius:30,ecran:{width:915,height:412}};
const POSES=[[0,0],[37,3],[-80,-2],[150,6],[-20,10]]; // [écart de cap, inclinaison]
const CONFIGS=[{places:true,mon:true},{places:false,mon:false}];
const REGLAGES={relief:true,skyline:false,hamlets:true,telecom:false,buildings:false,sea:false,air:false,photoVis:false,
  layers:{places:true,monuments:true,equip:false,urban:false,urbClip:true,urbSmooth:true,urbFill:true},poi:{lighthouse:true,cape:true,rock:true,view:true,heritage:true,beach:true}};
const CHAMPS=['name','lat','lon','kind','cat','qid','type','links','prot','htWd','htOsm','ht','types','why','minor','src','tdf','loc','unnamed','hint','osm','anfr','osmTall','tags'];
const PROJ=`(m=>{ const o={}; for(const k of ${JSON.stringify(CHAMPS)}) if(m[k]!==undefined) o[k]=m[k]; return o; })`;
const STRIP='({name:c.name,lat:c.lat,lon:c.lon,kind:c.kind,pop:c.pop,ele:c.ele})';
const EXTRAIRE_V1=`(()=>{
  const dom=[]; for(const el of [$('tools'),$('chips'),$('btnSet'),$('shutter'),$('btnBeyond'),$('layers')]){ if(!el) continue; const r=el.getBoundingClientRect(); if(r.width&&r.height) dom.push([r.left,r.right,r.top,r.bottom]); }
  return {mobiles:mobiles().map(m=>({...m})), list:visibleCities().filter(c=>SETTLE.has(c.kind)||(c.kind==='monument'&&c.cat!=='equip')).map(c=>c.kind==='monument'
      ?{name:c.name,lat:c.lat,lon:c.lon,kind:c.kind,dist:c.dist,brg:c.brg,angH:c.angH,far:!!c.far,hidden:!!c.hidden,low:!!c.low,roof:!!c.roof,cap:!!c.cap,near:!!c.near,occBy:c.occBy||null,photoHid:!!c.photoHid,snapDB:c._snapDB||0,aG:c.aG??null,aP:c.aP??null,mask:c.mask??null}
      :{name:c.name,lat:c.lat,lon:c.lon,kind:c.kind,dist:c.dist,brg:c.brg,far:!!c.far,hidden:!!c.hidden,photoHid:!!c.photoHid,aG:c.aG??null,aP:c.aP??null,mask:c.mask??null}),
    stats:{...placeStats}, ui:uiObstacles().map(r=>r.slice()).concat(dom), safeT, FD, FM, W, H, dpr, P:pose(), fov:vFov(), flux:camSrc(), oeil:obsElev+1.6, now:Date.now(),
    S:{radius:S.radius,relief:S.relief,beyond:!!S.beyond,places:S.layers.places,monuments:!!S.layers.monuments,air:!!S.air,sea:!!S.sea,showDist:S.showDist,camFov:S.camFov,filter:S.filter}};
})()`;

/** Trafic synthétique : port dense (quai, large) et avions (dont un groupe serré). */
function trafic(pos,cap,now){
  let a=17; const r=()=>{ a=(a*16807)%2147483647; return a/2147483647; };
  const noms=['ACTUAL LEADER','SPIRIT OF UKRAINE','BANQUE POPULAIRE','MACIF','SODEBO ULTIM 3','GITANA 17','SVR LAZARTIGUE','PRB','CHARAL','APIVIA','LINKEDOUT','FORTINET','ARVOR','BRITTANY FERRIES','CONDOR LIBERATION','EMERAUDE','VEDETTE CEZEMBRE','ROCHEBONNE','LA CANCALAISE','PETIT PRINCE','CORSAIRE','SURCOUF','DUGUAY TROUIN'];
  const ships=[];
  for(let i=0;i<48;i++){ const proche=i<4, km=proche?0.3+i*0.05:0.5+r()*(i<36?2.2:12), brg=cap+(proche?-8+i*5:-45+r()*90), p=offset(pos,km,brg), arret=i%3!==0;
    ships.push([String(227000000+i),{name:i===9?'':noms[i%noms.length]+(i>=noms.length?' '+i:''),mmsi:String(227000000+i),type:[36,37,30,60,70,80,52,null][i%8],lat:p.lat,lon:p.lon,trk:r()*360,vel:arret?0:1.5+r()*8,alt:0,vr:0,t:now-i*3000}]); }
  const planes=[];
  for(let i=0;i<16;i++){ const grp=i<5, km=grp?25:8+r()*70, brg=grp?cap+6+i*0.2:cap-60+r()*120, p=offset(pos,km,brg);
    planes.push({name:i===3?'':'AF'+(1200+i),id:'ab'+i,lat:p.lat,lon:p.lon,alt:grp?1500+i*40:2500+r()*8000,trk:r()*360,vel:120+r()*130,vr:(r()-0.5)*8,t:now-i*1000}); }
  return {ships,planes};
}

test(`affichage des avions et des bateaux v2 = v1 sur la scène réelle ${SC.id}`,async({browser})=>{
  ignorerSiAbsent(test,SC);
  test.setTimeout(1200000);
  const {app,page,ctx,erreurs,cap0}=await ouvrirSceneReelle(browser,SC,{reglages:REGLAGES});
  await app.waitFor('!monBusy&&!towerBusy',120000);
  const now=await app.ev('Date.now()'), T=trafic(SC.pos,cap0,now);
  await app.ev(`S.air=true; S.sea=true; S.airMax=120; S.seaMax=40; planes=${JSON.stringify(T.planes)}; ships=new Map(${JSON.stringify(T.ships)}); cities=cities.filter(c=>SETTLE.has(c.kind)); farPeaks=[]; telecomSites=[]; buildingSites=[]; recompute(); true`);
  await app.ev('for(const c of cities.concat(farPeaks,monumentSites)){ c.demT=0; c._skyT=0; } applyOcclusion(false); true');
  const monuments=await app.ev(`monumentSites.map(${PROJ})`), lieux=await app.ev(`cities.map(c=>${STRIP})`);
  let avionsNommes=0, groupesAvions=0, nommesAvion=0, nommesBateau=0, pastilles=0, plats=0, inclines=0, cachees=0, recalcules=0, icones=0;

  /** une image : variante 'frais' (v1 remet son choix à zéro) ou 'garde' (conserve le choix de l'image précédente) */
  async function comparer(tag,garder,cfg){
    const v1=await page.evaluate(g=>window.__vh.frameOps(g),garder);
    const e1=await app.ev(EXTRAIRE_V1);
    const v2=await page.evaluate(async({e1,mem0,sel0,cfg,monuments,lieux})=>{
      const pr=await import('/src/rendu/projection.js'), cv=await import('/src/rendu/canvas.js'), hz=await import('/src/rendu/repere-horizon.js'), pl=await import('/src/rendu/placement.js'),
        et=await import('/src/rendu/etiquettes.js'), mb=await import('/src/rendu/mobiles.js'), es=await import('/src/rendu/escalier.js'), ly=await import('/src/calques/lieux.js'),
        mo=await import('/src/calques/monuments.js'), av=await import('/src/calques/avions.js'), ba=await import('/src/calques/bateaux.js'), la=await import('/src/scene/liste-affichage.js');
      const ev=s=>window.__vh.ev(s), T=ev('terrain'), S=e1.S, pos=ev('pos');
      const bands=T.bands.map(b=>({z:b.z,max:b.max,ts:b.ts,shift:b.shift,garantie:b.guaranteed,tx0:b.tx0,ty0:b.ty0,nx:b.nx,ny:b.ny,tiles:b.tiles,altIdx:b.altIdx}));
      const terrain={h0:T.h0,pm:T.pm,bands};
      const vue={largeurPx:e1.W,hauteurPx:e1.H,capDeg:e1.P.heading,inclinaisonDeg:e1.P.pitch,roulisDeg:e1.P.roll,champDeg:pr.champAffiche(S.camFov,{largeurPx:e1.W,hauteurPx:e1.H},{largeurPx:e1.flux.w,hauteurPx:e1.flux.h})};
      const rg={rayonKm:S.radius,relief:S.relief,toutVoir:S.beyond,analyseActive:false,couche:S.monuments,distances:S.showDist,filtre:S.filter};
      const scene={pos,terrain,analysePhoto:null,maintenantMs:e1.now,cities:lieux,batiments:[],monuments};
      const M=mo.classerMonuments(monuments,scene,rg), Mc=S.monuments?M.classes:[], Lb=ly.classerLieux(lieux,scene,{...rg,couche:S.places});
      const assemblee=la.assemblerListe([Mc.map(c=>c.el),Lb.map(c=>c.el)],M.dense), gardes=new Set(la.dedoublonner(assemblee)), liste=assemblee.filter(e=>gardes.has(e));
      const pm=mo.preparerMonuments(Mc.filter(c=>gardes.has(c.el)),vue,rg,{terrain,cities:lieux}), pL=ly.preparerLieux(Lb.filter(c=>gardes.has(c.el)),vue,{...rg,couche:S.places});
      const etiquettes=la.ordonnerEtiquettes(liste,[...pm.etiquettes,...pL.etiquettes]);
      // mobiles : classement par genre, fusion dans l'ordre d'origine (par distance), regroupement des icônes
      const sceneM={oeilM:e1.oeil}, rm={couche:true,filtre:S.filter?S.filter.toLowerCase():''};
      const cl=[...av.classerMobiles(e1.mobiles,vue,sceneM,{...rm,couche:S.air},'plane'),...ba.classerNavires(e1.mobiles,vue,sceneM,{...rm,couche:S.sea})].filter(c=>c.etat==='net').sort((a,b)=>a.el.ordre-b.el.ordre).map(c=>c.el);
      const groupes=mb.grouperMobiles(cl);
      const cn=document.createElement('canvas'); cn.width=e1.W*e1.dpr; cn.height=e1.H*e1.dpr; const c2=cn.getContext('2d'), rec=window.__enregistreur(c2);
      const mesurerTexte=(police,t)=>{ c2.font=police; return c2.measureText(t).width; }, familles={affichage:e1.FD,mono:e1.FM};
      const memoire=new Map(mem0), placeur=pl.creerPlaceur({largeurPx:e1.W,hauteurPx:e1.H,limiteHautePx:e1.safeT+24+14,reservations:e1.ui.map(r=>r.slice()),memoire});
      const {commandes}=et.composerEtiquettes(etiquettes,placeur,{mesurerTexte,familles,avantNoms:()=>mb.reserverIcones(groupes,placeur.reservations)});
      const optM={mesurerTexte,familles,distances:S.showDist}, icones=mb.commandesIcones(groupes,vue), noms=mb.composerAvions(groupes,placeur,optM);
      const choix=sel0?{ids:new Map(sel0.ids),key:sel0.key,t:sel0.t,h:sel0.h,p:sel0.p}:{ids:null};
      const bat=es.poserBateaux({bateaux:groupes.filter(g=>g.kind==='ship').flatMap(g=>g.items.map(it=>({...it,g}))),vue,reservations:placeur.reservations,estIcone:r=>groupes.includes(r[5]),mesurerTexte,familles,maintenantMs:e1.now,choix,distances:S.showDist});
      c2.setTransform(e1.dpr,0,0,e1.dpr,0,0); rec.demarrer();
      cv.avecRoulis(c2,vue,()=>cv.dessiner(c2,[...hz.commandesHorizon(vue),...commandes,...icones,...noms.commandes,...bat.commandes]));
      rec.arreter();
      const sel1=bat.choix.ids?{ids:[...bat.choix.ids],key:bat.choix.key,t:bat.choix.t,h:bat.choix.h,p:bat.choix.p}:null;
      return {ops:rec.evenements(),mem1:[...memoire],sel1,nGroupes:groupes.length,nommes:bat.nommes};
    },{e1,mem0:v1.mem0,sel0:v1.sel0,cfg,monuments,lieux});
    expect(v2.ops.length,`${tag} : nombre d'opérations de dessin`).toBe(v1.ops.length);
    { const k=v1.ops.findIndex((o,i)=>JSON.stringify(o)!==JSON.stringify(v2.ops[i])); if(k>=0) console.log('DIFF',tag,k,'\nV1',JSON.stringify(v1.ops.slice(Math.max(0,k-1),k+2)),'\nV2',JSON.stringify(v2.ops.slice(Math.max(0,k-1),k+2))); }
    for(let i=0;i<v1.ops.length;i++) expect(v2.ops[i],`${tag} : opération ${i}`).toEqual(v1.ops[i]);
    expect(v2.mem1,`${tag} : mémoire de placement des noms`).toEqual(v1.mem1);
    expect(v2.sel1,`${tag} : choix des bateaux nommés`).toEqual(v1.sel1);
    return {v1,e1};
  }

  for(const cfg of CONFIGS) for(const [dCap,incl] of POSES){
    await app.ev(`S.layers.places=${cfg.places}; S.layers.monuments=${cfg.mon}; setBeyond(false); S.headOff=${(cap0+dCap+360)%360}; S.pitchOff=${incl}; S.photoVis=false; photoSky=null; citiesVer++; true`);
    await app.ev('for(const c of cities.concat(farPeaks,monumentSites)){ c.demT=0; c._skyT=0; } applyOcclusion(false); true');
    const tag=`places ${cfg.places} · monuments ${cfg.mon} · cap+${dCap} incl ${incl}`;
    await page.clock.setFixedTime(new Date(now));
    await app.frame();
    const frais=await comparer(tag+' · choix frais',false,cfg);
    const v1=frais.v1;
    nommesAvion+=v1.ops.filter(o=>o.t==='contour'&&o.couleur==='rgba(14, 26, 43, 0.9)').length;
    pastilles+=v1.ops.filter(o=>o.t==='texte'&&/^\+\d+$/.test(o.texte)&&o.alignement==='center').length;
    icones+=v1.ops.filter(o=>o.t==='trait'&&(o.couleur==='rgba(14, 26, 43, 0.85)')&&(o.largeur===2.5||o.largeur===2)).length;
    plats+=v1.ops.filter(o=>o.t==='contour'&&o.alignement==='left'&&o.m[0]===frais.e1.dpr&&o.m[1]===0&&/^\d+|[A-Z]/.test(o.texte)).length;
    inclines+=v1.ops.filter(o=>o.t==='contour'&&o.m[1]!==0).length;
    avionsNommes+=v1.ops.filter(o=>o.t==='contour'&&/^AF\d+/.test(o.texte)).length; groupesAvions+=v1.ops.filter(o=>o.t==='contour'&&/^AF\d+ \+\d+$/.test(o.texte)).length;
    nommesBateau+=v1.sel1?v1.sel1.ids.length:0;
    // choix gardé : même instant (moins de 150 ms)
    await comparer(tag+' · choix gardé',true,cfg);
    // 300 ms plus tard, la vue a tourné de 1° : le choix est encore gardé ; de 5° : il est refait
    await page.clock.setFixedTime(new Date(now+300));
    await app.ev(`S.headOff=${(cap0+dCap+1+360)%360}; true`);
    await comparer(tag+' · choix gardé après 300 ms, +1°',true,cfg);
    await page.clock.setFixedTime(new Date(now+330));
    await app.ev(`S.headOff=${(cap0+dCap+5+360)%360}; true`);
    const refait=await comparer(tag+' · choix refait après rotation de 5°',true,cfg);
    if(refait.v1.sel0&&refait.v1.sel1&&refait.v1.sel1.t!==refait.v1.sel0.t) recalcules++;
    await page.clock.setFixedTime(new Date(now));
  }
  console.log('bateaux nommés (choix frais)',nommesBateau,'· pastilles +N',pastilles,'· avions nommés',avionsNommes,'· groupes « NOM +N »',groupesAvions,'· icônes dessinées',icones,'· choix refaits',recalcules);
  expect(icones,'des icônes de mobiles doivent être dessinées').toBeGreaterThan(0);
  expect(avionsNommes,'des avions doivent être nommés').toBeGreaterThan(0);
  expect(groupesAvions,'un groupe d’avions serrés doit être nommé « NOM +N »').toBeGreaterThan(0);
  expect(nommesBateau,'des bateaux doivent être nommés').toBeGreaterThan(0);
  expect(erreurs).toEqual([]);
  await ctx.close();
});
