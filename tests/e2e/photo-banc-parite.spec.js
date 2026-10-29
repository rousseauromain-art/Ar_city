// Parité avec la v1 du BANC D'ESSAI du calage (photoBench) sur des photos RÉELLES (dépôt privé Ar_city-photos), à l'heure RÉELLE de la prise de vue : même référence, même soleil,
// mêmes dix départs avec le même verdict et le même message, mêmes repères utilisables, mêmes monuments ignorés et mêmes raisons. Le texte entier du tableau (#dbgBody) est comparé.
// Critère de l'étape 10 : « banc d'essai au moins aussi bon que la v1 » = identique, scène par scène (les verdicts sont imprimés). Ignoré sans le dossier PHOTOS_DIR.
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
const REGLAGES={relief:true,skyline:false,hamlets:true,telecom:true,buildings:true,sea:false,air:false,photoVis:false,cross:false,
  layers:{places:true,monuments:true,equip:true,urban:false,urbClip:true,urbSmooth:true,urbFill:true},poi:{lighthouse:true,cape:true,rock:true,view:true,heritage:true,beach:true}};

for(const sc of SCENES){
  test(`banc d'essai v2 = v1 sur la scène réelle ${sc.id}`,async({browser})=>{
    test.skip(!disponible({...sc,photo:sc.photo}),'dépôt privé Ar_city-photos absent');
    test.setTimeout(1500000);
    const v1=await ouvrirSceneReelle(browser,{...sc,heureReelle:true},{reglages:REGLAGES}), {app}=v1;
    await app.waitFor('!monBusy&&!towerBusy&&!telecomBusy&&!buildingsBusy',120000);
    await app.ev('for(const c of cities.concat(farPeaks,monumentSites)){ c.demT=0; c._skyT=0; } for(const b of buildingSites) b._gT=0; applyOcclusion(false); _ridgesAt=0; _skyDistAt=0; true');
    const v2=await ouvrirV2Reelle(browser,sc,v1,{reglages:REGLAGES,nuit:false}), p2=v2.page;
    await app.frame(); await p2.evaluate(()=>{ for(let i=0;i<3;i++) window.__vh2.rendreImage(); });

    await app.ev('photoBench()');
    const t1=await app.ev(`document.getElementById('dbgBody').innerText`), r1=await app.ev(`[...document.querySelectorAll('#dbgBody table tr')].slice(1).map(tr=>[...tr.children].map(td=>td.innerText.replace(/\\s+/g,' ').trim()))`);
    await p2.evaluate(()=>window.__vh2.lancerBanc());
    const t2=await p2.evaluate(()=>document.getElementById('dbgBody').innerText), r2=await p2.evaluate(()=>[...document.querySelectorAll('#dbgBody table tr')].slice(1).map(tr=>[...tr.children].map(td=>td.innerText.replace(/\s+/g,' ').trim())));
    const resume=r1.map((l,i)=>`${l[0]} → ${l[2].split(' ')[0]}`);
    console.log(sc.id+'\n  '+resume.join('\n  '));
    expect(r2.length).toBe(10); expect(r2,'les dix lignes : départ, reste, verdict et message').toEqual(r1);
    expect(t2,'texte entier du banc d\'essai').toEqual(t1);
    expect(v2.erreurs).toEqual([]);
    await v2.ctx.close(); await v1.ctx.close();
  });
}
