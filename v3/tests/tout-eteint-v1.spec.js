// Règle 1 de docs/REFONTE-V3.md : TOUTES GREFFES ÉTEINTES, LA V3 = LA V1. Sur les scènes réelles (photos et caches du dépôt privé Ar_city-photos, rejoués :
// le vrai code relit relief, lieux et monuments), la trame de dessin de la v3 doit être celle de la v1 — chaque trait et chaque texte, ruban de cap compris —
// en Essentiel et en Tout voir, pour trois poses ; les fiches au toucher doivent être les mêmes. L'interface (Réglages, aides, Calques, boutons, accueil)
// est comparée sans le dépôt privé : seul le panneau « Greffes v2 » s'y ajoute. Ignoré sans le dépôt privé (PARITE_OBLIGATOIRE=1 : erreur).
const {test,expect}=require('@playwright/test');
const {ouvrirSceneReelle,ignorerSiAbsent}=require('../../tests/commun/scenes-reelles.js');
const {V1,V3}=require('./aide/v3');

test.describe.configure({retries:1}); // sous forte charge, une des deux pages peut finir de charger pendant la comparaison ; un vrai écart échoue deux fois

// les 5 scènes de référence, et Cesson (l'export de Rennes centre manque encore : à ajouter dès qu'il est déposé)
const SCENES=[
  {id:'saint-malo-rempart',photo:'PXL_20261025_112230293.jpg',radius:30},
  {id:'turin-san-carlo',photo:'PXL_20261022_104200724.jpg',radius:30},
  {id:'ibiza-coucher',photo:'PXL_20260927_173517301.jpg',radius:30,heureReelle:true,soleil:true},
  {id:'morgat-plage',photo:'PXL_20260824_175454144.jpg',radius:180},
  {id:'paris-grenelle-nuit',pos:{lat:48.8494956,lon:2.2865298},capDeg:28,radius:180,heure:'2026-10-27T19:30:00Z',ecran:{width:412,height:915}},
  {id:'cesson-gallets',pos:{lat:48.1358919,lon:-1.6233885},capDeg:237,radius:180,heure:'2026-11-06T10:20:00Z',ecran:{width:412,height:915}},
];
const POSES=[[0,0],[37,3],[-80,-2]];
const REGLAGES={relief:true,skyline:true,hamlets:true,telecom:true,buildings:true,sea:false,air:false,photoVis:false,cross:false,
  layers:{places:true,monuments:true,equip:true,urban:false,urbClip:true,urbSmooth:true,urbFill:true},poi:{lighthouse:true,cape:true,rock:true,view:true,heritage:true,beach:true}};
const REMISE='for(const c of cities.concat(farPeaks,monumentSites)){ c.demT=0; c._skyT=0; } for(const b of buildingSites) b._gT=0; applyOcclusion(false); _ridgesAt=0; _skyDistAt=0; true';

