// Greffe « lune » (ajout, éteinte par défaut) : calage de nuit sur la lune (v2 étape 11h : v2/src/noyau/astro.js `positionLune`, ui/calage.js `evaluerLune`,
// rendu/lune.js). Quand le soleil est couché, « Caler auto » cherche la tache ronde et brillante près de la position calculée de la lune (même détection
// que le soleil) et corrige cap et horizon ; le symbole de la lune est dessiné à sa position calculée. Points d'entrée : runAutoAlign0 et draw().
import {chercherDisque,positionLune,phaseLune,wrap} from './_astre.js';
const RAD=Math.PI/180;
let c=null;
const luneNow=()=>{ const t=c.sunTime(), p=c.pos; return p&&t?positionLune(t,p.lat,p.lon):null; };
export default {
  init(ctx){ c=ctx; },
  luneNow,
  /** « Caler auto » de nuit : {ok, dh, dp, message} ou {ok:false, msg}. Rien si le soleil est levé (le soleil passe d'abord). */
  caler(){
    const sp=c.sunNow(); if(sp&&sp.el>-1) return {ok:false,msg:'soleil levé'};
    const L=luneNow(); if(!L) return {ok:false,msg:'position inconnue'};
    const r=chercherDisque(c,L,{large:!!(c.photoMode&&c.photoMode.dirWeak),nom:'lune'}); if(!r.ok) return r;
    const dh=wrap(L.az-r.az), dp=L.el-r.el, f=v=>(v>=0?'+':'')+v.toFixed(1)+'°';
    return {ok:true,dh,dp,message:`calé sur la lune (${L.az.toFixed(1)}°, ${L.el.toFixed(1)}° de haut) : cap ${f(dh)}, horizon ${f(dp)}`};
  },
  /** Symbole de la lune (disque argenté, « lune az° · site° · NN % »), dans le repère de la scène (roulis déjà appliqué). */
  dessiner(g,{heading,pitch,fh,FOVH,W,H,FM}){
    const L=luneNow(); if(!L||L.el<=-1) return;
    const dB=wrap(L.az-heading); if(Math.abs(dB)>=Math.min(80,FOVH*0.8)) return;
    const x=W/2+fh*Math.tan(dB*RAD), y=H/2+fh*Math.tan((pitch-L.el)*RAD); if(!(x>-30&&x<W+30&&y>-30&&y<H+30)) return;
    const k=phaseLune(c.sunTime()), t=`lune ${L.az.toFixed(1)}° · ${L.el.toFixed(1)}° · ${Math.round(k*100)} %`;
    g.save(); g.beginPath(); g.arc(x,y,9,0,7); g.fillStyle=`rgba(205,220,240,${(0.25+0.6*k).toFixed(2)})`; g.fill();
    g.strokeStyle='rgba(14,26,43,.85)'; g.lineWidth=4; g.stroke(); g.strokeStyle='#CFE0F5'; g.lineWidth=1.8; g.stroke();
    g.font=`600 11px ${FM}`; g.textAlign='left'; g.lineWidth=3; g.strokeStyle='rgba(14,26,43,.9)'; g.strokeText(t,x+16,y+4); g.fillStyle='#CFE0F5'; g.fillText(t,x+16,y+4); g.restore();
  },
};
