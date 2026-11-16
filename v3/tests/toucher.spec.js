// Greffe toucher (plan du 16/11, lot R3) sur la vue réelle des gorges de la Bourne : toucher un nom ouvre SA fiche.
// Ignoré sans le dépôt privé (PARITE_OBLIGATOIRE=1 en CI).
const {test,expect}=require('@playwright/test');
const {ouvrirSceneReelle,ignorerSiAbsent}=require('../../tests/commun/scenes-reelles');
const {GREFFES_CONTEXTE}=require('../../tests/commun/planche');
const {textPoly}=require('../../tests/commun/labels');
const V3='/v3/villes-horizon.html';

// centre de l'étiquette écrite `nom` à l'écran (px CSS), d'après la capture du crochet de test
async function centreDe(o,nom){
  await o.app.frame(); const t=(await o.app.frame()).find(x=>x.text===nom); if(!t) return null;
  const P=textPoly(t); return [P.reduce((a,p)=>a+p[0],0)/4,P.reduce((a,p)=>a+p[1],0)/4];
}

for(const avecGreffe of [true,false])
  test(`toucher ${avecGreffe?'allumée':'éteinte'} : toucher « Le Grand Serre » ouvre ${avecGreffe?'« Le Grand Serre »':'« Relief touché » (le relief sous l’étiquette)'}`,async({browser})=>{
    test.setTimeout(300000);
    const m=await import('../../tests/commun/caracterisation/pont-en-royans.mjs');
    const sc=m.SCENES_PONT.find(s=>s.id==='pont-photo-gorges'); ignorerSiAbsent(test,sc);
    const greffes=avecGreffe?[...GREFFES_CONTEXTE,'visibilite','calques','toucher']:[...GREFFES_CONTEXTE,'visibilite','calques'];
    const o=await ouvrirSceneReelle(browser,sc,{url:V3,greffes,reglages:m.REGLAGES_TEL});
    await o.page.waitForTimeout(2500);
    const p=await centreDe(o,'Le Grand Serre'); expect(p,'« Le Grand Serre » est écrit').not.toBeNull();
    await o.page.mouse.click(p[0],p[1]);
    await expect(o.page.locator('#dbg')).toHaveClass(/open/);
    if(avecGreffe){
      await expect(o.page.locator('#dbgTitle')).toHaveText('Le Grand Serre');
      const corps=o.page.locator('#dbgBody');
      await expect(corps).toContainText(/sommet · 1\s?297 m · à 6(,\d)? km · direction \d+°/);
      await expect(corps).toContainText('calque « Montagne »'); await expect(corps).toContainText('visible d’ici');
      await expect(corps.locator('a',{hasText:'voir sur la carte'})).toHaveAttribute('href',/openstreetmap\.org/);
      // la puce « Près de … » ouvre la fiche du même lieu
      await o.page.click('#dbgClose'); await o.page.click('#g3Pres');
      await expect(o.page.locator('#dbgTitle')).toHaveText(/^Pont-en-Royans$/);
    } else await expect(o.page.locator('#dbgTitle')).toHaveText('Relief touché');
    await o.ctx.close(); expect(o.erreurs).toEqual([]);
  });