for(const sc of SCENES){
  test(`tout éteint = v1 : trame de dessin et fiches identiques sur la scène réelle ${sc.id}`,async({browser})=>{
    ignorerSiAbsent(test,sc);
    test.setTimeout(1500000);
    const ouvrir=async url=>{ const o=await ouvrirSceneReelle(browser,sc,{reglages:REGLAGES,url,greffes:url===V3?[]:undefined});
      await o.app.waitFor('!monBusy&&!towerBusy&&!telecomBusy&&!buildingsBusy',120000); await o.app.ev(REMISE); return o; };
    const a=await ouvrir(V1), b=await ouvrir(V3);
    expect(b.app.greffes,'aucune greffe allumée').toEqual([]);
    const bilan='({lieux:cities.length,monuments:monumentSites.length,pylones:telecomSites.length,reperes:buildingSites.length,terrain:!!terrain,source,cap:S.headOff})';
    const b1=await a.app.ev(bilan), b2=await b.app.ev(bilan); console.log(sc.id,JSON.stringify(b1)); expect(b2,'mêmes données').toEqual(b1);
    const sol=sc.soleil?await a.app.ev('sunNow()'):null;
    let ops=0;
    for(const mode of ['essentiel','tout-voir']) for(const [dCap,incl] of POSES){
      const cap=sol?(Math.round(sol.az)+dCap+360)%360:(a.cap0+dCap+360)%360, inc=sol?Math.round(sol.el)+incl:incl, tag=`${mode} cap+${dCap} incl ${incl}`;
      const trame=async o=>{ await o.app.ev(`setBeyond(${mode==='tout-voir'}); S.headOff=${cap}; S.pitchOff=${inc}; S.photoVis=false; photoSky=null; for(const c of monumentSites) c._snapDB=0; citiesVer++; $('note').style.display='none'; true`);
        await o.app.ev(REMISE); await o.app.ev('lblMem.clear(); laneMem.clear(); true'); for(let i=0;i<2;i++) await o.app.frame();
        return o.page.evaluate(()=>window.__vh.frameOps(false,true)); };
      const f1=await trame(a), f2=await trame(b);
      const k=f1.ops.findIndex((o,i)=>JSON.stringify(o)!==JSON.stringify(f2.ops[i]));
      if(k>=0||f1.ops.length!==f2.ops.length) console.log('ÉCART',tag,k,'\nV1',JSON.stringify(f1.ops.slice(Math.max(0,k-1),k+2)).slice(0,1500),'\nV3',JSON.stringify(f2.ops.slice(Math.max(0,k-1),k+2)).slice(0,1500));
      expect(f2.ops.length,`${tag} : nombre d'opérations`).toBe(f1.ops.length);
      expect(f2.ops,`${tag} : opérations`).toEqual(f1.ops); expect(f2.textes,`${tag} : textes`).toEqual(f1.textes);
      ops+=f1.ops.length;
    }
    // fiches au toucher : les 8 premières zones touchables (monuments, pylônes, repères), mêmes fiches
    const zones=await a.app.ev('telecomHits.concat(monHits).slice(0,8).map(h=>{ const b=h.icon||[h.x0,h.x1,h.y0,h.y1]; return [(b[0]+b[1])/2,(b[2]+b[3])/2]; })');
    for(const [x,y] of zones){
      const fiche=async o=>{ await o.app.ev(`$('dbg').classList.remove('open'); $('dbgBody').innerHTML=''; showTelecomDetail(${x},${y}); true`);
        await o.app.waitFor("!$('dbgBody').innerHTML.includes('chargement…')",10000); // dernière modification OSM : réponse (simulée) attendue des deux côtés
        return o.app.ev("({titre:$('dbgTitle').textContent,corps:$('dbgBody').innerHTML,ouverte:$('dbg').classList.contains('open')})"); };
      const f1=await fiche(a), f2=await fiche(b); expect(f2,`fiche en ${Math.round(x)},${Math.round(y)}`).toEqual(f1);
    }
    console.log(sc.id,'opérations comparées',ops,'· fiches comparées',zones.length);
    expect(a.erreurs.concat(b.erreurs)).toEqual([]);
    await a.ctx.close(); await b.ctx.close();
  });
}

/** Interface statique et calculée au démarrage (Réglages, aides « ? », Calques, boutons, accueil, puces) : le DOM, sans les scripts ni le panneau « Greffes v2 ». */
function interfaceDom(){
  const c=document.body.cloneNode(true); c.querySelectorAll('script,#g3Panel').forEach(x=>x.remove());
  return c.innerHTML.replace(/\s+/g,' ');
}
test('tout éteint = v1 : interface identique (Réglages, aides, Calques, boutons, accueil) ; seul le panneau « Greffes v2 » s’ajoute',async({browser})=>{
  const lire=async url=>{ const p=await browser.newPage(); await p.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort()); await p.clock.setFixedTime(new Date('2026-10-26T23:30:00Z'));
    await p.goto(url+'?nohook=1'); await p.waitForLoadState('load'); await p.waitForTimeout(500); const d=await p.evaluate(interfaceDom), pan=await p.locator('#g3Panel').count(); await p.close(); return {d,pan}; };
  const v1=await lire(V1), v3=await lire(V3);
  expect(v1.pan).toBe(0); expect(v3.pan).toBe(1);
  if(v1.d!==v3.d){ let k=0; while(v1.d[k]===v3.d[k]) k++; console.log('ÉCART\nV1',v1.d.slice(Math.max(0,k-200),k+300),'\nV3',v3.d.slice(Math.max(0,k-200),k+300)); }
  expect(v3.d.length).toBe(v1.d.length); expect(v3.d===v1.d).toBe(true);
});
