// Banc d'essai sur les photos réelles du dépôt privé Ar_city-photos (photos avec EXIF et exports du cache) : ce que les greffes changent sur de
// vraies scènes, à côté de la v1. Ignoré sans le dépôt privé (obligatoire en CI : PARITE_OBLIGATOIRE=1).
const {test,expect}=require('@playwright/test');
const {ouvrirSceneReelle,ignorerSiAbsent}=require('../../tests/commun/scenes-reelles');
const V3='/v3/villes-horizon.html';
const scenes=async()=>{ const m=await import('../../tests/commun/caracterisation/scenes.mjs'); return {parId:Object.fromEntries(m.SCENES.map(s=>[s.id,s])),reglages:m.REGLAGES_COMMUNS}; };

test('Turin, piazza San Carlo : la statue équestre fait 4,4 m (greffe hauteurs) et non les 40 m du clocher voisin (v1) ; le clocher va à une église',async({browser})=>{
  test.setTimeout(240000);
  const {parId,reglages}=await scenes(), sc=parId['turin-san-carlo']; ignorerSiAbsent(test,sc);
  const lire="(()=>{ const pres=monumentSites.filter(m=>m.dist<0.4), st=pres.find(m=>/statue équestre/.test(m.name)); return {statue:st&&{ht:st.ht,htOsm:st.htOsm,htWd:st.htWd},a40:pres.filter(m=>m.htOsm===40).map(m=>m.name+' ('+m.type+')')}; })()";
  let o=await ouvrirSceneReelle(browser,sc,{url:V3,greffes:[],reglages}); const v1=await o.app.ev(lire); await o.ctx.close();
  expect(v1.statue).toEqual({ht:40,htOsm:40,htWd:null}); // le défaut de la v1, reproduit
  o=await ouvrirSceneReelle(browser,sc,{url:V3,greffes:['hauteurs'],reglages}); const g=await o.app.ev(lire), statut=await o.page.evaluate(()=>window.G.hauteurs.statut()); await o.ctx.close();
  console.log('Turin · hauteurs :',JSON.stringify(g),'·',statut);
  expect(g.statue).toEqual({ht:4.4,htOsm:4.4,htWd:null});
  expect(g.a40.length).toBeGreaterThan(0); for(const n of g.a40) expect(n).toMatch(/\((clocher|tour|dome)\)$/);
  expect(o.erreurs).toEqual([]);
});
