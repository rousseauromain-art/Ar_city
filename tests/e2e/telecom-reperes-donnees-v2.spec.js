// Parité des DONNÉES de pylônes télécom (ANFR) et de repères hauts (OpenStreetMap) v2 avec la v1 sur des scènes RÉELLES (photos et caches du dépôt privé
// Ar_city-photos) : la v1 charge avec le vrai code ; la v2 relit les MÊMES caches (réseau coupé) et doit reconstituer :
//  1. les supports télécom (icône, libellé, opérateurs, 5G, hauteur…) et le nombre de supports écartés (intérieur, tunnel, mobilier) ;
//  2. les repères hauts (tours, clochers, châteaux d'eau, cheminées, mâts, immeubles hauts) avec leurs noms fabriqués et le drapeau `ess`.
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
const CHAMPS_REPERE=['name','lat','lon','kind','height_m','named','id','ess'];

for(const sc of SCENES){
  test(`données de pylônes et de repères hauts v2 = v1 sur la scène réelle ${sc.id}`,async({browser})=>{
    test.skip(!disponible(sc),'dépôt privé Ar_city-photos absent');
    test.setTimeout(600000);
    const {app,page,ctx,erreurs}=await ouvrirSceneReelle(browser,sc,{reglages:REGLAGES});
    await app.waitFor('!telecomBusy&&!buildingsBusy',120000);
    const v1={
      tel:await app.ev('telecomSites.map(s=>{ const o={}; for(const k in s) if(k!=="dist"&&k!=="brg") o[k]=s[k]; return o; })'), indoor:await app.ev('telecomIndoor'),
      bld:await app.ev(`buildingSites.map(b=>{ const o={}; for(const k of ${JSON.stringify(CHAMPS_REPERE)}) o[k]=b[k]; return o; })`),
      rTel:await app.ev('telR()'), kmBld:await app.ev('S.buildingsMax'),
    };
    console.log(sc.id,'pylônes',v1.tel.length,'· écartés',v1.indoor,'· repères hauts',v1.bld.length);

    const v2=await page.evaluate(async({rTel,kmBld})=>{
      const cd=await import('/src/donnees/cache-donnees.js'), ov=await import('/src/donnees/overpass.js'), os=await import('/src/donnees/osm-tuiles.js'),
        te=await import('/src/donnees/telecom.js'), rh=await import('/src/donnees/reperes-hauts.js'), rs=await import('/src/donnees/reseau.js');
      const ev=s=>window.__vh.ev(s), pos=ev('pos');
      const cache=cd.creerCacheDonnees('vh-data-v1');
      const coupe=async(url,o={})=>{ if(o.brut) return {ok:false,statut:503,donnees:{error:'hors ligne (test)'}}; throw new rs.ErreurReseau('HTTP 503',503,url); };
      const horsLigne={interroger:async()=>{ throw new Error('hors ligne (test)'); }};
      let tel={sites:[],ecartes:0,erreur:null};
      try{ const r=await te.creerSourceTelecom({reseau:{requeter:coupe},cache,relais:ev('CONFIG.relay')}).charger({pos,rayonKm:rTel}); tel={sites:r.sites,ecartes:r.ecartes,source:r.source,horsFrance:r.horsFrance,erreur:null}; }
      catch(e){ tel.erreur=String(e.message||e); }
      let bld={liste:[],erreur:null};
      try{ const osm=os.creerSourceOsm({cache,overpass:horsLigne}); const r=await rh.creerSourceReperes({osm,overpass:horsLigne,cache}).charger({pos,rayonKm:kmBld}); bld={liste:r.liste,partiel:r.partiel,secours:r.secours,erreur:null}; }
      catch(e){ bld.erreur=String(e.message||e); }
      return {tel,bld};
    },{rTel:v1.rTel,kmBld:v1.kmBld});
    console.log(sc.id,'v2 : pylônes',v2.tel.sites.length,v2.tel.source||v2.tel.erreur,'· repères',v2.bld.liste.length,v2.bld.erreur||'');

    // 1. supports télécom : mêmes champs, même ordre (les champs de calcul de la v1, dist et brg, sont retirés)
    expect(v2.tel.sites.length,'nombre de supports télécom').toBe(v1.tel.length);
    expect(JSON.parse(JSON.stringify(v2.tel.sites)),'supports télécom').toEqual(v1.tel);
    expect(v2.tel.ecartes,'supports écartés').toBe(v1.indoor);
    // 2. repères hauts
    expect(v2.bld.liste.length,'nombre de repères hauts').toBe(v1.bld.length);
    expect(JSON.parse(JSON.stringify(v2.bld.liste)),'repères hauts').toEqual(v1.bld);
    expect(erreurs).toEqual([]);
    await ctx.close();
  });
}
