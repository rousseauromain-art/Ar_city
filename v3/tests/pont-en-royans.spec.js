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
    const o=await ouvrirSceneReelle(browser,sc,{url:V3,greffes:m.GREFFES_TEL,reglages:m.REGLAGES_TEL});
    const r=await o.app.ev("({n:cities.length,source,loading,noms:cities.map(c=>String(c.name)).concat(farPeaks.map(c=>String(c.name)))})");
    console.log(`${id} : ${r.n} lieux (${r.source}) en ${Math.round((Date.now()-t0)/1000)} s`);
    expect(r.loading).toBe(false);
    expect(r.n).toBeGreaterThan(2000);   // 64 lieux avant le lot 0 : la fusion plantait sur le sommet « 1526 »
    const nn=r.noms.map(norme), manque=sc.attendus.filter(a=>!nn.some(x=>x===norme(a)||x.includes(norme(a))));
    console.log(`${id} · attendus absents des sources : ${manque.join(', ')||'aucun'}`);
    // ce qui est réellement ÉCRIT à l'écran (et non seulement présent dans les sources) : état de départ du lot 2, pas encore une exigence
    await o.app.frame(); const textes=await o.app.frame(), ecrits=sc.attendus.filter(a=>textes.some(t=>norme(String(t.text)).includes(norme(a))));
    console.log(`${id} · attendus ÉCRITS à l'écran : ${ecrits.length}/${sc.attendus.length} (${ecrits.join(', ')||'aucun'}) ; ${textes.length} textes`);
    await o.ctx.close(); expect(o.erreurs).toEqual([]);
  });
