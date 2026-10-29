// CROCHET DE TEST : insere par tests/helpers/server.js juste avant le dernier "})();" du script de v1/villes-horizon.html,
// donc dans la portee du script : il voit et remplace les variables internes. Jamais servi par GitHub Pages.
// Configuration lue dans window.__VH_TEST (posee par tests/helpers/app.js avant le chargement de la page) :
//   terrain : { features:[...] } relief simule (voir tElev), mer a 0 m ailleurs ; fineMissing : pas de relief fin
//   overpass : { places:[elements Overpass] } renvoyes aux requetes de lieux ; [] pour toutes les autres
//   reel : true = aucune simulation du relief ni d'Overpass (harnais de caracterisation : caches rejoues)
{
  const T=window.__VH_TEST||{};
  const log={tiles:[],overpass:[]};
  const vraiTuiles=loadTileData, vraiOverpass=overpassQuery; // reel : le vrai code lit les caches rejoues (voir helpers/cache.js), rien n'est simule

  // ---- relief simule : tuiles Terrarium construites a la demande ----
  // feature : { lat, lon, r (m), h (m) } disque, ou { from:[lat,lon], to:[lat,lon], w (m), h } bande (jetee, digue) ;
  // layer : 'fine' (modele de terrain IGN, bande z13), 'coarse' (modele de surface 30 m, bandes garanties) ou 'both' (defaut)
  const M_LAT=111320, mLon=lat=>111320*Math.cos(lat*D);
  const featBox=f=>{ const pts=f.from?[f.from,f.to]:[[f.lat,f.lon]], ext=(f.r||f.w||0)+50;
    const la=pts.map(p=>p[0]), lo=pts.map(p=>p[1]), dLa=ext/M_LAT, dLo=ext/mLon(la[0]);
    return [Math.min(...la)-dLa,Math.max(...la)+dLa,Math.min(...lo)-dLo,Math.max(...lo)+dLo]; };
  const inFeat=(f,lat,lon)=>{
    if(!f.from) return Math.hypot((lat-f.lat)*M_LAT,(lon-f.lon)*mLon(f.lat))<=f.r;
    const k=mLon(f.from[0]), ax=f.from[1]*k, ay=f.from[0]*M_LAT, bx=f.to[1]*k, by=f.to[0]*M_LAT, px=lon*k, py=lat*M_LAT;
    const dx=bx-ax, dy=by-ay, t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/(dx*dx+dy*dy||1)));
    return Math.hypot(px-ax-t*dx,py-ay-t*dy)<=f.w/2; };
  const tileLat=(z,ts,gy)=>{ const n=Math.PI*(1-2*gy/(ts*Math.pow(2,z))); return Math.atan(Math.sinh(n))/D; };
  const tileLon=(z,ts,gx)=>gx/(ts*Math.pow(2,z))*360-180;
  loadTileData=async function(z,x,y,urlFn,ts,guaranteed){
    log.tiles.push({z,x,y,ts,guaranteed});
    const cfg=T.terrain||{};
    if(!guaranteed&&cfg.fineMissing) return {data:null,fromCache:false,missing:true,sea:false};
    const la0=tileLat(z,ts,(y+1)*ts), la1=tileLat(z,ts,y*ts), lo0=tileLon(z,ts,x*ts), lo1=tileLon(z,ts,(x+1)*ts);
    const feats=(cfg.features||[]).filter(f=>{ const L=f.layer||'both'; if(L!=='both'&&(L==='fine')===guaranteed) return false;
      const b=featBox(f); return b[1]>=la0&&b[0]<=la1&&b[3]>=lo0&&b[2]<=lo1; });
    if(!feats.length) return {data:seaTile(ts),fromCache:false};
    const data=new Uint8ClampedArray(ts*ts*4);
    for(let py=0;py<ts;py++){ const lat=tileLat(z,ts,y*ts+py+0.5);
      for(let px=0;px<ts;px++){ const lon=tileLon(z,ts,x*ts+px+0.5);
        let e=0; for(const f of feats) if(f.h>e&&inFeat(f,lat,lon)) e=f.h;
        const v=e+32768, i=(py*ts+px)*4; data[i]=Math.floor(v/256); data[i+1]=Math.floor(v)%256; data[i+2]=Math.round((v%1)*256); data[i+3]=255; } }
    return {data,fromCache:false};
  };

  // ---- Overpass simule : lieux de la scene pour la requete des lieux, rien pour les autres (tours, statues, sommets...) ----
  overpassQuery=async function(q,ms,parser){
    log.overpass.push(q);
    const isPlaces=!parser&&/node\["place"~"\^\(city\|town\)\$"\]/.test(q);
    return (parser||parseOverpass)({elements:isPlaces?((T.overpass&&T.overpass.places)||[]):[]});
  };

  // ---- capture d'une image : textes ecrits par draw() dans la scene (entre le save() initial et le restore() final) ----
  // Chaque texte : contenu, position, police, couleur, alignement, largeur mesuree et matrice de transformation (rotation des
  // noms inclines, facteur dpr compris). Le ruban de cap et les messages, poses apres la scene, ne sont pas retenus.
  const selSnap=()=>shipSel.ids?{ids:[...shipSel.ids],key:shipSel.key,t:shipSel.t,h:shipSel.h,p:shipSel.p}:null;
  const rec={armed:null,active:false,depth:0,list:[]};
  // enregistreur des traces (tests/helpers/enregistreur.js, pose par addInitScript) : facultatif, absent des tests qui ne comparent que les textes
  const R=window.__enregistreur?window.__enregistreur(ctx):null;
  const o={clearRect:ctx.clearRect,save:ctx.save,restore:ctx.restore,fillText:ctx.fillText};
  ctx.clearRect=function(...a){ if(rec.armed){ rec.active=true; rec.depth=0; rec.list=[]; rec.mem0=[...lblMem]; rec.lane0=[...laneMem]; rec.sel0=selSnap(); if(R) R.demarrer(); } return o.clearRect.apply(this,a); };
  ctx.save=function(){ if(rec.active) rec.depth++; return o.save.call(this); };
  ctx.restore=function(){ const r=o.restore.call(this);
    if(rec.active&&--rec.depth===0){ rec.active=false; if(R) R.arreter(); const done=rec.armed; rec.armed=null; done(rec.list); } return r; };
  ctx.fillText=function(t,x,y,...a){
    if(rec.active&&rec.depth>=1){ const m=this.getTransform(), size=parseFloat((/(\d+(?:\.\d+)?)px/.exec(this.font)||[])[1]||10);
      rec.list.push({text:String(t),x,y,font:this.font,size,fill:String(this.fillStyle),align:this.textAlign,baseline:this.textBaseline,
        w:this.measureText(t).width,m:[m.a,m.b,m.c,m.d,m.e,m.f],dpr,alpha:this.globalAlpha}); }
    return o.fillText.call(this,t,x,y,...a); };

  if(T.reel){ loadTileData=vraiTuiles; overpassQuery=vraiOverpass; }

  window.__vh={
    ev:s=>eval(s), // acces aux variables internes : __vh.ev('terrain.h0'), __vh.ev('S.headOff=90')
    log,
    // prochaine image complete ; les memoires d'une image a l'autre (mobiles 0,4 s, choix des bateaux, mesure des boutons) sont
    // remises a zero : l'horloge des tests est figee, elles ne se perimeraient jamais
    frame:()=>new Promise(res=>{ _mobCacheAt=0; shipSel={ids:null}; uiObsT=0; rec.armed=res; }),
    // idem, avec les traces du canvas (stroke / fill / texte) de la scene : { textes, ops, mem0, mem1 } (memoire de placement des noms avant et apres l'image) ; exige window.__enregistreur
    frameOps:(garder)=>new Promise(res=>{ if(!garder){ _mobCacheAt=0; shipSel={ids:null}; } uiObsT=0; rec.armed=list=>res({textes:list,ops:R?R.evenements():[],mem0:rec.mem0,mem1:[...lblMem],lane0:rec.lane0,lane1:[...laneMem],infraStats:{...infraStats},sel0:rec.sel0,sel1:selSnap()}); }),
  };
}
