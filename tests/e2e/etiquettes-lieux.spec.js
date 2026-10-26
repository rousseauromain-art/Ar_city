// b) avec des lieux simules, les noms s'affichent sans se chevaucher (ni sous les boutons du bas)
const {test,expect}=require('@playwright/test');
const {openApp,placesAround}=require('../helpers/app');
const {overlaps,textsOver}=require('../helpers/labels');

const POS={lat:48.6493,lon:-2.0257};
// [nom, km, cap, type, population] : une vingtaine de lieux serres dans le champ (cap 90°), noms de longueurs variees
const PLACES=[
  ['Cancale',12,62,'town',5000],['Saint-Méloir-des-Ondes',9,70],['Saint-Coulomb',7,74],['La Gouesnière',13,78],
  ['Saint-Benoît-des-Ondes',15,82],['Hirel',18,86],['Vildé-la-Marine',20,88],['Le Vivier-sur-Mer',22,91],
  ['Cherrueix',26,94],['Dol-de-Bretagne',24,98,'town',5500],['Baguer-Pican',27,101],['Roz-Landrieux',23,104],
  ['Miniac-Morvan',19,108],['Châteauneuf-d’Ille-et-Vilaine',14,111],['Saint-Père-Marc-en-Poulet',10,114],
  ['Saint-Guinoux',16,117],['Lillemer',17,96],['Mont-Dol',21,99],['Pleine-Fougères',33,96],['Pontorson',38,100],
  ['Saint-Jouan-des-Guérets',5,118],['Paramé',3,80],
].map(([n,k,b,t,p])=>[n,k,b,t||'town',p||3000]);

test('lieux simules : noms nombreux, sans chevauchement',async({page})=>{
  const app=await openApp(page,{pos:POS,places:placesAround(POS,PLACES),settings:{headOff:90}});
  await app.waitFor('cities.some(c=>c.name==="Cancale")&&terrain&&!terrain.refining');
  const texts=await app.frame();
  const names=texts.filter(t=>PLACES.some(p=>p[0]===t.text));
  expect(names.length).toBeGreaterThanOrEqual(8); // le test n'est pas vide
  expect(overlaps(texts)).toEqual([]);
  const bar=await page.$$eval('#bar button',bs=>bs.map(b=>b.getBoundingClientRect().toJSON()).filter(r=>r.width>0));
  expect(textsOver(texts,bar).map(t=>t.text)).toEqual([]);
  // stabilite : l'image suivante (memoire de position lblMem) reste sans chevauchement
  expect(overlaps(await app.frame())).toEqual([]);
  expect(app.errors).toEqual([]);
});
