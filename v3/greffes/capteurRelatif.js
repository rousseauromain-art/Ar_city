// Greffe « capteurRelatif » (remplacement, éteinte par défaut) : action B de docs/VEILLE-ANCRAGE.md (v2 : entrees/capteurs.js `axesDepuisQuaternion`,
// entrees/direct.js). Le capteur d'orientation relatif du navigateur (`RelativeOrientationSensor`, quaternion, 60 Hz) remplace les mesures relatives
// (gyroscope) de `deviceorientation` : rotation exacte, sans angles, donc sans singularité caméra vers le haut ou le bas. La boussole
// (`deviceorientationabsolute`) ne sert plus que de nord et de rattrapage lent, comme dans la v1. Repli propre sur `deviceorientation` (API absente,
// page non HTTPS, permission refusée) ; Diagnostic : source, fréquence mesurée, erreur. Point d'entrée : onOrient (mesures relatives) et `relatif` (G.lier).
const RAD=Math.PI/180;
/** Axes de la caméra (v : axe de la caméra arrière, r : droite de l'écran, repère Est/Nord/Haut) depuis un quaternion [x,y,z,w] ; mêmes axes que `camAxes`
 *  de la v1 avec les angles : la rotation appareil → monde est R = Rz(alpha)·Rx(beta)·Ry(gamma), ses colonnes sont les axes x, y, z de l'appareil. */
export function axesDepuisQuaternion(q,angleEcran){
  const n=Math.hypot(q[0],q[1],q[2],q[3])||1, x=q[0]/n, y=q[1]/n, z=q[2]/n, w=q[3]/n;
  const colX=[1-2*(y*y+z*z),2*(x*y+z*w),2*(x*z-y*w)], colY=[2*(x*y-z*w),1-2*(x*x+z*z),2*(y*z+x*w)], colZ=[2*(x*z+y*w),2*(y*z-x*w),1-2*(x*x+y*y)];
  const neg=k=>k.map(m=>-m), r=angleEcran===90?colY:(angleEcran===270||angleEcran===-90)?neg(colY):angleEcran===180?neg(colX):colX;
  return {v:neg(colZ),r};
}
/** Quaternion [x,y,z,w] des angles de `deviceorientation` (alpha, beta, gamma en degrés) : qz(alpha)·qx(beta)·qy(gamma). Sert aux tests. */
export function quaternionDepuisAngles(alpha,beta,gamma){
  const m=(a,b)=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
  const h=d=>d*RAD/2, qz=[0,0,Math.sin(h(alpha)),Math.cos(h(alpha))], qx=[Math.sin(h(beta)),0,0,Math.cos(h(beta))], qy=[0,Math.sin(h(gamma)),0,Math.cos(h(gamma))];
  return m(m(qz,qx),qy);
}
const angleEcran=()=>(screen.orientation&&screen.orientation.angle)??window.orientation??0;
const etat={sonde:null,actif:false,erreur:'',lectures:0,depuis:0,hz:0,total:0};
let c=null;
function arreter(){ try{ if(etat.sonde) etat.sonde.stop(); }catch(e){} etat.sonde=null; etat.actif=false; }
function lecture(s){
  const t=Date.now(), premiere=!etat.actif;
  if(premiere){ etat.actif=true; etat.erreur=''; c.logNet('Cap',true,'capteur d’orientation relatif actif (quaternion, 60 Hz) : il remplace le gyroscope de deviceorientation'); }
  etat.lectures++; etat.total++;
  if(!etat.depuis) etat.depuis=t; else if(t-etat.depuis>=1000){ etat.hz=Math.round(etat.lectures*1000/(t-etat.depuis)); etat.lectures=0; etat.depuis=t; }
  // premier quaternion : son repère n'est pas celui de deviceorientation → repère du gyroscope réappris (comme une réouverture)
  if(s.quaternion) c.relatif(axesDepuisQuaternion(s.quaternion,angleEcran()),premiere);
}
export default {
  init(ctx){
    c=ctx;
    const Classe=window.RelativeOrientationSensor;
    if(!Classe){ etat.erreur='RelativeOrientationSensor indisponible (navigateur ou page non HTTPS) : deviceorientation'; return; }
    try{
      const s=new Classe({frequency:60,referenceFrame:'device'});
      s.addEventListener('reading',()=>lecture(s));
      s.addEventListener('error',ev=>{ const avant=etat.actif; etat.erreur=`capteur relatif refusé ou absent (${(ev&&ev.error&&ev.error.name)||'erreur'}) : deviceorientation`; arreter(); if(avant) c.relatif(null,true); c.logNet('Cap',false,etat.erreur); });
      etat.sonde=s; s.start();
    }catch(e){ etat.erreur='capteur relatif impossible : '+(e&&e.message||e); etat.sonde=null; }
  },
  /** Point d'entrée de onOrient : vrai quand les quaternions remplacent les mesures relatives de deviceorientation. */
  enService:()=>etat.actif,
  axesDepuisQuaternion, quaternionDepuisAngles, etat:()=>({actif:etat.actif,erreur:etat.erreur,hz:etat.hz,total:etat.total}),
  statut:()=>`capteurRelatif : ${etat.actif?`quaternion à ${etat.hz||'?'} Hz (${etat.total} lectures)`:'deviceorientation'}${etat.erreur?' · '+etat.erreur:''}`,
};
