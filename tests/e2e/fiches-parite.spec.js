// Parité des fiches au toucher, v1 contre v2 : dans la v1 figée ouverte sur une scène réelle (caches du dépôt privé rejoués), les MÊMES éléments sont passés
// aux fonctions de la v1 (showMonumentDetail, showTelecomSheet, showMobileSheet, showUserSheet) et à celles de la v2 (src/ui/fiche-contenu.js) :
// le titre et le texte de la fiche doivent être identiques. Tout écart doit être justifié dans tests/ecarts-acceptes.json (domaine « fiches »).
const {test,expect}=require('@playwright/test');
const {ouvrirSceneReelle,ignorerSiAbsent}=require('../helpers/scenes-reelles.js');
const ECARTS=require('../ecarts-acceptes.json').filter(e=>e.domaine==='fiches');

const SCENE={id:'morgat-plage',photo:'PXL_20260824_175454144.jpg',radius:180,heure:'2026-08-24T17:54:54Z'}; // pylônes ANFR, monuments Wikidata et OSM, équipements

/** Exécuté dans la portée de la v1 (crochet de test) : fiches v1 et v2 des mêmes éléments, en texte. */
const COMPARER=`(async()=>{
  const v2=await import('/src/ui/fiche-contenu.js');
  const txt=h=>{ const d=document.createElement('div'); d.innerHTML=h; return d.textContent.replace(/\\s+/g,' ').trim(); };
  const ctx={S:{relief:S.relief,beyond:S.beyond},terrain,maintenantMs:Date.now(),dense:urbanDense()};
  const out={};
  const cmp=(nom,v1,f2)=>{ v1(); out[nom]={v1:{titre:$('dbgTitle').textContent,texte:txt($('dbgBody').innerHTML)},v2:{titre:f2.titre,texte:txt(f2.html)}}; };
  const list=visibleCities(), mons=list.filter(c=>c.kind==='monument'&&c.cat!=='equip'), eqs=list.filter(c=>c.kind==='monument'&&c.cat==='equip');
  const wd=mons.filter(m=>m.qid).sort((a,b)=>(b.links||0)-(a.links||0))[0], osm=mons.find(m=>m.src==='osm'&&m.unnamed&&m.osm)||mons.find(m=>m.src==='osm');
  const transp=mons.find(m=>m.far&&!m.cap)||mons.find(m=>m.cap), eq=eqs[0];
  if(wd) cmp('monument Wikidata',()=>showMonumentDetail(wd,null),v2.contenuFiche(wd,null,ctx));
  if(osm) cmp('tour OSM',()=>showMonumentDetail(osm,null),v2.contenuFiche(osm,null,ctx));
  if(transp) cmp('monument transparent',()=>showMonumentDetail(transp,null),v2.contenuFiche(transp,null,ctx));
  if(eq) cmp('équipement',()=>showMonumentDetail(eq,null),v2.contenuFiche(eq,null,ctx));
  if(eqs.length>2) cmp('groupe d’équipements',()=>showMonumentDetail(eqs[0],eqs.slice(0,3)),v2.contenuFiche(eqs[0],eqs.slice(0,3),ctx));
  if(mons.length>3){ const m={...mons[0],_hidObjs:mons.slice(1,4)}; cmp('monuments derrière une icône (+N)',()=>showMonumentDetail(m,null),v2.contenuFiche(m,null,ctx)); }
  const t=telecomSites.slice().sort((a,b)=>a.dist-b.dist);
  if(t[0]) cmp('site ANFR',()=>showTelecomSheet(t[0],null),v2.contenuFiche(t[0],null,ctx));
  if(t.length>2) cmp('groupe de sites ANFR',()=>showTelecomSheet(t[0],t.slice(0,3)),v2.contenuFiche(t[0],t.slice(0,3),ctx));
  const avion={kind:'plane',name:'AFR1234',id:'39a4b2',lat:48.3,lon:-4.4,alt:10363,vel:231,trk:84,t:Date.now()-180000,dist:12.4,brg:80};
  const navires=[{kind:'ship',name:'ENEZ EUSA',mmsi:'227005550',type:60,lat:48.25,lon:-4.5,vel:6.2,trk:270,t:Date.now()-60000,dist:3.1,brg:250},
    {kind:'ship',name:'PEN AR BED',mmsi:'227006760',type:36,lat:48.26,lon:-4.52,vel:0.1,trk:0,t:Date.now()-7200000,dist:4.2,brg:255}];
  cmp('avion',()=>showMobileSheet(avion,null),v2.contenuFiche(avion,null,ctx));
  cmp('bateau',()=>showMobileSheet(navires[0],null),v2.contenuFiche(navires[0],null,ctx));
  cmp('groupe de bateaux',()=>showMobileSheet(navires[0],navires),v2.contenuFiche(navires[0],navires,ctx));
  const kml={kind:'user',name:'Antenne Nord',lname:'Mes sites',col:'#E0A526',lat:48.27,lon:-4.6,dist:2.5,brg:10,desc:'Support\\nBéton',links:['https://exemple.fr/a'],cols:['Exploitant','Hauteur'],vals:['Test SA','42 m']};
  cmp('site KML',()=>showUserSheet(kml,null),v2.contenuFiche(kml,null,ctx));
  cmp('groupe KML',()=>showUserSheet(kml,[kml,{...kml,name:'Antenne Sud',dist:3.1}]),v2.contenuFiche(kml,[kml,{...kml,name:'Antenne Sud',dist:3.1}],ctx));
  $('dbg').classList.remove('open');
  return out;
})()`;

test('fiches : texte de la v2 identique à celui de la v1 (monument, équipement, site ANFR, groupes, avion, bateau, site KML)',async({browser})=>{
  ignorerSiAbsent(test,SCENE);
  test.setTimeout(240000);
  const {app,ctx,erreurs}=await ouvrirSceneReelle(browser,SCENE,{reglages:{telecom:true,layers:{places:true,monuments:true,equip:true}}});
  const r=await app.ev(COMPARER);
  const attendus=['monument Wikidata','tour OSM','monument transparent','équipement','groupe d’équipements','monuments derrière une icône (+N)','site ANFR','groupe de sites ANFR','avion','bateau','groupe de bateaux','site KML','groupe KML'];
  for(const nom of attendus) expect(r[nom],`fiche « ${nom} » absente de la scène`).toBeTruthy();
  const ecarts=[];
  for(const [nom,{v1,v2}] of Object.entries(r)){
    if(v1.titre===v2.titre&&v1.texte===v2.texte) continue;
    if(ECARTS.some(e=>e.fiche===nom)) continue;
    ecarts.push({nom,v1,v2});
  }
  if(ecarts.length) console.log(JSON.stringify(ecarts,null,1).slice(0,6000));
  expect(ecarts.map(e=>e.nom),'fiches différentes de la v1 sans écart justifié').toEqual([]);
  expect(erreurs).toEqual([]); await ctx.close();
});
