// d) port dense (village du Rhum, 25/10/2026) : les bateaux les plus proches sont nommes, les autres regroupes en pastilles « +N »,
// jamais de « +1 », aucun nom sous les boutons du bas, aucun chevauchement.
const {test,expect}=require('@playwright/test');
const {openApp,offset}=require('../helpers/app');
const {overlaps,textsOver}=require('../helpers/labels');

const POS={lat:48.6440,lon:-2.0230}; // quai, vue vers le large
const HEAD=330;
const NAMES=['ACTUAL LEADER','SPIRIT OF UKRAINE','BANQUE POPULAIRE','MACIF','SODEBO ULTIM 3','GITANA 17','SVR LAZARTIGUE','PRB',
  'CHARAL','APIVIA','LINKEDOUT','INITIATIVES COEUR','FORTINET','TEAM WHITCHURCH','PAPREC ARKEA','CORUM L EPARGNE','BIOTHERM',
  'GROUPE APICIL','LAZARE','VOGUE AVEC UN CRAPAUD','ARVOR','BRITTANY FERRIES','CONDOR LIBERATION','EMERAUDE','VEDETTE CEZEMBRE',
  'ROCHEBONNE','LA CANCALAISE','NOTRE DAME DE ROCAMADOUR','ILE DE BREHAT','PETIT PRINCE','CORSAIRE','SURCOUF','DUGUAY TROUIN',
  'JACQUES CARTIER','GRAND LARGE','MER D EMERAUDE','BELLE ILE','MARIE GALANTE','POINTE A PITRE','ROUTE DU RHUM'];
// les 3 plus proches bien separes, puis une foule serree entre 0,6 et 2,5 km (generateur pseudo-aleatoire fixe)
let seed=7; const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
const SHIPS=NAMES.map((name,i)=>{ const near=i<3, km=near?0.3+i*0.05:0.6+rnd()*1.9, brg=near?HEAD-6+i*6:HEAD-8+rnd()*16, p=offset(POS,km,brg);
  return {mmsi:227000000+i,name,lat:p.lat,lon:p.lon,cog:0,sog:0,type:i%3?36:70}; });

test('port dense : plus proches nommes, autres en « +N », jamais « +1 », rien sous les boutons',async({page})=>{
  const app=await openApp(page,{pos:POS,settings:{sea:true,seaMax:40,headOff:HEAD},fetch:[{match:'/ships\\?',body:{ships:SHIPS,hub:true}}]});
  await app.waitFor('ships.size>='+SHIPS.length+'&&terrain&&!terrain.refining');
  const texts=await app.frame();
  const inView=await app.ev('mobiles().filter(m=>m.kind==="ship"&&Math.abs(wrap(m.brg-pose().heading))<vFov()/2-1).map(m=>({name:m.name,dist:m.dist}))');
  expect(inView.length).toBeGreaterThanOrEqual(35);
  const named=new Set(texts.filter(t=>NAMES.includes(t.text)).map(t=>t.text));
  const badges=texts.filter(t=>/^\+\d+$/.test(t.text)).map(t=>+t.text.slice(1));
  // les plus proches sont nommes
  const byDist=inView.slice().sort((a,b)=>a.dist-b.dist);
  for(const s of byDist.slice(0,3)) expect(named.has(s.name),`${s.name} (${s.dist.toFixed(2)} km) devrait etre nomme`).toBe(true);
  expect(named.size).toBeGreaterThanOrEqual(5);
  const mean=a=>a.reduce((s,x)=>s+x.dist,0)/a.length;
  const unnamed=inView.filter(s=>!named.has(s.name));
  expect(unnamed.length).toBeGreaterThan(0);
  expect(mean(inView.filter(s=>named.has(s.name)))).toBeLessThan(mean(unnamed));
  // les autres en pastilles « +N », jamais « +1 »
  expect(badges.length).toBeGreaterThan(0);
  expect(badges.filter(n=>n<2)).toEqual([]);
  expect(named.size+badges.reduce((a,b)=>a+b,0)).toBeLessThanOrEqual(inView.length);
  // aucun chevauchement, aucun nom sous les boutons du bas
  expect(overlaps(texts)).toEqual([]);
  const bar=await page.$$eval('#bar button',bs=>bs.map(b=>b.getBoundingClientRect().toJSON()).filter(r=>r.width>0));
  expect(bar.length).toBeGreaterThanOrEqual(3);
  expect(textsOver(texts,bar).map(t=>t.text)).toEqual([]);
  expect(app.errors).toEqual([]);
});
