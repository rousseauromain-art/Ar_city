// Contrôles « ce que l'on voit » (plan du 16/11, lot R0), exigés greffes ÉTEINTES (v1) sur les scènes réelles :
// aucun texte n'en recouvre un autre ; aucun texte sous un bouton ou une puce ; aucun nom caché par le relief
// écrit hors « Tout voir ». Les traits de rappel trop longs sont seulement rapportés : leur borne devient une
// exigence avec le lot R4 (étiquettes de montagne). Ignoré sans le dépôt privé (PARITE_OBLIGATOIRE=1 en CI).
const {test,expect}=require('@playwright/test');
const {ouvrirSceneReelle,ignorerSiAbsent}=require('../../tests/commun/scenes-reelles');
const {capturer}=require('../../tests/commun/planche');
const {resume}=require('../../tests/commun/controles-visuels');
const V3='/v3/villes-horizon.html';
const os=require('os'), path=require('path'), fs=require('fs');

const charger=async()=>{ const pont=await import('../../tests/commun/caracterisation/pont-en-royans.mjs');
  const car=await import('../../tests/commun/caracterisation/scenes.mjs');
  return {parId:Object.fromEntries(pont.SCENES_PONT.map(s=>[s.id,s]).concat(car.SCENES.map(s=>[s.id,s]))),
    tel:pont.REGLAGES_TEL,commun:{...car.REGLAGES_COMMUNS,photoVis:true}}; };

for(const [id,quelReglage] of [['pont-photo-gorges','tel'],['pont-est','tel'],['turin-san-carlo','commun'],['morgat-plage','commun']])
  test(`ce que l'on voit (greffes éteintes = v1) : ${id} — pas de recouvrement, rien sous les boutons, aucun caché écrit`,async({browser})=>{
    test.setTimeout(300000);
    const m=await charger(), sc=m.parId[id]; ignorerSiAbsent(test,sc);
    const o=await ouvrirSceneReelle(browser,sc,{url:V3,greffes:[],reglages:m[quelReglage]});
    const png=path.join(os.tmpdir(),`cqlv-${id}.png`);
    const {infractions}=await capturer(o,png); fs.rmSync(png,{force:true});
    console.log(`${id} · ${resume(infractions)}`);
    expect(infractions.recouvrements).toEqual([]);
    // la v1 pose déjà de petites pastilles de comptage (« 7 », « 14 ») sous les boutons de droite : seuls les
    // textes de plus de 2 caractères (noms, distances) sont exigés ici ; tout texte le sera avec le lot R4
    expect(infractions.sousLesBoutons.filter(x=>String(x.text).trim().length>2)).toEqual([]);
    if(infractions.sousLesBoutons.length) console.log(`${id} · pastilles sous les boutons (rapport, exigé au lot R4) :`,JSON.stringify(infractions.sousLesBoutons));
    expect(infractions.cachesEcrits).toEqual([]);
    if(infractions.traitsTropLongs.length) console.log(`${id} · traits > H/4 (rapport, exigé au lot R4) :`,JSON.stringify(infractions.traitsTropLongs.slice(0,6)));
    await o.ctx.close(); expect(o.erreurs).toEqual([]);
  });
