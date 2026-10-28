// Parité des DONNÉES de monuments v2 avec la v1 sur des scènes RÉELLES (photos et caches du dépôt privé Ar_city-photos) : la v1 charge ses monuments
// avec le vrai code ; la v2 relit les MÊMES caches (réseau coupé) et doit reconstituer :
//  1. la base Wikidata (monuments et équipements, écartés, seuil relevé) ;
//  2. les objets OpenStreetMap des tuiles (tours, statues) ;
//  3. la liste finale `monumentSites` (tours TDF et ANFR, immeubles hauts, statues, fusions, doublons) ;
//  4. les bâtiments déjà dessinés comme monuments (dupMon).
// Ignoré sans le dossier PHOTOS_DIR (CI sans jeton, REFONTE.md §9).
const {test,expect}=require('@playwright/test');
const {ouvrirSceneReelle,disponible}=require('../helpers/scenes-reelles.js');

const SCENES=[
  {id:'saint-malo-rempart',photo:'PXL_20261025_112230293.jpg',radius:30},
  {id:'turin-san-carlo',photo:'PXL_20261022_104200724.jpg',radius:30},
  {id:'ibiza-coucher',photo:'PXL_20260927_173517301.jpg',radius:30},
  {id:'morgat-plage',photo:'PXL_20260824_175454144.jpg',radius:180},
  {id:'paris-grenelle-nuit',pos:{lat:48.8494956,lon:2.2865298},capDeg:28,radius:180,heure:'2026-10-27T19:30:00Z',ecran:{width:412,height:915}},
];
const REGLAGES={relief:true,skyline:false,hamlets:true,telecom:true,buildings:true,sea:false,air:false,photoVis:false,
  layers:{places:true,monuments:true,equip:true,urban:false,urbClip:true,urbSmooth:true,urbFill:true},
  poi:{lighthouse:true,cape:true,rock:true,view:true,heritage:true,beach:true}};
// champs stables d'un monument (la v1 y ajoute des champs de calcul : dist, brg, far, hidden...)
const CHAMPS=['name','lat','lon','kind','cat','qid','type','links','prot','htWd','htOsm','ht','types','why','minor','src','tdf','loc','unnamed','hint','osm','anfr','osmTall','tags'];
const PROJ=`(m=>{ const o={}; for(const k of ${JSON.stringify(CHAMPS)}) if(m[k]!==undefined) o[k]=m[k]; return o; })`;

