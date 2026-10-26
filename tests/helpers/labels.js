// Geometrie des textes captures par __vh.frame() : boite de chaque texte a l'ecran (px CSS), inclinaison comprise,
// et test de chevauchement exact (axes separateurs), comme polysOverlap dans l'application.

// coins du texte dans le repere ecran : largeur mesuree, hauteur ~ taille de police (jambages compris), alignement et ligne de base
function textPoly(t){
  const x0=t.align==='center'?t.x-t.w/2:(t.align==='right'||t.align==='end')?t.x-t.w:t.x;
  const up=t.baseline==='middle'?t.size*0.5:t.baseline==='top'?0:t.size*0.75, down=t.baseline==='middle'?t.size*0.5:t.baseline==='top'?t.size:t.size*0.2;
  const [a,b,c,d,e,f]=t.m, k=t.dpr||1;
  return [[x0,t.y-up],[x0+t.w,t.y-up],[x0+t.w,t.y+down],[x0,t.y+down]].map(([x,y])=>[(a*x+c*y+e)/k,(b*x+d*y+f)/k]);
}
function bbox(P){ const xs=P.map(p=>p[0]), ys=P.map(p=>p[1]); return {x0:Math.min(...xs),x1:Math.max(...xs),y0:Math.min(...ys),y1:Math.max(...ys)}; }
// chevauchement de deux polygones convexes, avec une tolerance m (px) : m>0 accepte un contact de m px
function polysOverlap(P,Q,m=0){
  for(const poly of [P,Q]) for(let i=0;i<poly.length;i++){
    const p=poly[i], q=poly[(i+1)%poly.length], L=Math.hypot(q[0]-p[0],q[1]-p[1])||1, nx=-(q[1]-p[1])/L, ny=(q[0]-p[0])/L;
    let p0=Infinity,p1=-Infinity,q0=Infinity,q1=-Infinity;
    for(const [x,y] of P){ const v=x*nx+y*ny; p0=Math.min(p0,v); p1=Math.max(p1,v); }
    for(const [x,y] of Q){ const v=x*nx+y*ny; q0=Math.min(q0,v); q1=Math.max(q1,v); }
    if(p1-m<=q0||q1-m<=p0) return false;
  }
  return true;
}
// paires de textes qui se chevauchent (au-dela de m px)
function overlaps(texts,m=1){
  const P=texts.map(textPoly), out=[];
  for(let i=0;i<P.length;i++) for(let j=i+1;j<P.length;j++) if(polysOverlap(P[i],P[j],m)) out.push([texts[i].text,texts[j].text]);
  return out;
}
const rectPoly=r=>[[r.left,r.top],[r.right,r.top],[r.right,r.bottom],[r.left,r.bottom]];
// textes poses (meme en partie) sur un rectangle de l'interface {left,right,top,bottom}
function textsOver(texts,rects){ return texts.filter(t=>rects.some(r=>polysOverlap(textPoly(t),rectPoly(r),0))); }

module.exports={textPoly,bbox,polysOverlap,overlaps,textsOver};
