// c) hauteur d'oeil sur un rempart (Saint-Malo, 25/10/2026) : la jetee ne doit pas cacher Dinard.
// Scene simulee : l'observateur est sur le rempart (12 m dans le relief fin, modele de terrain IGN) ; dans le modele 30 m
// (surface), ce point est en mer, comme sur le terrain. Une jetee de 9 m barre la vue a ~450 m, Dinard est a ~3 km, sur une cote a 15 m.
// Avant le correctif, le sol etait lu dans le modele 30 m (niveau de la mer) : oeil a 1,6 m, la jetee faisait l'horizon et cachait Dinard.
// Le test de controle remet ce comportement (fineGround neutralise) et verifie que le bug est bien reproduit par la scene.
const {test,expect}=require('@playwright/test');
const {openApp,offset}=require('../helpers/app');

const POS={lat:48.6497,lon:-2.0265};             // rempart
const DINARD={lat:48.6326,lon:-2.0617};          // ~3 km au sud-ouest (cap ~234°)
const BRG=234;
const JETEE=offset(POS,0.45,BRG), end=s=>{ const p=offset(JETEE,0.2,BRG+90*s); return [p.lat,p.lon]; }; // 400 m de long, en travers de la vue
const terrain={features:[
  {lat:POS.lat,lon:POS.lon,r:40,h:12,layer:'fine'},                                  // rempart : relief fin seulement
  {...offset(POS,0.4,90),r:280,h:6},                                                 // vieille ville, a l'est
  {from:end(-1),to:end(1),w:60,h:9},                                                 // jetee (60 m de large : plus que le pas du profil, 50 m)
  {lat:DINARD.lat,lon:DINARD.lon,r:700,h:15},                                        // cote de Dinard
]};
const places=[{type:'node',id:1,lat:DINARD.lat,lon:DINARD.lon,tags:{name:'Dinard',place:'town',population:'10000'}}];
const ready='terrain&&!terrain.refining&&reliefState==="ok"&&cities.some(c=>c.name==="Dinard"&&c.aP!=null)';

test('sur le rempart, l\'oeil est pris dans le relief fin et la jetee ne cache pas Dinard',async({page})=>{
  const app=await openApp(page,{pos:POS,terrain,places,settings:{headOff:BRG}});
  await app.waitFor(ready);
  expect(await app.ev('obsGround')).toBeCloseTo(12,0);
  expect(await app.ev('terrain.h0')).toBeCloseTo(13.6,0);
  const d=await app.ev('(({hidden,dist,aP,mask})=>({hidden,dist,aP,mask}))(cities.find(c=>c.name==="Dinard"))');
  expect(d.dist).toBeGreaterThan(2.5);
  expect(d.hidden).toBe(false);
  // et le nom est bien dessine, net
  const texts=await app.frame();
  const t=texts.find(x=>x.text==='Dinard');
  expect(t).toBeTruthy();
  expect(t.alpha).toBe(1);
  expect(app.errors).toEqual([]);
});

test('controle : sans relecture du sol dans le relief fin (version d\'avant), la jetee cache Dinard',async({page})=>{
  const app=await openApp(page,{pos:POS,terrain,places,settings:{headOff:BRG},beforeStart:'fineGround=()=>NaN'});
  await app.waitFor(ready);
  expect(await app.ev('terrain.h0')).toBeLessThan(2);
  expect(await app.ev('cities.find(c=>c.name==="Dinard").hidden')).toBe(true);
});
