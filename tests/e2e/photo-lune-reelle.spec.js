// Calage de nuit sur la lune avec deux PHOTOS RÉELLES (dépôt privé Ar_city-photos) : Bretagne 27/08/2026 (lune près de l'axe) et Ibiza 21/09/2026 (mode nuit, ultra grand angle 110°, direction EXIF fausse d'environ 18°).
// « Caler auto » (soleil couché → lune) doit retrouver le disque, et après le calage le symbole de la lune doit tomber sur le disque brillant de l'image. Ignoré sans le dossier PHOTOS_DIR.
const {test,expect}=require('@playwright/test');
const fs=require('fs'), path=require('path');
const {PHOTOS_DIR}=require('../helpers/scenes-reelles.js');

test.use({viewport:{width:915,height:412}});
const PHOTOS=[
  {f:'PXL_20260827_205518778.jpg',nom:'Bretagne 27/08',dhMin:-1.5,dhMax:1.5},
  {f:'PXL_20260921_212422656.NIGHT.jpg',nom:'Ibiza 21/09 (mode nuit)',dhMin:14,dhMax:22},
];
for(const ph of PHOTOS) test(`« Caler auto » de nuit sur la lune : ${ph.nom}`,async({page})=>{
  test.skip(!fs.existsSync(path.join(PHOTOS_DIR,ph.f)),'photo absente (dépôt privé Ar_city-photos)');
  const erreurs=[]; page.on('pageerror',e=>erreurs.push(String(e)));
  await page.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort());
  await page.goto('/v2/photo.html');
  await page.setInputFiles('#photoFile',path.join(PHOTOS_DIR,ph.f));
  await page.waitForFunction(()=>window.__vh2&&window.__vh2.photo());
  const r=await page.evaluate(async()=>{
    const v=window.__vh2, avant=v.evaluerLune(), msg=await v.calerAuto();
    // le symbole de la lune, après calage, doit tomber sur le disque brillant : on lit la luminance de l'image à cet endroit (et dans un voisinage de 6 px)
    const {positionLune}=await import('/src/noyau/astro.js'), {lirePixelsRecadres}=await import('/src/vision/lire-pixels.js'), p=v.photo().photo, l=positionLune(p.utc,p.pos.lat,p.pos.lon);
    const W=innerWidth, H=innerHeight, RAD=Math.PI/180, fh=(W/2)/Math.tan(v.vFov()/2*RAD), po=v.pose();
    const x=W/2+fh*Math.tan(((l.azDeg-po.capDeg+540)%360-180)*RAD), y=H/2+fh*Math.tan((po.inclinaisonDeg-l.elDeg)*RAD);
    const px=lirePixelsRecadres(v.photo().img,480,{largeurPx:W,hauteurPx:H}), cx=Math.round(x*480/W), cy=Math.round(y*480/W); let mx=0;
    for(let dy=-4;dy<=4;dy++) for(let dx=-4;dx<=4;dx++){ const i=((cy+dy)*px.cw+(cx+dx))*4; if(i>=0&&i<px.d.length) mx=Math.max(mx,Math.min(px.d[i],px.d[i+1],px.d[i+2])); }
    return {avant:{ok:avant.ok,dh:avant.dh,dp:avant.dp},msg,eclat:mx,x,y};
  });
  console.log(ph.nom,JSON.stringify(r));
  expect(r.avant.ok,'disque lunaire trouvé').toBe(true); expect(r.avant.dh).toBeGreaterThan(ph.dhMin); expect(r.avant.dh).toBeLessThan(ph.dhMax);
  expect(r.msg).toMatch(/^calé sur la lune/); expect(r.eclat,'le symbole tombe sur le disque brillant').toBeGreaterThan(200);
  expect(erreurs).toEqual([]);
});
