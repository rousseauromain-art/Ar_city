// Correctif du §5 de docs/REFONTE-V3.md (bug de la v1) : téléphone tenu de côté, écran resté en portrait (roulis simulé de −70°). La scène est dessinée tournée ;
// le GLISSER doit suivre les axes de la scène (le cap bouge quand on glisse le long de l'horizon, pas l'horizon) et le TOUCHER des noms (hitBest) doit trouver
// ce qui est dessiné sous le doigt. Reproduit d'abord avec la v1, puis vérifié sur la v3. À roulis nul, rien ne change (tests « tout éteint = v1 »).
const {test,expect}=require('@playwright/test');
const {ouvrir,capteurs}=require('./aide/v3');
const {ouvrirSceneReelle,ignorerSiAbsent}=require('../../tests/commun/scenes-reelles.js');
const POS={lat:48.6493,lon:-2.0257}, ROULIS=-70, D=Math.PI/180;

for(const version of ['v1','v3']) test(`${version} : glisser de 200 px le long de l'horizon tourné de ${ROULIS}°`,async({page})=>{
  const app=await ouvrir(page,{version,pos:POS,greffes:[]});
  await capteurs(app,{cap:30,roulis:ROULIS});
  const P=await app.ev('pose()'); expect(P.roll).toBeCloseTo(ROULIS,1);
  const fh=await app.ev('(W/2)/Math.tan(vFov()/2*D)'), v=page.viewportSize(), r=P.roll*D, L=200;
  // direction de l'horizon à l'écran : l'axe x de la scène, tourné de `roll` par le rendu (ctx.rotate(roll))
  const x0=v.width/2, y0=v.height/2, x1=x0+L*Math.cos(r), y1=y0+L*Math.sin(r);
  const h0=await app.ev('S.headOff'), p0=await app.ev('S.pitchOff');
  await page.mouse.move(x0,y0); await page.mouse.down(); await page.mouse.move(x1,y1,{steps:12}); await page.mouse.up();
  const dh=(await app.ev('S.headOff'))-h0, dp=(await app.ev('S.pitchOff'))-p0, attendu=-Math.atan(L/fh)/D;
  console.log(version,`cap ${dh.toFixed(2)}° (attendu ${attendu.toFixed(2)}°), horizon ${dp.toFixed(2)}° (attendu 0)`);
  if(version==='v1'){ expect(Math.abs(dp),'v1 : le glisser déplace l’horizon (le bug)').toBeGreaterThan(5); }
  else { expect(dh).toBeCloseTo(attendu,1); expect(Math.abs(dp)).toBeLessThan(0.05); }
  expect(app.errors).toEqual([]);
});

test('v3 : à roulis nul, le glisser est celui de la v1 au bit près',async({browser})=>{
  const res=[];
  for(const version of ['v1','v3']){ const page=await browser.newPage(); const app=await ouvrir(page,{version,pos:POS,greffes:[]}); await capteurs(app,{cap:30,roulis:0});
    await page.mouse.move(150,400); await page.mouse.down(); await page.mouse.move(260,330,{steps:7}); await page.mouse.up(); res.push(await app.ev('[S.headOff,S.pitchOff]')); await page.close(); }
  expect(res[1]).toEqual(res[0]);
});

const SC={id:'paris-grenelle-nuit',pos:{lat:48.8494956,lon:2.2865298},capDeg:28,radius:180,heure:'2026-10-27T19:30:00Z',ecran:{width:412,height:915}};
for(const version of ['v1','v3']) test(`${version} : toucher un monument dessiné avec un roulis de ${ROULIS}° ouvre sa fiche (scène réelle de Grenelle)`,async({browser})=>{
  ignorerSiAbsent(test,SC); test.setTimeout(600000);
  const o=await ouvrirSceneReelle(browser,SC,{reglages:{relief:true,telecom:false,buildings:false,sea:false,air:false,photoVis:false},url:`/${version}/villes-horizon.html`,greffes:version==='v3'?[]:undefined});
  const {app,page}=o;
  await capteurs(app,{cap:28,roulis:ROULIS}); await app.ev('S.headOff=0; citiesVer++; true'); await app.frame(); await app.frame();
  const zones=await app.ev('monHits.filter(h=>h.icon).map(h=>({roll:h.roll,c:[(h.icon[0]+h.icon[1])/2,(h.icon[2]+h.icon[3])/2],nom:monName(h.t)}))');
  expect(zones.length).toBeGreaterThan(2);
  const v=page.viewportSize(); let essais=0, ok=0;
  for(const z of zones){
    expect(z.roll).toBeCloseTo(ROULIS,1);
    // point de la scène → écran : rotation de `roll` autour du centre (comme ctx.rotate(roll) du rendu)
    const r=z.roll*D, dx=z.c[0]-v.width/2, dy=z.c[1]-v.height/2, x=v.width/2+dx*Math.cos(r)-dy*Math.sin(r), y=v.height/2+dx*Math.sin(r)+dy*Math.cos(r);
    if(!(x>20&&x<v.width-80&&y>60&&y<v.height-120)) continue; // hors de l'écran ou sous les boutons
    await app.ev("$('dbg').classList.remove('open'); $('dbgTitle').textContent=''; true");
    await page.mouse.click(x,y); essais++;
    if(await app.ev("$('dbg').classList.contains('open')")) ok++;
    if(essais>=5) break;
  }
  console.log(version,`fiches ouvertes ${ok}/${essais}`);
  expect(essais).toBeGreaterThan(0); expect(ok).toBe(essais);
  expect(o.erreurs).toEqual([]); await o.ctx.close();
});
