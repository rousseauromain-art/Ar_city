// Greffe « lune » sur deux PHOTOS RÉELLES de nuit (dépôt privé Ar_city-photos) : Bretagne 27/08/2026 (lune près de l'axe) et Ibiza 21/09/2026 (mode nuit, ultra grand angle,
// direction EXIF fausse d'environ 18°). Photo rejouée dans la v3 (Réglages › Rejouer une photo), « Caler auto » : la greffe allumée cale sur la lune, comme la v2 ;
// éteinte, la v1 ne le peut pas. Mêmes attentes que v2/tests/e2e/photo-lune-reelle.spec.js. Ignoré sans le dépôt privé.
const {test,expect}=require('@playwright/test');
const {ouvrirSceneReelle,ignorerSiAbsent}=require('../../tests/commun/scenes-reelles.js');
const PHOTOS=[
  {id:'bretagne-lune',photo:'PXL_20260827_205518778.jpg',radius:30,heureReelle:true,dhMin:-1.5,dhMax:1.5},
  {id:'ibiza-lune-nuit',photo:'PXL_20260921_212422656.NIGHT.jpg',radius:30,heureReelle:true,dhMin:14,dhMax:22},
];
for(const sc of PHOTOS) test(`lune : « Caler auto » de nuit sur la photo réelle ${sc.id} (allumée : calé sur la lune ; éteinte : non)`,async({browser})=>{
  ignorerSiAbsent(test,sc); test.setTimeout(900000);
  for(const greffes of [['lune'],[]]){
    const o=await ouvrirSceneReelle(browser,sc,{reglages:{relief:true,photoVis:false},url:'/v3/villes-horizon.html',greffes});
    const h0=await o.app.ev('S.headOff'), msg=await o.app.ev('runAutoAlign0()'), dh=((await o.app.ev('S.headOff'))-h0+540)%360-180;
    console.log(sc.id,greffes.join(',')||'éteinte',msg,`cap ${dh.toFixed(1)}°`);
    if(greffes.length){ expect(msg).toMatch(/^calé sur la lune/); expect(dh).toBeGreaterThan(sc.dhMin); expect(dh).toBeLessThan(sc.dhMax);
      const t=(await o.app.frame()).map(x=>x.text).join(' | '); expect(t).toMatch(/lune \d+\.\d°/); }
    else expect(msg).not.toMatch(/lune/);
    expect(o.erreurs).toEqual([]); await o.ctx.close();
  }
});
