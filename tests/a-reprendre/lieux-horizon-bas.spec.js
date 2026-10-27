// Horizon haut dans l'image (appareil en paysage, tenu incliné vers le bas : ~7° de plus sous l'horizon) : très peu de place au-dessus des points
// pour les noms inclinés (écran de 412 px de haut, bandeau en haut).
// Avant : un lieu sans place pour son nom incliné disparaissait (les monuments avaient un repli à plat, pas les lieux) ;
// maintenant : repli à plat vers le haut, puis sous le point. Aucun nom ne doit en recouvrir un autre ni un bouton.
const {test,expect}=require('@playwright/test');
const {openApp,placesAround}=require('../helpers/app');
const {overlaps,textsOver}=require('../helpers/labels');

const POS={lat:38.99113,lon:1.5748};
// une grille de lieux dans le champ (cap 265° +/- 36°), à plusieurs distances
const LIEUX=[]; { let k=0; for(let b=229;b<=301;b+=3) for(const d of [1.2,3,6,11,19]) if((k++)%2===0) LIEUX.push([`Lieu ${b}-${d}`,d,b,'village',500]); }

test('horizon haut en paysage : plus de noms conservés (repli à plat), sans chevauchement ni bouton recouvert',async({page})=>{
  await page.setViewportSize({width:915,height:412}); // paysage
  const app=await openApp(page,{pos:POS,places:placesAround(POS,LIEUX),settings:{radius:30,headOff:265,pitchOff:-7}});
  await app.waitFor('cities.length>20&&terrain&&!terrain.refining');
  await app.frame(); await app.frame(); const texts=await app.frame(); // les premieres images sont celles d'avant le chargement
  const shown=texts.filter(t=>/^Lieu /.test(t.text));
  const st=await app.ev('placeStats');
  expect(st.eligible).toBeGreaterThan(50);
  expect(shown.length).toBeGreaterThanOrEqual(25);           // avant : 0 sur 57           // avant : 17 sur 63
  expect(overlaps(texts)).toEqual([]);
  const ui=await page.$$eval('#chips .chip,#tools button,#bar button',a=>a.map(e=>e.getBoundingClientRect().toJSON()).filter(r=>r.width>0));
  expect(textsOver(texts,ui).map(t=>t.text)).toEqual([]);
  expect(app.errors).toEqual([]);
});
