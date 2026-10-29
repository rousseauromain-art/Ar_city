// Parité des DONNÉES du trafic en direct v2 avec la v1 : la v1 appelle réellement pollAir et pollSea avec des réponses synthétiques du relais (aucune donnée réelle) ;
// la v2 reçoit les mêmes réponses par un faux réseau et doit reconstituer les mêmes listes, les mêmes messages, la même pause de quota, la même mémoire en direct
// (écrite par l'une, relue par l'autre) et la même liste de mobiles proches à plusieurs instants (extrapolation, expiration des navires, plafond de 60).
const {test,expect}=require('@playwright/test');
const {openApp,offset}=require('../helpers/app');

const POS={lat:48.6440,lon:-2.0230};
const T0=new Date('2026-10-26T14:00:00Z');
let seed=11; const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
// vecteurs d'état OpenSky : [icao24, indicatif, pays, t_pos, t_contact, lon, lat, alt baro, au sol, vitesse, cap, vitesse verticale, capteurs, alt géo]
const ETATS=Array.from({length:40},(_,i)=>{ const p=offset(POS,3+rnd()*60,rnd()*360); return [`ab${i}c`,i%5===0?'  ':`AF${1000+i} `,'France',0,0,p.lon,p.lat,1000+rnd()*9000,false,120+rnd()*150,rnd()*360,(rnd()-0.5)*10,null,i%3?3000+rnd()*8000:null]; });
ETATS.push(['sol01','SOL','France',0,0,POS.lon,POS.lat,0,true,0,0,0,null,null],['sans02','SANS','France',0,0,null,48.7,100,false,100,10,0,null,null]);
// navires : une centaine, certains à quai, certains sans type, un sans nom
const NAVIRES=Array.from({length:90},(_,i)=>{ const p=offset(POS,0.3+rnd()*35,rnd()*360), arret=i%3===0; return {mmsi:227000000+i,name:i===7?'':'NAVIRE '+i,lat:p.lat,lon:p.lon,cog:rnd()*360,sog:arret?0:3+rnd()*12,type:i%4===0?null:[30,36,37,52,60,70,80,41][i%8],t:T0.getTime()-i*20000}; });
const SETTINGS={air:true,sea:true,airMax:120,seaMax:40};

/** Lecture des états de la v1 après ses requêtes. */
const LIRE_V1=`({planes:planes.map(p=>({...p})), ships:[...ships].map(([id,v])=>[id,{...v}]), msg:{...tMsg}, pause:airPauseUntil})`;

async function v2Sources(page,{etats,navires,statutAir=200,corpsAir,corpsMer,statutMer=200,enTete}){
  return page.evaluate(async({etats,navires,statutAir,corpsAir,corpsMer,statutMer,enTete,T0})=>{
    const ds=await import('/src/donnees/cache-donnees.js'), md=await import('/src/donnees/memoire-direct.js'), av=await import('/src/donnees/avions.js'), na=await import('/src/donnees/navires.js');
    const ev=s=>window.__vh.ev(s), pos=ev('pos'), S=ev('S'), relais=ev('CONFIG.relay'), maintenant=()=>Date.now();
    const cache=ds.creerCacheDonnees('vh-v2-vide'), memoire=md.creerMemoireDirect(cache); // mémoire vide : comme la v1 à son premier appel
    const repAir={ok:statutAir>=200&&statutAir<300,statut:statutAir,donnees:corpsAir||{states:etats},entetes:{get:k=>enTete&&enTete[k]||null}};
    const repMer={ok:statutMer>=200&&statutMer<300,statut:statutMer,donnees:corpsMer||{ships:navires,hub:{seconds:5,tracked:3},received:9}};
    const reseau={requeter:async(url)=>/planes/.test(url)?repAir:repMer};
    const a=await av.creerSourceAvions({reseau,memoire,relais,maintenant}).charger({pos,rayonKm:S.airMax,avions:[]});
    const n=await na.creerSourceNavires({reseau,memoire,relais,maintenant}).charger({pos,rayonKm:S.seaMax,navires:new Map()});
    return {a,n:{...n,navires:[...n.navires]}};
  },{etats,navires,statutAir,corpsAir,corpsMer,statutMer,enTete,T0:T0.getTime()});
}

