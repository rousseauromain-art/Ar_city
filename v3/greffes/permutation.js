// Greffe « permutation » (ajout, éteinte par défaut) : test contre les concordances fortuites de repères dans « Caler auto » (v2 étape 11b :
// v2/src/calage/reperes.js `ajusterSurReperes`, permutation=true ; principe : v2/src/calage/permutation.js). Turin (26/10/2026) : sans le test, des scènes au
// hasard sont acceptées à 100 % ; avec, environ 7 %. On décale chaque repère d'un écart aléatoire (graine fixe) dans la fenêtre de recherche, ce qui détruit
// toute concordance d'ensemble, et l'on compte combien de fois le hasard rassemble autant de repères que le meilleur cap : accepté sous 5 % seulement ;
// un repère seul ne vaut que s'il y a au plus 3 repères dans le champ ; le champ n'est ajusté qu'avec au moins 4 repères. Point d'entrée : landmarkFit.
let c=null;
const RAD=Math.PI/180, wrap=a=>((a+540)%360)-180;
export default {
  init(ctx){ c=ctx; },
  /** Remplace le corps de `landmarkFit(ps)` de la v1 (mêmes entrées, même sortie {ok, corr, cam, names, msg}). */
  ajuster(ps){
    const S=c.S, W=c.W, {WIN,VTOL,AGREE}=c.AC, peaks=c.photoPeaks(ps), lms=c.landmarksForCal(ps), camFov=S.camFov, pitch0=c.pose().pitch;
    if(!lms.length) return {ok:false,msg:'aucun repère fiable (tour, clocher, dôme de hauteur connue) dans le champ'};
    if(!peaks.length) return {ok:false,msg:'aucune pointe nette sur la photo'};
    const hyps=[];
    for(const L of lms){ const cand=peaks.filter(p=>Math.abs(wrap(p.brg-L.c.brg))<=WIN&&Math.abs(p.a-L.aTop)<=VTOL+Math.abs(ps.pitch-pitch0));
      for(const p of cand) hyps.push({corr:wrap(L.c.brg-p.brg),L,p,uniq:cand.length===1}); }
    let best=null;
    for(const h of hyps){ const sup=hyps.filter(o=>Math.abs(wrap(o.corr-h.corr))<AGREE), names=new Set(sup.map(o=>o.L.c.name));
      const score=names.size*10-sup.reduce((s,o)=>s+Math.abs(wrap(o.corr-h.corr)),0);
      if(!best||score>best.score) best={h,sup,n:names.size,score}; }
    const chanceOf=(corrOf,nBest)=>{ let seed=12345; const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647, RUNS=100, cs=hyps.map(corrOf); let hit=0;
      for(let r=0;r<RUNS;r++){ const off=new Map(); for(const L of lms) off.set(L,(rnd()*2-1)*WIN);
        const v=hyps.map((h,i)=>cs[i]+off.get(h.L)); let mx=0;
        for(let i=0;i<v.length&&mx<nBest;i++){ const nm=new Set(); for(let k=0;k<v.length;k++) if(Math.abs(wrap(v[k]-v[i]))<AGREE) nm.add(hyps[k].L); if(nm.size>mx) mx=nm.size; }
        if(mx>=nBest) hit++; }
      return hit/RUNS; };
    const chance=best&&best.n>=2?chanceOf(h=>h.corr,best.n):1;
    let ok=!!best&&((best.n>=2&&chance<0.05)||(best.n===1&&best.h.uniq&&best.h.p.prom>=2&&lms.length<=3)), supSel=ok?best.sup:null;
    const fhOf=cam=>(W/2)/Math.tan(c.vFovFor(cam)/2*RAD), impl=(o,cam)=>wrap(o.L.c.brg-Math.atan(Math.tan(o.p.dd*RAD)*ps.fh/fhOf(cam))/RAD);
    if(!ok&&hyps.length>=2){ let bp=null;
      for(let i=0;i<hyps.length;i++) for(let j=i+1;j<hyps.length;j++){ const a=hyps[i], b=hyps[j]; if(a.L===b.L||Math.abs(a.p.dd-b.p.dd)<8) continue;
        for(let cam=Math.max(20,camFov-12);cam<=Math.min(110,camFov+12);cam+=0.5){ const r=Math.abs(wrap(impl(a,cam)-impl(b,cam))); if(!bp||r<bp.r) bp={r,cam,a,b}; } }
      if(bp&&bp.r<0.2){ const m=impl(bp.a,bp.cam), cam=bp.cam; supSel=hyps.filter(o=>Math.abs(wrap(impl(o,cam)-m))<AGREE); const nz=new Set(supSel.map(o=>o.L)).size;
        ok=nz>=6&&chanceOf(o=>wrap(impl(o,cam)),nz)<0.02; } } // champ déduit : au moins 6 repères et moins de 2 % de chance
    if(!ok||!supSel) return {ok:false,msg:`${lms.length} repère(s), ${peaks.length} pointe(s) : pas de concordance sûre${best&&best.n>=2?` (hasard ${Math.round(chance*100)} %)`:''}`};
    const sup=supSel.filter((o,i,a)=>a.findIndex(q=>q.L===o.L)===i); let corr=sup.reduce((s,o)=>s+o.corr,0)/sup.length, cam=camFov;
    if(sup.length>=4){ const dds=sup.map(o=>o.p.dd), span=Math.max(...dds)-Math.min(...dds);
      if(span>=10){ const xs=sup.map(o=>Math.tan(o.p.dd*RAD)*ps.fh); let bc=null;
        const resid=cc=>{ const fh2=(W/2)/Math.tan(c.vFovFor(cc)/2*RAD), hs=sup.map((o,i)=>wrap(o.L.c.brg-Math.atan(xs[i]/fh2)/RAD)); const m=hs.reduce((s,v)=>s+v,0)/hs.length; return {r:Math.sqrt(hs.reduce((s,v)=>s+(v-m)*(v-m),0)/hs.length),m}; };
        const cur=resid(camFov);
        for(let cc=Math.max(20,camFov-10);cc<=Math.min(110,camFov+10);cc+=0.5){ const q=resid(cc); if(!bc||q.r<bc.r) bc={...q,cam:cc}; }
        if(bc&&bc.r<0.25&&bc.r<cur.r*0.7&&Math.abs(bc.cam-camFov)>=1) cam=bc.cam;
        if(bc&&bc.r<0.25) corr=wrap(bc.m-ps.heading); } }
    return {ok:true,corr,cam,names:sup.map(o=>o.L.c.name)};
  },
};
