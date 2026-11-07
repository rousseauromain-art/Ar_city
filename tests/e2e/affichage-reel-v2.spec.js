// Affichage de BOUT EN BOUT sur les scènes réelles sans photo (Paris Grenelle, Cesson) : la v1 et la v2 chargent CHACUNE leurs données (lieux, relief, monuments,
// pylônes, repères) depuis les mêmes caches rejoués, réseau coupé, même position, même cap, même écran. Les noms NETS doivent être les mêmes, en Essentiel et en Tout voir.
// Cesson (06/11) : « la v1 affiche net le château d'eau (Réservoir des Gallets, 1,8 km), la cathédrale, Les Horizons et les mâts ; la v2 les montrait transparents ».
const {test,expect}=require('@playwright/test');
const path=require('path');
const {ouvrirSceneReelle,ignorerSiAbsent}=require('../helpers/scenes-reelles.js');
const {seedCaches,readExports}=require('../helpers/cache.js');
const {reliefUrls}=require('../helpers/relief-urls.js');
const {fichiersExport}=require('../helpers/scene-v2-reelle.js');

const SCENES=[
  {id:'paris-grenelle-nuit',pos:{lat:48.8494956,lon:2.2865298},capDeg:28,radius:180,heure:'2026-10-27T19:30:00Z',ecran:{width:412,height:915}},
  {id:'cesson-gallets',pos:{lat:48.1358919,lon:-1.6233885},capDeg:237,radius:180,heure:'2026-11-06T10:20:00Z',ecran:{width:412,height:915},
    attendus:['Réservoir des Gallets','cathédrale Saint-Pierre de Rennes','Les Horizons','Mât TDF · Cesson-Sévigné (98 m)']},
];
const REGLAGES={relief:true,skyline:true,hamlets:true,telecom:true,buildings:true,sea:false,air:false,photoVis:false,cross:false,
  layers:{places:true,monuments:true,equip:true,urban:false,urbClip:true,urbSmooth:true,urbFill:true},poi:{lighthouse:true,cape:true,rock:true,view:true,heritage:true,beach:true}};

function reseauCoupe(){
  const reel=window.fetch.bind(window);
  window.fetch=async(input,init)=>{
    const url=typeof input==='string'?input:(input&&input.url)||String(input), u=new URL(url,location.href);
    if(u.origin===location.origin) return reel(input,init);
    if(/tiles\.mapterhorn\.com|elevation-tiles-prod/.test(u.href)) return new Response('',{status:404});
    if(u.href==='https://tiles.openfreemap.org/planet') return new Response(JSON.stringify({tiles:['https://tiles.openfreemap.org/planet/rejeu/{z}/{x}/{y}.pbf']}),{status:200,headers:{'Content-Type':'application/json'}});
    return new Response('{"error":"hors ligne (test)"}',{status:503,headers:{'Content-Type':'application/json'}});
  };
}

/**
 * v2 : page photo (même interface), position simulée au point de la scène, cap imposé ; mêmes caches sous les noms vh2-.
 * V2_DIRECT=1 : page EN DIRECT (GPS au point de la scène, boussole simulée vers le cap), le chemin du téléphone.
 */
