// Greffe visibilite (plan du 16/11, lot R1) sur la vue réelle des gorges de la Bourne (photo du 14/11, 15:57), avec les 22 greffes du
// téléphone : n'écrire que ce qui se voit. Ignoré sans le dépôt privé (PARITE_OBLIGATOIRE=1 en CI).
const {test,expect}=require('@playwright/test');
const {ouvrirSceneReelle,ignorerSiAbsent}=require('../../tests/commun/scenes-reelles');
const {GREFFES_CONTEXTE}=require('../../tests/commun/planche');
const V3='/v3/villes-horizon.html';
const norme=t=>String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[’']/g,"'");

test('visibilite : gorges — ni cols ni grottes cachés par le relief, toujours les crêtes et les lieux visibles',async({browser})=>{
  test.setTimeout(300000);
  const m=await import('../../tests/commun/caracterisation/pont-en-royans.mjs');
  const sc={...m.SCENES_PONT.find(s=>s.id==='pont-photo-gorges'),heureReelle:true}; ignorerSiAbsent(test,sc);
  const o=await ouvrirSceneReelle(browser,sc,{url:V3,greffes:[...GREFFES_CONTEXTE,'visibilite'],reglages:m.REGLAGES_TEL});
  await o.page.waitForTimeout(3000); await o.app.frame(); const t=(await o.app.frame()).map(x=>norme(x.text));
  const ecrit=n=>t.some(x=>x.includes(norme(n)));
  for(const n of ['col de la Croix-Perrin','grotte Favot','Ganpaloup','trou qui souffle','col Vert','col des Deux Sœurs','col du Mont Noir']) expect(ecrit(n),'caché, ne doit pas être écrit : '+n).toBe(false);
  for(const n of ['Rochers de Presles','Le Grand Serre','crête de Chalimont','Choranche']) expect(ecrit(n),'visible, doit être écrit : '+n).toBe(true);
  expect(await o.app.ev('S.relief')).toBe(true);
  await o.ctx.close(); expect(o.erreurs).toEqual([]);
});

test('visibilite : « Masquer ce qui est caché par le relief » décoché dans les réglages — le relief s’applique quand même, une seule case',async({browser})=>{
  test.setTimeout(300000);
  const m=await import('../../tests/commun/caracterisation/pont-en-royans.mjs');
  const sc={...m.SCENES_PONT.find(s=>s.id==='pont-photo-gorges'),heureReelle:true}; ignorerSiAbsent(test,sc);
  const lire=async(greffes)=>{ const o=await ouvrirSceneReelle(browser,sc,{url:V3,greffes,reglages:{...m.REGLAGES_TEL,relief:false}});
    await o.page.waitForTimeout(2000); await o.app.frame(); const noms=(await o.app.frame()).map(x=>norme(x.text));
    const ui=await o.page.evaluate(()=>({rel:getComputedStyle(document.getElementById('rel').closest('.row')).display!=='none',vis:!!document.getElementById('g3Vis')}));
    await o.ctx.close(); return {noms,ui}; };
  const v1=await lire(GREFFES_CONTEXTE), g=await lire([...GREFFES_CONTEXTE,'visibilite']);
  // la v1, relief décoché, pose tout sur l'horizon : des villages derrière le plateau (Villard-de-Lans, Méaudre, Engins) sont écrits
  expect(['villard-de-lans','meaudre','engins'].some(n=>v1.noms.some(x=>x.includes(n)))).toBe(true);
  expect(['villard-de-lans','meaudre','engins'].some(n=>g.noms.some(x=>x.includes(n)))).toBe(false);
  expect(v1.ui).toEqual({rel:true,vis:false}); expect(g.ui).toEqual({rel:false,vis:true}); // la case du relief disparaît, une seule case la remplace
});
