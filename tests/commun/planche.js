// Planche de rendus (plan du 16/11, lot R0) : les scènes fixes du banc rejouées avant / après les greffes d'une PR,
// une image de montage par scène et un rapport d'infractions (controles-visuels). Les images partent dans le dépôt
// privé Ar_city-photos (rendus/PR-<numéro>/), jamais dans Ar_city. Lancement : npm run planche (tests/commun/planche-cli.mjs).
const fs=require('fs'), path=require('path');
const {controler,total,resume}=require('./controles-visuels');

// Greffes allumées sur le téléphone de Romain au 15/11 au soir (fichier de contexte, §0 du plan du 16/11).
const GREFFES_CONTEXTE=['soleil2','permutation','oeil','icones','rotation','plaque','montagne','champAuto','nettete','projection','degage',
  'hauteurs','oeilLieu','horizonPhoto','soleilReflet','etiquettes','toits','lieuxRapides','gpsRapide','presDe','zones','nommer'];

/** Liste de greffes d'une variable d'environnement : « contexte » = les greffes du téléphone ; « contexte,visibilite » les ajoute. */
function greffesDe(env){
  if(!env) return [];
  return [...new Set(env.split(/[,; ]+/).filter(Boolean).flatMap(g=>g==='contexte'?GREFFES_CONTEXTE:[g]))];
}

/** Les scènes fixes de la planche : les quatre photos de Pont-en-Royans en portrait et en paysage, Turin, Morgat, Saint-Malo, une vue en direct. */
async function scenesPlanche(){
  const pont=await import('./caracterisation/pont-en-royans.mjs');
  const car=await import('./caracterisation/scenes.mjs');
  const parId=Object.fromEntries(pont.SCENES_PONT.map(s=>[s.id,s]).concat(car.SCENES.map(s=>[s.id,s])));
  const PORTRAIT={width:411,height:753}, PAYSAGE={width:809,height:331}; // écrans du téléphone (§0 du plan du 16/11)
  const out=[];
  for(const id of ['pont-photo-gorges','pont-photo-plaine','pont-photo-24mm','pont-photo-12mm'])
    for(const [nomEcran,ecran] of [['portrait',PORTRAIT],['paysage',PAYSAGE]])
      out.push({cle:`${id}-${nomEcran}`,sc:{...parId[id],ecran},reglages:pont.REGLAGES_TEL});
  for(const id of ['turin-san-carlo','morgat-plage','saint-malo-rempart'])
    out.push({cle:id,sc:parId[id],reglages:{...car.REGLAGES_COMMUNS,photoVis:true}});
  out.push({cle:'pont-est-direct',sc:parId['pont-est'],reglages:pont.REGLAGES_TEL});
  return out;
}

/** Capture d'une scène ouverte : image PNG + données pour les contrôles. `o` : résultat d'ouvrirSceneReelle. */
async function capturer(o,fichierPng){
  const r=await o.page.evaluate(()=>window.__vh.frameOps(false,true));
  const rects=await o.page.evaluate(()=>{
    // rectangles ramenés dans le repère du canevas, où sont les textes (la greffe photo le place sur la partie vue de la photo : 1 px = 1 px)
    const out=[], ov=document.getElementById('ov').getBoundingClientRect();
    for(const el of document.querySelectorAll('#tools button,#bar button,.chip')){
      const b=el.getBoundingClientRect(), st=getComputedStyle(el);
      if(b.width>0&&b.height>0&&st.visibility!=='hidden'&&st.display!=='none'&&!el.hidden)
        out.push({left:b.left-ov.left,right:b.right-ov.left,top:b.top-ov.top,bottom:b.bottom-ov.top,id:el.id||el.textContent.trim().slice(0,20)});
    }
    return out;
  });
  const noms=await o.app.ev("(()=>{ const nm=c=>{ if(c.kind!=='monument') return String(c.name); try{ return monName(c); }catch(e){ return String(c.name); } }; const T=cities.concat(farPeaks,monumentSites); return {caches:T.filter(c=>c.hidden).map(nm),visibles:T.filter(c=>!c.hidden&&!c.far).map(nm)}; })()");
  const etat=await o.app.ev('({toutVoir:!!S.beyond,H,W,hEcran:$("ov").getBoundingClientRect().height})');
  await o.page.screenshot({path:fichierPng});
  const infractions=controler({textes:r.textes,ops:r.ops,rects,nomsCaches:noms.caches,nomsVisibles:noms.visibles,toutVoir:etat.toutVoir,H:Math.min(etat.H,etat.hEcran)});
  return {infractions,textes:r.textes.length};
}

/** Montage « avant / après » : une seule image, côte à côte (écran portrait) ou empilée (paysage). */
async function monter(browser,{avantPng,apresPng,titre,legAvant,legApres,sortie}){
  const b64=f=>fs.readFileSync(f).toString('base64');
  const ctx=await browser.newContext({viewport:{width:3500,height:3500},deviceScaleFactor:1});
  const page=await ctx.newPage();
  await page.setContent(`<html><body style="margin:0;background:#0E1A2B"><div id="m" style="display:inline-block;padding:10px;font-family:system-ui">
    <div style="color:#F3E9D2;font-size:16px;font-weight:600;padding:2px 2px 8px">${titre}</div>
    <div id="row" style="display:flex;gap:10px;align-items:flex-start">
      <figure style="margin:0"><figcaption style="color:#9FB3C8;font-size:13px;padding:0 0 4px">avant — ${legAvant}</figcaption><img id="ia" src="data:image/png;base64,${b64(avantPng)}"></figure>
      <figure style="margin:0"><figcaption style="color:#9FB3C8;font-size:13px;padding:0 0 4px">après — ${legApres}</figcaption><img id="ib" src="data:image/png;base64,${b64(apresPng)}"></figure>
    </div></div></body></html>`);
  await page.evaluate(()=>new Promise(res=>{ const im=[...document.images]; let n=im.length; im.forEach(i=>{ const f=()=>{ if(!--n) res(); }; i.complete?f():(i.onload=f,i.onerror=f); }); }));
  await page.evaluate(()=>{ const ia=document.getElementById('ia'); if(ia.naturalWidth>ia.naturalHeight*1.4) document.getElementById('row').style.flexDirection='column'; });
  await page.locator('#m').screenshot({path:sortie,type:'jpeg',quality:82}); // JPEG : une planche de 12 scènes ≈ 6 Mo au lieu de 32
  await ctx.close();
}

/** Assemble le README.md du dossier de la planche à partir des fichiers .json écrits par planche.spec.js. */
function assemblerReadme(dir,infos){
  const js=fs.readdirSync(dir).filter(f=>f.endsWith('.json')).sort();
  const lignes=js.map(f=>{ const d=JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));
    return `### ${d.titre}\n\n![${d.titre}](${encodeURIComponent(d.image)})\n\n| | infractions |\n|---|---|\n| avant (${d.legAvant}) | ${d.resumeAvant} |\n| après (${d.legApres}) | ${d.resumeApres} |\n`; });
  const tete=`# Planche de rendus — ${infos.titre}\n\n${infos.description}\n\nContrôles « ce que l'on voit » (plan du 16/11, R0) : recouvrements de textes, textes sous un bouton ou une puce, traits de rappel plus longs qu'un quart de l'écran, noms cachés par le relief écrits hors « Tout voir ».\n\n`;
  fs.writeFileSync(path.join(dir,'README.md'),tete+lignes.join('\n'));
}

module.exports={GREFFES_CONTEXTE,greffesDe,scenesPlanche,capturer,monter,assemblerReadme,total,resume};