async function ouvrirV2(browser,sc){
  const direct=process.env.V2_DIRECT==='1';
  const ctx=await browser.newContext({viewport:sc.ecran,deviceScaleFactor:2,hasTouch:true,locale:'fr-FR',timezoneId:'Europe/Paris',baseURL:`http://127.0.0.1:${+(process.env.PORT||4173)}`,
    ...(direct?{permissions:['geolocation','camera'],geolocation:{latitude:sc.pos.lat,longitude:sc.pos.lon,accuracy:8}}:{})});
  const page=await ctx.newPage(), erreurs=[]; page.on('pageerror',e=>erreurs.push(String(e)));
  await page.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort());
  await page.addInitScript(reseauCoupe);
  await page.addInitScript(s=>{ try{ if(!localStorage.getItem('vh2:reglages')) localStorage.setItem('vh2:reglages',JSON.stringify({v:1,d:s})); }catch(e){} },{...REGLAGES,lune:false,radius:sc.radius,headOff:direct?0:sc.capDeg,pitchOff:0,simOn:!direct,simPos:`${sc.pos.lat}, ${sc.pos.lon}`});
  await page.clock.install({time:new Date(sc.heure)}); await page.clock.resume();
  const url=process.env.V2_PAGE||'/v2/ar.html?mode=photo'; // V2_PAGE : une ancienne v2 extraite dans _old/<commit>/ (comparaison des versions)
  await page.goto(direct?url.replace(/photo\.html$|\?mode=photo$/,'').replace(/\/v2\/?$/,'/v2/ar.html').replace(/\/v2\/(?!ar\.html)$/,'/v2/ar.html'):url);
  const urls=reliefUrls(sc.pos).tout, exp=readExports(fichiersExport());
  await seedCaches(page,{entries:exp.entries.filter(e=>e.c==='dc'||urls.has(e.k))},{noms:{t:'vh2-terrain',dc:'vh2-donnees'}});
  await page.reload();
  if(direct){
    await page.click('#go');
    const alpha=(360-sc.capDeg)%360;
    await page.evaluate((alpha)=>{ const f=()=>window.dispatchEvent(new DeviceOrientationEvent('deviceorientationabsolute',{alpha,beta:90,gamma:0,absolute:true})); for(let i=0;i<200;i++) f(); setInterval(f,50); },alpha);
  } else await page.evaluate(()=>{ document.getElementById('start').style.display='none'; });
  let derniere='', stable=0; const t0=Date.now();
  while(Date.now()-t0<240000){
    const sig=await page.evaluate(()=>{ const a=window.__vh2.app, e=a.etat(), pret=/ok|indispo/.test(e.etatRelief)&&!e.chargementLieux&&!/en cours/.test(e.source); return [e.version,pret,a.occupe()].join('|'); });
    stable=sig===derniere&&sig.endsWith('|true|false')?stable+500:0; derniere=sig; if(stable>=4000) break; await new Promise(r=>setTimeout(r,500));
  }
  if(stable<4000) throw new Error('la v2 ne finit pas de charger : '+derniere);
  if(direct) console.log('v2 direct : cap',await page.evaluate(()=>window.__vh2.pose().capDeg.toFixed(1)),'· position',JSON.stringify(await page.evaluate(()=>window.__vh2.app.donnees().pos)));
  return {ctx,page,erreurs};
}

/** Noms nets (et transparents) de la liste d'affichage, v1. */
const NETS_V1=`(()=>{ const L=visibleCities(), rel=S.relief&&!!terrain; return {h0:terrain?terrain.h0:null,
  nets:L.filter(c=>!c.far&&!(rel&&c.hidden)).map(c=>c.name), transp:L.filter(c=>c.far||(rel&&c.hidden)).map(c=>c.name),
  detail:Object.fromEntries(L.map(c=>[c.name,{far:!!c.far,hidden:!!c.hidden,roof:!!c.roof,cap:!!c.cap,occBy:c.occBy||null,low:!!c.low,dist:+(+c.dist).toFixed(2),aP:c.aP??null,mask:c.mask??null,ht:c.ht??null}]))}; })()`;
const NETS_V2=()=>{ const v=window.__vh2; v.rendreImage(); const b=v.bilan(), d=v.app.donnees(), rel=v.S.relief&&!!d.terrain, L=b.liste;
  return {h0:d.terrain?d.terrain.h0:null, nets:L.filter(c=>!c.far&&!(rel&&c.hidden)).map(c=>c.name), transp:L.filter(c=>c.far||(rel&&c.hidden)).map(c=>c.name),
    detail:Object.fromEntries(L.map(c=>[c.name,{far:!!c.far,hidden:!!c.hidden,roof:!!c.roof,cap:!!c.cap,occBy:c.occBy||null,low:!!c.low,dist:+(+c.dist).toFixed(2),aP:c.aP??null,mask:c.mask??null,ht:c.ht??null}]))}; };

