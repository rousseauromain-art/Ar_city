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

// Lot R4 (greffe placement) : avec les greffes du téléphone et R1 à R3, plus aucun recouvrement, rien sous les boutons ni les puces, et aucun
// trait de rappel de NOM de lieu ou de montagne plus long qu'un quart de l'écran. Rapportés sans être exigés : les fils des pylônes et repères
// hauts de la v1 (lot R8) et le fil d'un monument, qui part du pied de sa silhouette et la traverse.
const {COULEURS_CALQUES,COULEUR_MONUMENT}=require('../../tests/commun/controles-visuels');
const {GREFFES_CONTEXTE}=require('../../tests/commun/planche');
for(const [id,ecran,quelReglage] of [['pont-photo-gorges',{width:809,height:331},'tel'],['pont-photo-24mm',{width:809,height:331},'tel'],['pont-photo-12mm',{width:411,height:753},'tel'],['pont-est',null,'tel'],['saint-malo-rempart',null,'commun'],['turin-san-carlo',null,'commun']])
  test(`ce que l'on voit (greffe placement) : ${id}${ecran?` ${ecran.width}×${ecran.height}`:''} — aucun recouvrement, rien sous les boutons, traits des noms ≤ H/4`,async({browser})=>{
    test.setTimeout(300000);
    const m=await charger(), sc0=m.parId[id]; ignorerSiAbsent(test,sc0); const sc=ecran?{...sc0,ecran}:sc0;
    const o=await ouvrirSceneReelle(browser,sc,{url:V3,greffes:[...GREFFES_CONTEXTE,'visibilite','calques','toucher','placement'],reglages:m[quelReglage]});
    await o.page.waitForTimeout(2500);
    const png=path.join(os.tmpdir(),`cqlv-r4-${id}.png`); const {infractions}=await capturer(o,png); fs.rmSync(png,{force:true});
    console.log(`${id} · placement · ${resume(infractions)}`);
    expect(infractions.recouvrements).toEqual([]);
    expect(infractions.sousLesBoutons).toEqual([]);
    expect(infractions.traitsTropLongs.filter(t=>!COULEURS_CALQUES.test(String(t.couleur))&&!COULEUR_MONUMENT.test(String(t.couleur)))).toEqual([]);
    if(infractions.traitsTropLongs.length) console.log(`${id} · fils de calques ou de monuments > H/4 (rapport) :`,JSON.stringify(infractions.traitsTropLongs));
    expect(infractions.cachesEcrits).toEqual([]);
    await o.ctx.close(); expect(o.erreurs).toEqual([]);
  });
