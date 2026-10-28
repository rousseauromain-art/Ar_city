// Enregistreur des opérations de dessin d'un contexte canvas 2D : à chaque stroke(), fill() ou fillText(), un événement canonique
// (chemin, état utile du contexte). Sert à comparer, sans pixels, ce que la v1 trace et ce que la v2 demande de tracer.
// Script autonome : posé dans la page par page.addInitScript (window.__enregistreur) et importé par les tests Node.
(function(){
  // Path2D : chaque methode de trace est journalisee dans l'objet (utilise pour les pictogrammes, qui sont des Path2D)
  if(typeof Path2D!=='undefined'&&!Path2D.prototype.__suivi){
    const P=Path2D.prototype, r9=v=>typeof v==='number'?Math.round(v*1e9)/1e9:v;
    for(const [nom,code] of [['moveTo','M'],['lineTo','L'],['quadraticCurveTo','Q'],['bezierCurveTo','B'],['arc','A'],['rect','rect'],['roundRect','R'],['closePath','Z']]){
      const orig=P[nom]; P[nom]=function(...a){ (this.__ops||(this.__ops=[])).push([code,...a.map(r9)]); return orig.apply(this,a); };
    }
    P.__suivi=true;
  }
  function enregistreur(ctx){
    let actif=false, chemin=[], events=[];
    const orig={}, noms=['beginPath','moveTo','lineTo','quadraticCurveTo','bezierCurveTo','arc','rect','roundRect','closePath','stroke','fill','fillText','strokeText'];
    for(const n of noms) orig[n]=ctx[n];
    const r=v=>Math.round(v*1e9)/1e9;
    const transf=()=>{ const m=ctx.getTransform(); return [m.a,m.b,m.c,m.d,m.e,m.f].map(r); };
    ctx.beginPath=function(){ chemin=[]; return orig.beginPath.call(this); };
    ctx.moveTo=function(x,y){ chemin.push(['M',r(x),r(y)]); return orig.moveTo.call(this,x,y); };
    ctx.lineTo=function(x,y){ chemin.push(['L',r(x),r(y)]); return orig.lineTo.call(this,x,y); };
    ctx.quadraticCurveTo=function(a,b,c,d){ chemin.push(['Q',r(a),r(b),r(c),r(d)]); return orig.quadraticCurveTo.call(this,a,b,c,d); };
    ctx.bezierCurveTo=function(...a){ chemin.push(['B',...a.map(r)]); return orig.bezierCurveTo.apply(this,a); };
    ctx.arc=function(...a){ chemin.push(['A',...a.map(v=>typeof v==='number'?r(v):v)]); return orig.arc.apply(this,a); };
    ctx.rect=function(...a){ chemin.push(['rect',...a.map(r)]); return orig.rect.apply(this,a); };
    ctx.roundRect=function(x,y,w,h,rad){ chemin.push(['R',r(x),r(y),r(w),r(h),r(rad)]); return orig.roundRect.call(this,x,y,w,h,rad); };
    ctx.closePath=function(){ chemin.push(['Z']); return orig.closePath.call(this); };
    const cheminDe=a=>a&&typeof Path2D!=='undefined'&&a instanceof Path2D?(a.__ops||[]).slice():chemin.slice();
    ctx.stroke=function(...a){ const ch=cheminDe(a[0]); if(actif&&ch.length) events.push({t:'trait',chemin:ch,couleur:String(ctx.strokeStyle),largeur:r(ctx.lineWidth),tirets:ctx.getLineDash().map(r),
      jointure:ctx.lineJoin,extremite:ctx.lineCap,alpha:r(ctx.globalAlpha),m:transf()}); return orig.stroke.apply(this,a); };
    ctx.fill=function(...a){ const ch=cheminDe(a[0]), regle=typeof a[0]==='string'?a[0]:a[1]; if(actif&&ch.length) events.push({t:'remplissage',chemin:ch,couleur:String(ctx.fillStyle),regle,alpha:r(ctx.globalAlpha),m:transf()}); return orig.fill.apply(this,a); };
    ctx.fillText=function(t,x,y,...a){ if(actif) events.push({t:'texte',texte:String(t),x:r(x),y:r(y),police:ctx.font,couleur:String(ctx.fillStyle),alignement:ctx.textAlign,
      ligneDeBase:ctx.textBaseline,alpha:r(ctx.globalAlpha),m:transf()}); return orig.fillText.call(this,t,x,y,...a); };
    ctx.strokeText=function(t,x,y,...a){ if(actif) events.push({t:'contour',texte:String(t),x:r(x),y:r(y),police:ctx.font,couleur:String(ctx.strokeStyle),largeur:r(ctx.lineWidth),jointure:ctx.lineJoin,
      extremite:ctx.lineCap,alignement:ctx.textAlign,ligneDeBase:ctx.textBaseline,alpha:r(ctx.globalAlpha),m:transf()}); return orig.strokeText.call(this,t,x,y,...a); };
    return { demarrer(){ actif=true; chemin=[]; events=[]; }, arreter(){ actif=false; }, evenements(){ return events.slice(); } };
  }
  if(typeof window!=='undefined') window.__enregistreur=enregistreur;
  if(typeof module!=='undefined') module.exports={enregistreur};
})();
