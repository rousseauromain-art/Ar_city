// Parité avec la v1 de « CALER AUTO » (soleil → relief → repères) sur des photos RÉELLES (dépôt privé Ar_city-photos), à l'heure RÉELLE de la prise de vue :
//  1. la liste des repères fiables (tours, clochers, dômes) est la même dans la v1 (`landmarksForCal`) et dans la v2 (liste du moteur de scène) ;
//  (la v2 a deux évolutions absentes de la v1 (j) : le test de permutation des repères et l'ordre relief → soleil ; ici `permutation:false` et `ordre:'soleil-relief'` redonnent la v1 ;
//  la v2 refuse en plus les concordances fortuites, apport du 26/10 absent de la v1 : ici `permutation:false` redonne la v1)
//  2. pour le cap enregistré dans l'EXIF ET pour 10 départs décalés (cap ±4, ±8, ±12°, champ ±6°, (−6,−6), (+6,+6) : ceux du banc d'essai de la v1), `runAutoAlign()` de la v1 et `calerAutomatiquement`
//     de la v2 donnent le même message, le même cap, le même horizon et le même champ.
// Ignoré sans le dossier PHOTOS_DIR (CI sans jeton).
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
const DEPARTS=[[0,0],[-12,0],[-8,0],[-4,0],[4,0],[8,0],[12,0],[0,-6],[0,6],[-6,-6],[6,6]]; // [décalage de cap, décalage de champ]
const REGLAGES={relief:true,skyline:false,hamlets:true,telecom:true,buildings:true,sea:false,air:false,photoVis:false,cross:false,
  layers:{places:true,monuments:true,equip:true,urban:false,urbClip:true,urbSmooth:true,urbFill:true},poi:{lighthouse:true,cape:true,rock:true,view:true,heritage:true,beach:true}};

