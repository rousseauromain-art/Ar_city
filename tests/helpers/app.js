// Ouverture de l'application dans un etat maitrise : horloge figee, position GPS, reglages, relief / Overpass / reseau simules.
// Aucun acces reseau reel : fetch est remplace avant le chargement de la page, et tout ce qui sortirait encore (polices Google,
// scripts externes) est coupe par page.route et note dans app.blocked.
const NIGHT=new Date('2026-10-26T23:30:00Z'); // soleil couche a Saint-Malo : pas de symbole du soleil dans les captures

function initScript(cfg){
  window.__VH_TEST=cfg.test;
  try{ localStorage.setItem('vh_settings_v2',JSON.stringify(cfg.settings)); }catch(e){}
  const realFetch=window.fetch.bind(window);
  window.__VH_NET=[];
  window.fetch=async(input,init)=>{
    const url=typeof input==='string'?input:(input&&input.url)||String(input), u=new URL(url,location.href);
    if(u.origin===location.origin) return realFetch(input,init);
    window.__VH_NET.push(u.href);
    for(const r of (cfg.test.fetch||[])) if(new RegExp(r.match).test(u.href))
      return new Response(JSON.stringify(r.body),{status:r.status||200,headers:{'Content-Type':'application/json'}});
    return new Response('{"error":"hors ligne (test)"}',{status:503,headers:{'Content-Type':'application/json'}});
  };
}

// opts : pos {lat,lon}, settings (fusionnes aux reglages par defaut des tests), terrain, places (elements Overpass),
//        fetch [{match (regexp), body, status}], beforeStart (expression evaluee dans le script avant "Ouvrir la camera"), start
async function openApp(page,opts={}){
  const app={errors:[],blocked:[]};
  page.on('pageerror',e=>app.errors.push(String(e&&e.stack||e)));
  await page.route(/^(?!http:\/\/(127\.0\.0\.1|localhost)[:/])/,r=>{ app.blocked.push(r.request().url()); return r.abort(); });
  await page.clock.setFixedTime(opts.time||NIGHT);
  const settings={relief:true,sea:false,air:false,telecom:false,buildings:false,headOff:0,pitchOff:0,photoVis:false,...(opts.settings||{})};
  await page.addInitScript(initScript,{settings,test:{terrain:opts.terrain||{},overpass:{places:opts.places||[]},fetch:opts.fetch||[]}});
  if(opts.pos){
    await page.context().grantPermissions(['geolocation']);
    await page.context().setGeolocation({latitude:opts.pos.lat,longitude:opts.pos.lon,accuracy:5});
  }
  await page.goto('/v1/villes-horizon.html');
  await page.waitForFunction(()=>!!window.__vh);
  app.ev=expr=>page.evaluate(s=>window.__vh.ev(s),expr);
  app.frame=()=>page.evaluate(()=>window.__vh.frame());
  app.waitFor=(expr,timeout=30000)=>page.waitForFunction(s=>{ try{ return !!window.__vh.ev(s); }catch(e){ return false; } },expr,{timeout});
  if(opts.beforeStart) await app.ev(opts.beforeStart);
  if(opts.start!==false){
    await page.click('#go');
    await page.waitForFunction(()=>document.getElementById('start').style.display==='none');
    if(opts.pos) await app.waitFor('pos');
  }
  return app;
}

// lieux Overpass (nodes place=...) a partir de [nom, distance km, cap °, type, population]
function placesAround(pos,list){
  return list.map(([name,km,brg,place,pop],i)=>{ const b=brg*Math.PI/180, lat=pos.lat+km*Math.cos(b)/111.32,
    lon=pos.lon+km*Math.sin(b)/(111.32*Math.cos(pos.lat*Math.PI/180));
    return {type:'node',id:1000+i,lat,lon,tags:{name,place:place||'town',population:String(pop||5000)}}; });
}
// point a km kilometres au cap brg
function offset(pos,km,brg){ const b=brg*Math.PI/180; return {lat:pos.lat+km*Math.cos(b)/111.32,lon:pos.lon+km*Math.sin(b)/(111.32*Math.cos(pos.lat*Math.PI/180))}; }

module.exports={openApp,placesAround,offset,NIGHT};
