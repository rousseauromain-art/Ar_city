// Parité du dessin v2 avec la v1 sur des scènes RÉELLES : ce que la v1 trace sur le canvas (horizon, réticule, silhouette, crêtes, pastilles
// de distance, silhouette lue sur la photo) est enregistré opération par opération (tests/helpers/enregistreur.js) ; les calques v2 produisent
// des commandes, rejouées sur un canvas enregistré de la même façon. Les deux listes doivent être identiques en Essentiel et en Tout voir.
// Ignoré sans le dossier PHOTOS_DIR (CI sans jeton, REFONTE.md §9).
const {test,expect}=require('@playwright/test');
const fs=require('fs'), path=require('path');
const {openApp}=require('../helpers/app.js');
const {readExports,seedCaches}=require('../helpers/cache.js');
const {reliefUrls}=require('../helpers/relief-urls.js');

const {PHOTOS_DIR,ignorerSiAbsent}=require('../helpers/scenes-reelles.js');
const fichiers=fs.existsSync(PHOTOS_DIR)?fs.readdirSync(PHOTOS_DIR).filter(f=>/^villes-horizon-.*\.json$/.test(f)).map(f=>path.join(PHOTOS_DIR,f)):[];
const SCENES=[
  {id:'saint-malo-rempart',photo:'PXL_20261025_112230293.jpg'},
  {id:'turin-san-carlo',photo:'PXL_20261022_104200724.jpg'},
  {id:'ibiza-coucher',photo:'PXL_20260927_173517301.jpg'},
];
const POSES=[[0,0],[37,3],[-80,-2],[150,6]]; // [écart de cap à la direction de la photo, inclinaison]
let exportsCache=null;
const exports_=()=>exportsCache||(exportsCache=readExports(fichiers));
// tous les autres calques coupés : il ne reste que horizon, réticule, silhouette, crêtes, pastilles et silhouette lue
const REGLAGES={relief:true,skyline:true,ridges:true,showDist:true,hamlets:false,telecom:false,buildings:false,sea:false,air:false,photoVis:true,
  layers:{places:false,monuments:false,equip:false,urban:false,urbClip:true,urbSmooth:true,urbFill:true},
  poi:{lighthouse:false,cape:false,rock:false,view:false,heritage:false,beach:false}};