for(const sc of SCENES){
  test(`« Caler auto » v2 = v1 sur la scène réelle ${sc.id}`,async({browser})=>{
    test.skip(!disponible({...sc,photo:sc.photo}),'dépôt privé Ar_city-photos absent');
    test.setTimeout(1500000);
    const v1=await ouvrirSceneReelle(browser,{...sc,heureReelle:true},{reglages:REGLAGES}), {app,page,cap0}=v1;
    await app.waitFor('!monBusy&&!towerBusy&&!telecomBusy&&!buildingsBusy',120000);
    await app.ev('for(const c of cities.concat(farPeaks,monumentSites)){ c.demT=0; c._skyT=0; } for(const b of buildingSites) b._gT=0; applyOcclusion(false); _ridgesAt=0; _skyDistAt=0; true');
    const v2=await ouvrirV2Reelle(browser,sc,v1,{reglages:REGLAGES,nuit:false}), p2=v2.page;
    await app.frame(); await p2.evaluate(()=>{ for(let i=0;i<3;i++) window.__vh2.rendreImage(); });

    // 1. repères fiables
    const camRef=await app.ev('S.camFov'), refV2=await p2.evaluate(()=>({h:window.__vh2.S.headOff,c:window.__vh2.S.camFov}));
    expect(refV2.h,'cap de départ identique').toBeCloseTo(cap0,6); expect(refV2.c,'champ de départ identique').toBeCloseTo(camRef,6);
    const l1=await app.ev(`landmarksForCal({cols:[],heading:${cap0},pitch:0,fh:(W/2)/Math.tan(vFov()/2*D)}).map(o=>[o.c.name,o.aTop,o.c.dist])`);
    const l2=await p2.evaluate(async(cap)=>{ const m=await import('/src/calage/reperes.js'), v=window.__vh2, fh=(innerWidth/2)/Math.tan(window.__vh2.vFov()/2*Math.PI/180);
      const d=v.app.donnees(); return m.reperesPourCalage({cols:[],heading:cap,pitch:0,fh},m.monumentsPourCalage({monuments:d.monuments,elements:v.bilan().monuments,pos:d.pos,terrain:d.terrain}),{largeurPx:innerWidth},{avecRelief:v.S.relief&&!!v.app.donnees().terrain,correctionOeilM:v.S.obsHeight||0}).map(o=>[o.c.name,o.aTop,o.c.dist]); },cap0);
    console.log(sc.id,'repères fiables v1',l1.length,'v2',l2.length,JSON.stringify(l1.map(x=>x[0])));
    expect(l2.map(x=>x[0]),'repères fiables : mêmes noms').toEqual(l1.map(x=>x[0]));
    l1.forEach((x,i)=>expect(Math.abs(l2[i][1]-x[1]),`repère ${x[0]} : angle du sommet`).toBeLessThan(1e-9));

    // 2. départs
    const resume=[], diffPerm=[], diffOrdre=[];
    for(const [dh,dc] of DEPARTS){
      const h0=(cap0+dh+360)%360, c0=Math.max(20,Math.min(110,camRef+dc));
      await app.ev(`S.headOff=${h0}; S.pitchOff=0; S.camFov=${c0}; $('fov').value=S.camFov; citiesVer++; true`);
      const m1=await app.ev('runAutoAlign()'), f1=await app.ev('({h:S.headOff,p:S.pitchOff,c:S.camFov})');
      await p2.evaluate(({h0,c0})=>{ const v=window.__vh2; v.S.headOff=h0; v.S.pitchOff=0; v.S.camFov=c0; for(let i=0;i<2;i++) v.rendreImage(); },{h0,c0});
      const r=await p2.evaluate(()=>window.__vh2.evaluerAuto({permutation:false,ordre:'soleil-relief'}));
      const f2={h:h0+(r.applique?r.dh:0),p:r.applique?r.dp:0,c:r.applique&&r.champ!==null?r.champ:c0};
      const tag=`départ cap ${dh>=0?'+':''}${dh} champ ${dc>=0?'+':''}${dc}`;
      resume.push(`${tag} → ${m1.slice(0,90)}`);
      expect(r.message,`${tag} : message`).toBe(m1);
      // avec le test de permutation (défaut de la v2) : identique à la v1, ou un refus de concordance fortuite — jamais un calage de plus
      const rp=await p2.evaluate(()=>window.__vh2.evaluerAuto({permutation:true,ordre:'soleil-relief'}));
      if(rp.message!==m1){ diffPerm.push(`${tag} : v1 « ${m1.slice(0,70)} » → v2 « ${rp.message.slice(0,70)} »`); expect(rp.applique&&!r.applique,`${tag} : le test de permutation ne doit pas ajouter de calage`).toBe(false); }
      const ro=await p2.evaluate(()=>window.__vh2.evaluerAuto({ordre:'relief-soleil'}));  // permutation + relief d'abord (réglage « Caler auto : le relief avant le soleil »)
      if(ro.message!==rp.message) diffOrdre.push(`${tag} : v1 « ${rp.message.slice(0,60)} » → relief d'abord « ${ro.message.slice(0,70)} » (${ro.source})`);
      expect(Math.abs(((f2.h-f1.h+540)%360)-180),`${tag} : cap`).toBeLessThan(1e-6); expect(Math.abs(f2.p-f1.p),`${tag} : horizon`).toBeLessThan(1e-6); expect(Math.abs(f2.c-f1.c),`${tag} : champ`).toBeLessThan(1e-6);
    }
    console.log(sc.id+'\n  '+resume.join('\n  ')+(diffPerm.length?'\n  AVEC PERMUTATION, différences avec la v1 :\n  '+diffPerm.join('\n  '):'\n  avec permutation : aucune différence avec la v1')+(diffOrdre.length?'\n  RELIEF D\'ABORD, différences :\n  '+diffOrdre.join('\n  '):'\n  relief d\'abord : aucune différence'));
    expect(v2.erreurs).toEqual([]);
    await v2.ctx.close(); await v1.ctx.close();
  });
}
