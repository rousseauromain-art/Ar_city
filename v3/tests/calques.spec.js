// Greffe calques (plan du 16/11, lot R2) sur les scènes réelles : un calque par nature, et le milieu pour les éléments ambigus.
// Ignoré sans le dépôt privé (PARITE_OBLIGATOIRE=1 en CI).
const {test,expect}=require('@playwright/test');
const {ouvrirSceneReelle,ignorerSiAbsent}=require('../../tests/commun/scenes-reelles');
const {GREFFES_CONTEXTE}=require('../../tests/commun/planche');
const V3='/v3/villes-horizon.html', VERT=/110,\s*224,\s*143/;

test('calques : gorges — « Lieux » seul : aucun nom vert ; « Montagne » seul : les sommets, aucun village ; grottes de Choranche en « Montagne »',async({browser})=>{
  test.setTimeout(300000);
  const m=await import('../../tests/commun/caracterisation/pont-en-royans.mjs');
  const sc=m.SCENES_PONT.find(s=>s.id==='pont-photo-gorges'); ignorerSiAbsent(test,sc);
  const o=await ouvrirSceneReelle(browser,sc,{url:V3,greffes:[...GREFFES_CONTEXTE,'calques'],reglages:m.REGLAGES_TEL});
  await o.page.waitForTimeout(2500);
  const regler=async(lieux,montagne)=>{ await o.app.ev(`S.layers.places=${lieux}; S.layers.montagne=${montagne}; citiesVer++; true`); await o.page.waitForTimeout(2200); await o.app.frame(); return o.app.frame(); };
  const nature=await o.app.ev("Object.fromEntries(cities.concat(farPeaks).filter(c=>c.dist<15&&!c.hidden&&!c.far).map(c=>[String(c.name),window.G.calques.calque(c)]))");
  let t=await regler(true,false);
  expect(t.filter(x=>VERT.test(x.fill)).map(x=>x.text),'Lieux seul : aucun nom vert').toEqual([]);
  expect(t.some(x=>nature[x.text]==='lieux'),'Lieux seul : des lieux habités').toBe(true);
  t=await regler(false,true);
  const ecrits=t.map(x=>String(x.text)).filter(n=>nature[n]);
  expect(ecrits.length).toBeGreaterThan(0);
  for(const n of ecrits) expect(nature[n],'Montagne seul : '+n).toBe('montagne');
  expect(ecrits).toContain('Le Grand Serre');
  expect(await o.page.evaluate(()=>{ const z=window.__vh.ev('farPeaks').find(c=>/grottes de Choranche/.test(c.name)); return z&&window.G.calques.calque(z); })).toBe('montagne');
  expect(await o.page.evaluate(()=>!!document.getElementById('lyMontagne')&&!!document.getElementById('lyMer'))).toBe(true);
  await o.ctx.close(); expect(o.erreurs).toEqual([]);
});

test('calques : milieu — grottes de Morgat et de Saint-Malo en « Mer » (bord de l’eau)',async({browser})=>{
  test.setTimeout(300000);
  const car=await import('../../tests/commun/caracterisation/scenes.mjs');
  for(const [id,re] of [['morgat-plage',/grotte (de l'Autel|Sainte-Marine)/],['saint-malo-rempart',/grotte des (Hirondelles|Sirènes)/]]){
    const sc=car.SCENES.find(s=>s.id===id); ignorerSiAbsent(test,sc);
    const o=await ouvrirSceneReelle(browser,sc,{url:V3,greffes:['zones','calques'],reglages:car.REGLAGES_COMMUNS});
    await o.page.waitForTimeout(2500);
    const r=await o.page.evaluate(src=>{ const re=new RegExp(src); return window.__vh.ev('farPeaks').filter(c=>re.test(c.name)).map(c=>[c.name,window.G.calques.calque(c)]); },re.source);
    console.log(id,'·',JSON.stringify(r));
    expect(r.length).toBeGreaterThan(0); for(const [n,k] of r) expect(k,n).toBe('mer');
    await o.ctx.close(); expect(o.erreurs).toEqual([]);
  }
});