for(const sc of SCENES){
  test(`affichage v2 = v1 de bout en bout (noms nets) sur la scène réelle ${sc.id}`,async({browser})=>{
    ignorerSiAbsent(test,sc);
    test.setTimeout(900000);
    const v1=await ouvrirSceneReelle(browser,sc,{reglages:REGLAGES});
    await v1.app.waitFor('!monBusy&&!towerBusy&&!telecomBusy&&!buildingsBusy',120000);
    const v2=await ouvrirV2(browser,sc);
    for(const mode of ['essentiel','tout-voir']){
      await v1.app.ev(`setBeyond(${mode==='tout-voir'}); S.headOff=${sc.capDeg}; S.pitchOff=0; citiesVer++; true`);
      await v1.app.frame();
      await v2.page.evaluate(b=>{ window.__vh2.S.beyond=b; },mode==='tout-voir');
      const a=await v1.app.ev(NETS_V1), b=await v2.page.evaluate(NETS_V2);
      const s1=new Set(a.nets), s2=new Set(b.nets);
      const manquants=a.nets.filter(n=>!s2.has(n)), enTrop=b.nets.filter(n=>!s1.has(n));
      console.log(`${sc.id} ${mode} : œil v1 ${a.h0} m, v2 ${b.h0} m · nets v1 ${a.nets.length} v2 ${b.nets.length} · transparents v1 ${a.transp.length} v2 ${b.transp.length}`);
      if(manquants.length||enTrop.length) console.log(JSON.stringify({manquants:manquants.slice(0,30).map(n=>({n,v1:a.detail[n],v2:b.detail[n]})),enTrop:enTrop.slice(0,30).map(n=>({n,v1:a.detail[n],v2:b.detail[n]}))},null,0).slice(0,8000));
      if(process.env.DETAIL) console.log('DETAIL',JSON.stringify(Object.fromEntries(Object.entries(a.detail).filter(([k])=>/Gallets|Cath|Horizons|Mât|mât|Tour|TDF|Pierre/.test(k)).map(([k,v])=>[k,{v1:v,v2:b.detail[k]}]))).slice(0,6000), 'NETS', JSON.stringify(a.nets));
      for(const n of sc.attendus||[]) expect(s1.has(n)&&s2.has(n),`${n} doit être net dans la v1 et dans la v2 (${mode})`).toBe(true);
      expect(manquants,`${mode} : noms nets de la v1 absents de la v2`).toEqual([]);
      expect(enTrop,`${mode} : noms nets de la v2 absents de la v1`).toEqual([]);
    }
    expect(v2.erreurs).toEqual([]);
    await v2.ctx.close(); await v1.ctx.close();
  });
}

test('« Caler » à Cesson : la v2 ne met pas plus de temps que la v1 (même scène, en direct)',async({browser})=>{
  const sc=SCENES.find(s=>s.id==='cesson-gallets');
  ignorerSiAbsent(test,sc);
  test.setTimeout(900000);
  const v1=await ouvrirSceneReelle(browser,sc,{reglages:REGLAGES});
  await v1.app.waitFor('!monBusy&&!towerBusy&&!telecomBusy&&!buildingsBusy',120000);
  process.env.V2_DIRECT='1'; const v2=await ouvrirV2(browser,sc); delete process.env.V2_DIRECT;
  const mediane=a=>a.slice().sort((x,y)=>x-y)[Math.floor(a.length/2)];
  const d1=[], d2=[], m1=[], m2=[];
  for(let i=0;i<5;i++){
    const r1=await v1.app.ev(`(async()=>{ S.headOff=0; S.pitchOff=0; const t=performance.now(); const m=await runAutoAlign(); return {ms:performance.now()-t,m}; })()`);
    const r2=await v2.page.evaluate(async()=>{ const v=window.__vh2; v.S.headOff=0; v.S.pitchOff=0; const t=performance.now(); const m=await v.calerAuto(); return {ms:performance.now()-t,m}; });
    d1.push(r1.ms); d2.push(r2.ms); m1.push(r1.m); m2.push(r2.m);
  }
  console.log('Caler à Cesson : v1',Math.round(mediane(d1)),'ms («',m1[0],'») · v2',Math.round(mediane(d2)),'ms («',m2[0],'»)');
  expect(mediane(d2),'durée médiane de « Caler » (ms)').toBeLessThanOrEqual(mediane(d1)*1.05+20);
  await v2.ctx.close(); await v1.ctx.close();
});