for(const sc of SCENES){
  test(`dessin du relief v2 = v1 sur la scène réelle ${sc.id}`,async({browser})=>{
    ignorerSiAbsent(test,sc);
    test.setTimeout(480000);
    const {lireExif}=await import('../../src/noyau/exif.js');
    const b=fs.readFileSync(path.join(PHOTOS_DIR,sc.photo)), ex=lireExif(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
    const pos={lat:ex.lat,lon:ex.lon};
    const ctx=await browser.newContext({viewport:{width:915,height:412},deviceScaleFactor:2,hasTouch:true,locale:'fr-FR',timezoneId:'Europe/Paris',baseURL:`http://127.0.0.1:${+(process.env.PORT||4173)}`,permissions:['geolocation']});
    const page=await ctx.newPage(), erreurs=[]; page.on('pageerror',e=>erreurs.push(String(e)));
    await page.addInitScript({path:path.join(__dirname,'..','helpers','enregistreur.js')});
    const app=await openApp(page,{reel:true,start:false,settings:{...REGLAGES,radius:30},pos});
    const urls=reliefUrls(pos).tout;
    await seedCaches(page,{entries:exports_().entries.filter(e=>e.c==='dc'||urls.has(e.k))});
    await page.click('#go');
    await page.waitForFunction(()=>document.getElementById('start').style.display==='none');
    await page.setInputFiles('#photoFile',path.join(PHOTOS_DIR,sc.photo));
    await app.waitFor('photoMode&&pos');
    await app.waitFor('terrain&&!terrain.refining&&!terrainBusy&&reliefState==="ok"',240000);
    await new Promise(r=>setTimeout(r,2000));
    await app.waitFor('terrain&&!terrain.refining&&!terrainBusy',60000);
    // horloge de test figée : les caches de crêtes de la v1 (clés sur terrain.at) resteraient ceux du relief lointain ; on les invalide
    await app.ev('_ridgesAt=0; _skyDistAt=0; S.photoVis=true; photoMode.utc=Date.UTC(2026,0,1,1,0,0); true'); // heure de nuit : pas de symbole du soleil dans la scène
    const cap0=await app.ev('S.headOff');
    const bilan={}; let pastilles=0, pointilles=0;

    for(const mode of ['essentiel','tout-voir']) for(const [dCap,incl] of POSES){
      await app.ev(`setBeyond(${mode==='tout-voir'}); S.headOff=${(cap0+dCap+360)%360}; S.pitchOff=${incl}; true`);
      // silhouette lue factice : un profil ondulé autour de l'horizon calculé, injecté dans la v1 (photoSky frais)
      await app.ev(`photoSky={ok:true,t:Date.now(),cols:Array.from({length:160},(_, i)=>({brg:(pose().heading-40+i*0.5+360)%360,a:2+3*Math.sin(i/9)+(i%40===0?4:0)})),heading:pose().heading,pitch:pose().pitch,fh:0}; true`);
      for(let i=0;i<2;i++) await app.frame();
      const v1=(await page.evaluate(()=>window.__vh.frameOps())).ops;
      const v2=await page.evaluate(async()=>{
        const proj=await import('/src/rendu/projection.js'), cv=await import('/src/rendu/canvas.js'), hz=await import('/src/rendu/repere-horizon.js'),
          rl=await import('/src/calques/relief.js'), ph=await import('/src/calques/photo-silhouette.js');
        const ev=s=>window.__vh.ev(s), P=ev('pose()'), W=ev('W'), H=ev('H'), dpr=ev('dpr'), T=ev('terrain'), S=ev('S'), analyse=ev('photoSky');
        const flux=ev('camSrc()'), vue={largeurPx:W,hauteurPx:H,capDeg:P.heading,inclinaisonDeg:P.pitch,roulisDeg:P.roll,
          champDeg:proj.champAffiche(S.camFov,{largeurPx:W,hauteurPx:H},{largeurPx:flux.w,hauteurPx:flux.h})};
        if(Math.abs(vue.champDeg-ev('vFov()'))>1e-12) throw new Error('champ affiché différent : '+vue.champDeg+' / '+ev('vFov()'));
        const cn=document.createElement('canvas'); cn.width=W*dpr; cn.height=H*dpr; const c2=cn.getContext('2d'), rec=window.__enregistreur(c2);
        const mesurer=(police,t)=>{ c2.font=police; return c2.measureText(t).width; };
        const regl={silhouette:S.skyline,cretes:S.ridges!==false,distances:S.showDist,toutVoir:!!S.beyond};
        const lignes=await rl.calque.charger(null,{terrain:T}), classes=rl.calque.classer(lignes,null,regl);
        const cmds=[...hz.commandesHorizon(vue),...rl.calque.preparer(classes,vue,{terrain:T,reglages:regl,mesurerTexte:mesurer}),
          ...ph.calque.preparer(analyse,vue,{reglages:{toutVoir:!!S.beyond,analyseActive:S.photoVis===true},maintenantMs:Date.now(),jointure:'round'})];
        c2.setTransform(dpr,0,0,dpr,0,0); rec.demarrer();
        cv.avecRoulis(c2,vue,()=>cv.dessiner(c2,cmds));
        rec.arreter();
        return {ops:rec.evenements(),nCretes:classes.filter(c=>c.etat==='net').length,nLignes:classes.length,nCmds:cmds.length};
      });
      const tag=`${mode} cap+${dCap} incl ${incl}`;
      const nTxt=v1.filter(e=>e.t==='texte').length, nPts=v1.filter(e=>e.tirets&&e.tirets.join()==='2,4').length;
      pastilles+=nTxt; pointilles+=nPts;
      if(mode==='essentiel') expect(nPts,`${tag} : la silhouette lue n'apparaît qu'en Tout voir`).toBe(0);
      bilan[tag]={v1:v1.length,v2:v2.ops.length,cretesNettes:v2.nCretes,lignes:v2.nLignes};
      expect(v1.length,`${tag} : la v1 doit tracer quelque chose`).toBeGreaterThan(3);
      expect(v2.ops.length,`${tag} : nombre d'opérations`).toBe(v1.length);
      for(let i=0;i<v1.length;i++) expect(v2.ops[i],`${tag} : opération ${i}`).toEqual(v1[i]);
    }
    console.log(sc.id,JSON.stringify(bilan),'pastilles',pastilles,'pointillés',pointilles);
    expect(pointilles,'la silhouette lue est tracée en Tout voir').toBeGreaterThan(0);
    expect(Object.values(bilan).some(x=>x.cretesNettes>0),'au moins une crête nette sur la scène').toBe(true);
    expect(erreurs).toEqual([]);
    await ctx.close();
  });
}
