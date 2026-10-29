// Parité avec la v1 de la VISIBILITÉ D'APRÈS LA PHOTO sur des photos RÉELLES (dépôt privé Ar_city-photos) :
//  1. pixels réduits (240 px) identiques octet pour octet ;
//  2. `observeSkyline` de la v1 = `observerCiel` de la v2 : même verdict, même part de ciel, mêmes colonnes (relèvement, angle, « top ») ;
//  3. trame complète de la page (traits bleus pointillés de Tout voir, noms vus / cachés d'après la photo, règle de la photo) identique, Essentiel et Tout voir, 3 poses.
// Les analyses sont déclenchées à la main des deux côtés à la même pose, puis la trame est lue aussitôt (l'analyse reste fraîche 6 s). Ignoré sans PHOTOS_DIR.
const {test,expect}=require('@playwright/test');
const {ouvrirSceneReelle,disponible}=require('../helpers/scenes-reelles.js');
const {ouvrirV2Reelle}=require('../helpers/scene-v2-reelle.js');

test.describe.configure({retries:1});
const SCENES=[
  {id:'saint-malo-rempart',photo:'PXL_20261025_112230293.jpg',radius:30},
  {id:'turin-san-carlo',photo:'PXL_20261022_104200724.jpg',radius:30},
  {id:'ibiza-coucher',photo:'PXL_20260927_173517301.jpg',radius:30},
  {id:'morgat-plage',photo:'PXL_20260824_175454144.jpg',radius:180},
];
const POSES=[[0,0],[37,3],[-80,-2]];
const REGLAGES={relief:true,skyline:true,hamlets:true,telecom:true,buildings:true,sea:false,air:false,photoVis:false,cross:false,
  layers:{places:true,monuments:true,equip:true,urban:false,urbClip:true,urbSmooth:true,urbFill:true},poi:{lighthouse:true,cape:true,rock:true,view:true,heritage:true,beach:true}};
const EMPREINTE='(r=>{ if(!r) return null; let s=0,t=0; for(let i=0;i<r.d.length;i++){ s+=r.d[i]; t=(Math.imul(t,31)+r.d[i])>>>0; } return {cw:r.cw,ch:r.ch,s,t}; })';

