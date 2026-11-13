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

// Vérité donnée par Romain (13/11) : Saint-Malo sur le rempart, Turin debout sur la place, Ibiza assis au bord de la plage, Morgat sur le remblai
// de la plage. Aucune photo prise d'un étage : la hauteur d'œil réglée un autre jour (+13 m) ne doit pas servir, et l'altitude de la photo doit
// donner « au sol » (le rempart de Saint-Malo est déjà dans le sol du modèle de terrain fin).
for(const id of ['saint-malo-rempart','turin-san-carlo','ibiza-coucher','morgat-plage'])
  test(`${id} : la hauteur d'œil de la photo est « au sol » d'après son altitude (greffe oeilLieu), et non les +13 m réglés ailleurs`,async({browser})=>{
    test.setTimeout(240000);
    const {parId,reglages}=await scenes(), sc=parId[id]; ignorerSiAbsent(test,sc);
    const o=await ouvrirSceneReelle(browser,sc,{url:V3,greffes:['oeilLieu'],reglages:{...reglages,obsHeight:13}});
    const decision=()=>o.page.evaluate(()=>{ const e=window.G.oeilLieu.etat(); return e.photo&&e.photo.decision; });
    await expect.poll(decision,{timeout:60000}).toBeTruthy();
    const d=await decision(), sol=await o.app.ev('[obsGround,obsGroundSrc,S.obsHeight,terrain.h0]');
    console.log(`${id} · oeilLieu : ${d.texte} · sol ${sol[0].toFixed(1)} m (${sol[1]})`);
    expect(d.source).toBe('altitude'); expect(d.correction).toBe(0); expect(Math.abs(d.exces)).toBeLessThan(8);
    expect(sol[2]).toBe(0); await o.app.waitFor('!terrainBusy&&Math.abs(terrain.h0-Math.max(1,obsGround+1.6))<0.01'); // relief recalculé pour un œil au sol
    await o.ctx.close(); expect(o.erreurs).toEqual([]);
  });
