// Banc d'essai « Pont-en-Royans » (sortie du 14/11, plan du 15/11 lot 9) : rejoue les exports du téléphone avec ses 17 greffes et
// « Visibilité d'après la photo » cochée. Ignoré sans le dépôt privé (PARITE_OBLIGATOIRE=1 en CI).
const {test,expect}=require('@playwright/test');
const {ouvrirSceneReelle,ignorerSiAbsent}=require('../../tests/commun/scenes-reelles');
const V3='/v3/villes-horizon.html';
const charger=()=>import('../../tests/commun/caracterisation/pont-en-royans.mjs');

const norme=t=>t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[’']/g,"'").replace(/\s+/g,' ').trim();

for(const id of ['pont-est','pont-ouest','pont-photo-plaine','pont-photo-gorges','pont-photo-24mm','pont-photo-12mm'])
  test(`Pont-en-Royans · ${id} : lieux chargés (lot 0), noms attendus présents dans les sources, aucune erreur`,async({browser})=>{
    test.setTimeout(300000);
    const m=await charger(), sc=m.SCENES_PONT.find(s=>s.id===id); ignorerSiAbsent(test,sc);
    const t0=Date.now();
    const o=await ouvrirSceneReelle(browser,sc,{url:V3,greffes:[...m.GREFFES_TEL,'etiquettes','toits','anfrRelief'],reglages:m.REGLAGES_TEL});
    const r=await o.app.ev("({n:cities.length,source,loading,noms:cities.map(c=>String(c.name)).concat(farPeaks.map(c=>String(c.name)))})");
    console.log(`${id} : ${r.n} lieux (${r.source}) en ${Math.round((Date.now()-t0)/1000)} s`);
    expect(r.loading).toBe(false);
    expect(r.n).toBeGreaterThan(2000);   // 64 lieux avant le lot 0 : la fusion plantait sur le sommet « 1526 »
    const nn=r.noms.map(norme), manque=sc.attendus.filter(a=>!nn.some(x=>x===norme(a)||x.includes(norme(a))));
    console.log(`${id} · attendus absents des sources : ${manque.join(', ')||'aucun'}`);
    // ce qui est réellement ÉCRIT à l'écran (et non seulement présent dans les sources) : état de départ du lot 2, pas encore une exigence
    await o.app.frame(); const textes=await o.app.frame(), ecrits=sc.attendus.filter(a=>textes.some(t=>norme(String(t.text)).includes(norme(a))));
    console.log(`${id} · attendus ÉCRITS à l'écran : ${ecrits.length}/${sc.attendus.length} (${ecrits.join(', ')||'aucun'}) ; ${textes.length} textes`);
    // exigences du lot 2 (greffe etiquettes) : à l'est les trois noms de montagne et de hameau du plan ; à l'ouest au moins 8 noms écrits
    if(id==='pont-est') for(const n of ['Le Grand Serre','crête de Chalimont','Choranche-les-Bains']) expect(ecrits,'écrit : '+n).toContain(n);
    if(id==='pont-est'){ // lot 3 : Choranche (caché de 0,36° par la v1) visible, Presles (réellement caché) reste caché
      const v=await o.app.ev("Object.fromEntries(['Choranche','Presles','Rencurel','Châtelus'].map(n=>{ const c=cities.find(x=>x.name===n); return [n,c?c.hidden:null]; }))");
      console.log('pont-est · cachés par le relief :',JSON.stringify(v));
      expect(v.Choranche).toBe(false); expect(v.Presles).toBe(true); }
    if(id==='pont-ouest'){ // lot 4 : le pylône ANFR à 0,7 km est relié au « Mât TDF · Pont-en-Royans » : un seul dessin, au mât
      const l=await o.app.ev("telecomSites.filter(t=>t.dist<1.2).map(t=>({d:+t.dist.toFixed(2),dup:t.dupMon,lien:t.lienMat}))");
      console.log('pont-ouest · supports ANFR à moins de 1,2 km :',JSON.stringify(l));
      expect(l.length).toBeGreaterThan(0); for(const t of l){ expect(t.dup).toBe(true); expect(t.lien).toMatch(/Mât TDF · Pont-en-Royans/); }
      const noms=(await o.app.frame()).map(t=>String(t.text)); expect(noms.filter(t=>/^Mât TDF · Pont-en-Royans/.test(t)).length).toBe(1); }
    if(id==='pont-ouest') expect((await o.app.ev('placeStats.shown'))).toBeGreaterThanOrEqual(8);
    await o.ctx.close(); expect(o.erreurs).toEqual([]);
  });
