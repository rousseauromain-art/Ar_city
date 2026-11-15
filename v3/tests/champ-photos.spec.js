// Lot 12, étape 1 (plan du 15/11) : champ réel des photos du Pixel 9 mesuré sur le relief de Pont-en-Royans (14/11), « Caler auto » champ libre.
// Les deux photos du 14/11 à 16:01 (…150133093 à 24 mm, …150138972 à 12 mm) sont du même endroit, à 5 s d'écart. Ignoré sans le dépôt privé.
const {test,expect}=require('@playwright/test');
const {ouvrirSceneReelle,ignorerSiAbsent}=require('../../tests/commun/scenes-reelles');
const V3='/v3/villes-horizon.html';
const charger=()=>import('../../tests/commun/caracterisation/pont-en-royans.mjs');
const caler=async(o)=>{ await o.app.ev('window.__fini=0; autoAlign().then(()=>{window.__fini=1}); true'); await o.page.waitForFunction(()=>window.__fini,null,{timeout:300000});
  return {...(await o.app.ev('({h:S.headOff,p:S.pitchOff,f:S.camFov})')),note:await o.page.evaluate(()=>document.getElementById('note').textContent)}; };

test('Pont-en-Royans, 12 mm : le relief fixe le champ à ≈ 101° (nominal 110,5°), soit une focale ×1,19 ; le 24 mm de la même vue ne se cale pas sur le relief',async({browser})=>{
  test.setTimeout(600000);
  const m=await charger(), sc12=m.SCENES_PONT.find(s=>s.id==='pont-photo-12mm'), sc24=m.SCENES_PONT.find(s=>s.id==='pont-photo-24mm'); ignorerSiAbsent(test,sc12); ignorerSiAbsent(test,sc24);
  let o=await ouvrirSceneReelle(browser,sc12,{url:V3,greffes:['champPhoto'],reglages:m.REGLAGES_TEL});
  expect(await o.app.ev('S.camFov')).toBe(110.5);
  const r12=await caler(o), rapport=Math.tan(110.5/2*Math.PI/180)/Math.tan(r12.f/2*Math.PI/180);
  console.log(`12 mm : champ ${r12.f}° (nominal 110,5°), rapport de focale ${rapport.toFixed(3)} · cap ${r12.h.toFixed(1)}° horizon ${r12.p.toFixed(1)}° · ${r12.note}`);
  console.log(`  → même rapport sur le 24 mm : champ ${(2*Math.atan(Math.tan(71.5/2*Math.PI/180)/rapport)/Math.PI*180).toFixed(1)}° (Morgat, mesuré sur son relief : 63,5°)`);
  expect(r12.f).toBeGreaterThanOrEqual(99); expect(r12.f).toBeLessThanOrEqual(103); expect(rapport).toBeGreaterThan(1.15); expect(rapport).toBeLessThan(1.22);
  await o.ctx.close();
  // le 24 mm : crêtes à 12–21 km mais ciel voilé, soleil dans l'image ; aucun champ ne donne un bon calage (écart de 2 à 2,5° pour tous) : pas de mesure directe
  o=await ouvrirSceneReelle(browser,sc24,{url:V3,greffes:['champPhoto'],reglages:m.REGLAGES_TEL});
  const r24=await caler(o); console.log(`24 mm : ${r24.note}`); expect(r24.note).toMatch(/relief incertain/); expect(r24.f).toBe(71.5); // le champ nominal reste : aucune mesure sûre
  await o.ctx.close();
});
