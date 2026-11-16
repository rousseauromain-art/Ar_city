// Planche de rendus (plan du 16/11, lot R0) : lancée par `npm run planche` (PLANCHE=1), jamais par la CI.
// Chaque scène fixe est ouverte deux fois (greffes « avant », greffes « après »), capturée, contrôlée
// (controles-visuels) et montée en une image ; le README est assemblé par tests/commun/planche-cli.mjs.
// Variables : PLANCHE_DIR (dossier de sortie), PLANCHE_AVANT / PLANCHE_APRES (listes de greffes ;
// « contexte » = les greffes du téléphone du 15/11), PHOTOS_DIR (dépôt privé).
const {test,expect}=require('@playwright/test');
const fs=require('fs'), path=require('path');
const {ouvrirSceneReelle,ignorerSiAbsent}=require('../../tests/commun/scenes-reelles');
const {greffesDe,scenesPlanche,capturer,monter,resume,total}=require('../../tests/commun/planche');
const V3='/v3/villes-horizon.html';

const ACTIF=process.env.PLANCHE==='1';
const DIR=process.env.PLANCHE_DIR||'';
const AVANT=greffesDe(process.env.PLANCHE_AVANT||'');
const APRES=greffesDe(process.env.PLANCHE_APRES||'contexte');
const REGLAGES=process.env.PLANCHE_REGLAGES?JSON.parse(process.env.PLANCHE_REGLAGES):{}; // réglages communs aux deux rendus (ex. calque « Lieux » décoché)
const leg=g=>g.length?`${g.length} greffe(s) : ${g.join(', ')}`:'toutes greffes éteintes (v1)';

test.describe('planche de rendus',()=>{
  test.skip(!ACTIF,'planche à la demande : npm run planche');
  let scenes=null;
  test.beforeAll(async()=>{ scenes=await scenesPlanche(); fs.mkdirSync(DIR,{recursive:true}); });

  for(let i=0;i<12;i++) test(`scène ${i+1}`,async({browser})=>{
    test.setTimeout(420000);
    const {cle,sc,reglages}=scenes[i]; ignorerSiAbsent(test,sc);
    const num=String(i+1).padStart(2,'0'), base=path.join(DIR,`${num}-${cle}`);
    const faire=async(greffes,png)=>{
      const o=await ouvrirSceneReelle(browser,sc,{url:V3,greffes,reglages:{...reglages,...REGLAGES}});
      const r=await capturer(o,png); await o.ctx.close(); return r;
    };
    const rAvant=await faire(AVANT,base+'.avant.png');
    const rApres=await faire(APRES,base+'.apres.png');
    const titre=`${sc.lieu||cle} — ${sc.ecran.width}×${sc.ecran.height}`;
    await monter(browser,{avantPng:base+'.avant.png',apresPng:base+'.apres.png',titre,
      legAvant:leg(AVANT),legApres:leg(APRES),sortie:base+'.jpg'});
    fs.rmSync(base+'.avant.png'); fs.rmSync(base+'.apres.png'); // seul le montage est déposé
    fs.writeFileSync(base+'.json',JSON.stringify({titre,image:`${num}-${cle}.jpg`,legAvant:leg(AVANT),legApres:leg(APRES),
      resumeAvant:resume(rAvant.infractions),resumeApres:resume(rApres.infractions),
      totalAvant:total(rAvant.infractions),totalApres:total(rApres.infractions),
      infractionsApres:rApres.infractions},null,1));
    console.log(`${cle} · avant : ${resume(rAvant.infractions)} · après : ${resume(rApres.infractions)}`);
    expect(fs.existsSync(base+'.jpg')).toBe(true);
  });
});