for(const sc of SCENES){
  test(`données de monuments v2 = v1 sur la scène réelle ${sc.id}`,async({browser})=>{
    test.skip(!disponible(sc),'dépôt privé Ar_city-photos absent');
    test.setTimeout(600000);
    const {app,page,ctx,erreurs}=await ouvrirSceneReelle(browser,sc,{reglages:REGLAGES});
    await app.waitFor('!monBusy&&!towerBusy',120000);
    const v1={
      base:await app.ev(`monBase.map(${PROJ})`), ecartes:await app.ev('monExcl'), stats:await app.ev('monStats'), trim:await app.ev('monTrim'), rognes:await app.ev('monTrimmed.length'),
      finale:await app.ev(`monumentSites.map(${PROJ})`), tours:await app.ev('towerRaw'), statues:await app.ev('statueRaw'),
      dup:await app.ev('buildingSites.map(b=>!!b.dupMon)'),
    };
    console.log(sc.id,'Wikidata',v1.base.length,'· écartés',v1.ecartes.length,'· tours OSM',v1.tours.length,'· statues',v1.statues.length,'· finale',v1.finale.length,'· batiments',v1.dup.length);
    expect(v1.base.length+v1.finale.length,'la v1 doit avoir des monuments').toBeGreaterThan(0);

    const v2=await page.evaluate(async({PROJ})=>{
      const cd=await import('/src/donnees/cache-donnees.js'), ov=await import('/src/donnees/overpass.js'), os=await import('/src/donnees/osm-tuiles.js'),
        mo=await import('/src/donnees/monuments.js'), mw=await import('/src/donnees/monuments-osm.js'), rs=await import('/src/donnees/reseau.js');
      const ev=s=>window.__vh.ev(s), S=ev('S'), pos=ev('pos'), R=mo.rayonMonuments(S.radius), proj=eval(PROJ);
      const cache=cd.creerCacheDonnees('vh-data-v1'), mem={};
      const stockage={lire:(n,d)=>mem[n]??d,ecrire:(n,v)=>{ mem[n]=JSON.parse(JSON.stringify(v)); return true; }};
      const coupe=async(url,o={})=>{ if(o.brut) return {ok:false,statut:503,donnees:{error:'hors ligne (test)'}}; throw new rs.ErreurReseau('HTTP 503',503,url); };
      const reseau={requeter:coupe};
      const wd=await mo.creerSourceMonuments({reseau,cache,stockage,relais:ev('CONFIG.relay')}).charger({pos,rayonKm:S.radius});
      const osm=await os.creerSourceOsm({cache,overpass:{interroger:async()=>{ throw new Error('hors ligne (test)'); }}}).charger(pos,Math.min(12,R),R);
      const sep=mw.separerTuilesOsm(osm.objets);
      const f=wd.fabrication;
      const gardes=f?f.gardes:[];
      const e={pos,rayonKm:R,cities:ev('cities'),tours:sep.tours,statues:sep.statues,hints:ev('osmHints'),supportsAnfr:ev('telecomSites'),batiments:ev('buildingSites'),avecAnfr:!!S.layers.monuments};
      const finale=mw.combinerMonuments(e,gardes);
      return {statut:wd.statut,comment:wd.comment,gardes:gardes.length,base:gardes.map(proj),ecartes:f?f.ecartes:[],stats:f?{n:f.gardes.length,nMon:f.monuments.length,nEq:f.equipements.length,nExcl:f.nEcartes,prot:f.nProteges,trim:f.seuilRelevePar}:null,
        rognes:f?f.rognes.length:0,tours:sep.tours,statues:sep.statues,finale:finale.map(proj),dup:mw.doublonsBatiments(ev('buildingSites'),finale),osmTuiles:osm.tuiles,osmEchecs:osm.echecs};
    },{PROJ});
    console.log(sc.id,'v2 :',v2.statut,v2.comment.slice(0,80),'· tuiles OSM',v2.osmTuiles,'· échecs',v2.osmEchecs);

    // 1. base Wikidata (les champs modifiés par les bâtiments hauts sont comparés dans la liste finale)
    const stable=m=>({name:m.name,lat:m.lat,lon:m.lon,cat:m.cat,qid:m.qid,links:m.links,prot:m.prot,htWd:m.htWd,types:m.types,why:m.why,minor:m.minor});
    const base1=v1.base.filter(m=>!m.src).map(stable), base2=v2.base.map(stable);
    expect(base2.length,'nombre de monuments et équipements Wikidata').toBe(base1.length);
    expect(base2,'base Wikidata').toEqual(base1);
    expect(v2.ecartes,'écartés (nom, langues, classes, motif)').toEqual(v1.ecartes);
    if(v2.stats) expect({n:v2.stats.n,nMon:v2.stats.nMon,nEq:v2.stats.nEq,nExcl:v2.stats.nExcl,prot:v2.stats.prot,trim:v2.stats.trim},'comptes').toEqual({n:v1.stats.n,nMon:v1.stats.nMon,nEq:v1.stats.nEq,nExcl:v1.stats.nExcl,prot:v1.stats.prot,trim:v1.stats.trim});
    expect(v2.rognes,'monuments rognés par le plafond').toBe(v1.rognes);
    // 2. objets OSM des tuiles
    expect(v2.tours,'tours OSM').toEqual(v1.tours); expect(v2.statues,'statues OSM').toEqual(v1.statues.map(s=>s));
    // 3. liste finale
    expect(v2.finale.length,'nombre de monuments au total').toBe(v1.finale.length);
    expect(v2.finale,'monuments au total (tours, immeubles hauts, statues, fusions)').toEqual(v1.finale);
    // 4. bâtiments déjà dessinés comme monuments
    expect(v2.dup,'bâtiments doublons de monuments').toEqual(v1.dup);
    expect(erreurs).toEqual([]);
    await ctx.close();
  });
}