test('trafic v2 = v1 : avions, navires, messages, mémoire en direct et mobiles proches à plusieurs instants',async({page})=>{
  const app=await openApp(page,{pos:POS,time:T0,settings:SETTINGS,fetch:[{match:'/planes\\?',body:{states:ETATS,auth:'jeton'}},{match:'/ships\\?',body:{ships:NAVIRES,hub:{seconds:5,tracked:3},received:9}}]});
  await app.waitFor('planes.length>0&&ships.size>0');
  await app.waitFor('tMsg.air&&tMsg.sea');
  const v1=await app.ev(LIRE_V1);
  expect(v1.planes.length,'avions de la v1').toBe(40); expect(v1.ships.size??v1.ships.length,'navires de la v1').toBe(90);
  const v2=await v2Sources(page,{etats:ETATS,navires:NAVIRES,corpsAir:{states:ETATS,auth:'jeton'}});
  expect(v2.a.avions,'avions').toEqual(v1.planes); expect(v2.n.navires,'navires').toEqual(v1.ships);
  expect(v2.a.message,'message avions').toBe(v1.msg.air); expect(v2.n.message,'message navires').toBe(v1.msg.sea);
  expect(v2.a.pauseJusqua).toBe(0); expect(v2.a.ok&&v2.n.ok).toBe(true);
  // mémoire en direct : écrite par la v1 (liveSave réel), relue par la v2
  const memoire=await page.evaluate(async()=>{ const ds=await import('/src/donnees/cache-donnees.js'), md=await import('/src/donnees/memoire-direct.js'), m=md.creerMemoireDirect(ds.creerCacheDonnees('vh-data-v1')), pos=window.__vh.ev('pos');
    const air=await m.restaurer('air',pos), mer=await m.restaurer('sea',pos); return {air:air&&air.d,mer:mer&&mer.d}; });
  expect(memoire.air,'situation des avions relue').toEqual(v1.planes); expect(memoire.mer,'situation des navires relue').toEqual(v1.ships);
  // ... et écrite par la v2, relue par la v1 (liveRestore réel)
  const inverse=await page.evaluate(async()=>{ const ds=await import('/src/donnees/cache-donnees.js'), md=await import('/src/donnees/memoire-direct.js'), m=md.creerMemoireDirect(ds.creerCacheDonnees('vh-data-v1')), pos=window.__vh.ev('pos');
    const data=[['x1',{name:'A',mmsi:'x1',type:60,lat:pos.lat,lon:pos.lon,trk:1,vel:2,alt:0,vr:0,t:Date.now()}]]; await m.sauver('sea',pos,data);
    return {data,relu:await window.__vh.ev('liveRestore("sea")')}; });
  expect(inverse.relu.d,'navire écrit par la v2').toEqual(expect.arrayContaining(inverse.data));
  // mobiles proches : à l'instant de la requête, 90 s plus tard (extrapolation), 20 min plus tard (navires en route périmés)
  await app.ev(`ships=new Map(${JSON.stringify(v1.ships)}); planes=${JSON.stringify(v1.planes)}; true`);
  for(const dt of [0,90000,20*60000,70*60000]){
    await page.clock.setFixedTime(new Date(T0.getTime()+dt));
    // un seul passage dans la page : la boucle de dessin de la v1 appelle aussi mobiles() et retirerait les navires périmés avant la lecture
    const {a,idsAvant,b}=await app.ev(`(()=>{ ships=new Map(${JSON.stringify(v1.ships)}); const idsAvant=[...ships.keys()]; _mobCacheAt=0; const a=mobiles(); return {a,idsAvant,b:[...ships.keys()]}; })()`);
    const v2m=await page.evaluate(({avions,navires,dt,T0,S})=>import('/src/donnees/trafic.js').then(t=>t.listerMobiles({pos:window.__vh.ev('pos'),avions,navires:new Map(navires),reglages:{air:true,sea:true,airMaxKm:S.airMax,seaMaxKm:S.seaMax},maintenantMs:T0+dt})),
      {avions:v1.planes,navires:v1.ships,dt,T0:T0.getTime(),S:SETTINGS});
    expect(v2m.mobiles.length,`+${dt/1000}s : nombre de mobiles`).toBeLessThanOrEqual(60);
    expect(JSON.parse(JSON.stringify(v2m.mobiles)),`+${dt/1000}s : mobiles proches`).toEqual(a);
    expect(idsAvant.filter(id=>!b.includes(id)).sort(),`+${dt/1000}s : navires périmés retirés`).toEqual(v2m.expires.slice().sort());
  }
  expect(app.errors).toEqual([]);
});

test('trafic v2 = v1 : quota OpenSky (429), flux AIS muet, panne du relais',async({browser})=>{
  const cas=[
    {nom:'429 avec attente',air:{status:429,body:{retryAfter:120}},mer:{body:{ships:[],confirmed:false,received:0,undecoded:0,listenMs:10000}},opt:{statutAir:429,corpsAir:{retryAfter:120},corpsMer:{ships:[],confirmed:false,received:0,undecoded:0,listenMs:10000}}},
    {nom:'429 sans attente (600 s)',air:{status:429,body:{}},mer:{status:500,body:{error:'boom'}},opt:{statutAir:429,corpsAir:{},statutMer:500,corpsMer:{error:'boom'}}},
    {nom:'429 attente trop courte (60 s minimum)',air:{status:429,body:{retryAfter:5}},mer:{body:{ships:NAVIRES.slice(0,3),hub:{seconds:1,tracked:1}}},opt:{statutAir:429,corpsAir:{retryAfter:5},corpsMer:{ships:NAVIRES.slice(0,3),hub:{seconds:1,tracked:1}}}},
  ];
  for(const c of cas){
    const ctx=await browser.newContext({viewport:{width:915,height:412},hasTouch:true,locale:'fr-FR',timezoneId:'Europe/Paris',baseURL:`http://127.0.0.1:${+(process.env.PORT||4173)}`}), page=await ctx.newPage();
    const app=await openApp(page,{pos:POS,time:T0,settings:SETTINGS,fetch:[{match:'/planes\\?',status:c.air.status,body:c.air.body},{match:'/ships\\?',status:c.mer.status,body:c.mer.body}]});
    await app.waitFor('tMsg.air&&tMsg.sea');
    const v1=await app.ev(LIRE_V1);
    const v2=await v2Sources(page,c.opt);
    const tag=c.nom;
    expect(v2.a.message,`${tag} : message avions`).toBe(v1.msg.air); expect(v2.n.message,`${tag} : message navires`).toBe(v1.msg.sea);
    expect(v2.a.pauseJusqua,`${tag} : pause de quota`).toBe(v1.pause); expect(v2.a.avions,`${tag} : avions`).toEqual(v1.planes);
    expect(v2.n.navires,`${tag} : navires`).toEqual(v1.ships);
    expect(app.errors).toEqual([]);
    await ctx.close();
  }
});