for(const sc of SCENES){
  test(`visibilité d'après la photo v2 = v1 sur la scène réelle ${sc.id}`,async({browser})=>{
    test.skip(!disponible(sc),'dépôt privé Ar_city-photos absent');
    test.setTimeout(900000);
    const v1=await ouvrirSceneReelle(browser,sc,{reglages:REGLAGES}), {app,page,cap0}=v1;
    await app.waitFor('!monBusy&&!towerBusy&&!telecomBusy&&!buildingsBusy',120000);
    const REMISE='for(const c of cities.concat(farPeaks,monumentSites)){ c.demT=0; c._skyT=0; } for(const b of buildingSites) b._gT=0; applyOcclusion(false); _ridgesAt=0; _skyDistAt=0; true';
    await app.ev(REMISE);
    const v2=await ouvrirV2Reelle(browser,sc,v1,{reglages:REGLAGES}), p2=v2.page;

    // 1. pixels
    const e1=await app.ev(`${EMPREINTE}(grabFrameRGB(240))`);
    const e2=await p2.evaluate(async(src)=>{ const m=await import('/src/vision/lire-pixels.js'); return eval(src)(m.lirePixelsRecadres(document.getElementById('photoBg'),240,{largeurPx:innerWidth,hauteurPx:innerHeight})); },EMPREINTE);
    expect(e2,'pixels réduits (240 px) identiques à la v1').toEqual(e1);

    let colonnes=0, lus=0, ops=0, traitsBleus=0, vus=0;
    for(const mode of ['essentiel','tout-voir']) for(const [dCap,incl] of POSES){
      const cap=(cap0+dCap+360)%360, tag=`${mode} cap+${dCap} incl ${incl}`;
      await app.ev(`setBeyond(${mode==='tout-voir'}); S.headOff=${cap}; S.pitchOff=${incl}; S.photoVis=true; photoSky=null; photoT=Date.now()+1e9; for(const c of monumentSites) c._snapDB=0; citiesVer++; $('note').style.display='none'; true`);
      await app.ev(REMISE);
      await p2.evaluate(({cap,incl,beyond})=>{ const v=window.__vh2; v.S.headOff=cap; v.S.pitchOff=incl; v.S.beyond=beyond; v.S.photoVis=true; v.memoires.calageMonuments.clear(); v.memoires.analyseT=null; v.app.definirAnalysePhoto(null); v.analyse.t=Date.now()+1e9; // plus d'analyse automatique : on les déclenche à la main des deux côtés
       document.getElementById('note').style.display='none'; },{cap,incl,beyond:mode==='tout-voir'});
      // 2. analyses déclenchées au même instant, même pose
      await app.ev('photoSkylineUpdate(); true');
      await p2.evaluate(()=>window.__vh2.analyserCiel());
      const a1=await app.ev('({ok:photoSky.ok,skyFrac:photoSky.skyFrac,cols:photoSky.cols,heading:photoSky.heading,pitch:photoSky.pitch})');
      const a2=await p2.evaluate(()=>{ const a=window.__vh2.app.donnees().analysePhoto; return {ok:a.ok,skyFrac:a.skyFrac,cols:a.cols,heading:a.heading,pitch:a.pitch}; });
      expect(a2.ok,`${tag} : verdict`).toBe(a1.ok); expect(a2.skyFrac,`${tag} : part de ciel`).toBeCloseTo(a1.skyFrac,12);
      expect(a2.cols.length,`${tag} : nombre de colonnes`).toBe(a1.cols.length);
      a1.cols.forEach((c,i)=>{ if(Math.abs(a2.cols[i].brg-c.brg)>1e-9||Math.abs(a2.cols[i].a-c.a)>1e-9||a2.cols[i].top!==c.top) throw new Error(`${tag} : colonne ${i} ${JSON.stringify(c)} / ${JSON.stringify(a2.cols[i])}`); });
      colonnes+=a1.cols.length; lus+=a1.ok?1:0;
      // 3. trame
      await app.ev('lblMem.clear(); laneMem.clear(); true');
      await p2.evaluate(()=>{ const v=window.__vh2; v.memoires.placement.clear(); v.memoires.lignes.clear(); v.memoires.calageMonuments.clear(); v.memoires.analyseT=null; }); // le calage fin des monuments sur la silhouette lue est une mémoire d'une image à l'autre : remise à zéro des deux côtés (v1 : _snapDB)
      // le calage fin des monuments sur la silhouette lue avance d'un pas de lissage PAR ANALYSE (la v1 ne recalcule sa liste qu'à chaque analyse, toutes les 3 s) : un pas des deux côtés
      for(let i=0;i<2;i++) await app.frame();
      const f1=await page.evaluate(()=>window.__vh.frameOps(false,true));
      await p2.waitForTimeout(1100); // mesure des obstacles d'interface (1 par seconde) : on laisse expirer celle faite pendant que la note était affichée
      const f2=await p2.evaluate(()=>{ const v=window.__vh2; for(let i=0;i<2;i++) v.rendreImage(); const rec=window.__enregistreur(v.ctx); rec.demarrer(); v.rendreImage(); rec.arreter(); return rec.evenements(); });
      { const k=f1.ops.findIndex((o,i)=>JSON.stringify(o)!==JSON.stringify(f2[i])); if(k>=0||f1.ops.length!==f2.length) console.log('DIFF',tag,k,f1.ops.length,f2.length); }
      expect(f2.length,`${tag} : nombre d'opérations`).toBe(f1.ops.length);
      for(let i=0;i<f1.ops.length;i++) expect(f2[i],`${tag} : opération ${i}`).toEqual(f1.ops[i]);
      ops+=f1.ops.length; traitsBleus+=f1.ops.filter(o=>o.t==='trait'&&o.couleur==='rgba(140, 220, 255, 0.85)').length; vus+=a1.ok?1:0;
    }
    console.log(sc.id,'analyses lues',lus,'/ 6 · colonnes comparées',colonnes,'· opérations comparées',ops,'· traits bleus (Tout voir)',traitsBleus);
    expect(v2.erreurs).toEqual([]);
    await v2.ctx.close(); await v1.ctx.close();
  });
}
