// Vitesse du placement des noms (plan du 16/11, lot R4) : images par seconde en « Tout voir », processeur ralenti 4 fois, photo des gorges en paysage.
// Lancé à la demande (PERF=1) : un seuil absolu dépend de la machine ; on compare donc à la v1 sur la même machine, dans la même exécution.
const {test,expect}=require('@playwright/test');
const {ouvrirSceneReelle,ignorerSiAbsent}=require('../../tests/commun/scenes-reelles');
const {GREFFES_CONTEXTE}=require('../../tests/commun/planche');

async function ips(browser,sc,greffes,reglages){
  const o=await ouvrirSceneReelle(browser,sc,{url:'/v3/villes-horizon.html',greffes,reglages});
  await o.app.ev('S.beyond=true; citiesVer++; true'); await o.page.waitForTimeout(1500);
  const cdp=await o.ctx.newCDPSession(o.page); await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  const v=await o.page.evaluate(()=>new Promise(res=>{ let n=0; const t0=performance.now(); const f=()=>{ n++; if(performance.now()-t0<4000) requestAnimationFrame(f); else res(n/((performance.now()-t0)/1000)); }; requestAnimationFrame(f); }));
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:1}); await o.ctx.close(); return v;
}

test('vitesse : « Tout voir » au processeur ralenti 4 fois — la greffe placement rend la vitesse de la v1 (les greffes du 15/11 la faisaient chuter)',async({browser})=>{
  test.skip(process.env.PERF!=='1','mesure à la demande : PERF=1');
  test.setTimeout(600000);
  const m=await import('../../tests/commun/caracterisation/pont-en-royans.mjs');
  const sc={...m.SCENES_PONT.find(s=>s.id==='pont-photo-gorges'),ecran:{width:809,height:331}}; ignorerSiAbsent(test,sc);
  const R=[...GREFFES_CONTEXTE,'visibilite','calques','toucher'];
  const v1=await ips(browser,sc,[],m.REGLAGES_TEL), sans=await ips(browser,sc,R,m.REGLAGES_TEL), avec=await ips(browser,sc,[...R,'placement'],m.REGLAGES_TEL);
  console.log(`ips (Tout voir, ×4) · v1 ${v1.toFixed(1)} · greffes du 15/11 + R1–R3 ${sans.toFixed(1)} · + placement ${avec.toFixed(1)}`);
  expect(avec).toBeGreaterThanOrEqual(0.9*v1);
});
