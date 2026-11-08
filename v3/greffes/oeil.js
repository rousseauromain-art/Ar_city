// Greffe « oeil » (ajout, éteinte par défaut) : puce « œil » juste sous la puce du rayon (v2/src/ui/oeil.js, scene/oeil-gps.js, noyau/geoide.js).
// Au toucher : sol estimé et hauteur de l'œil, curseur de correction, étage, « Réestimer » (correction remise à 0, relief recalculé), et l'altitude GPS en
// SIMPLE PROPOSITION (« GPS : +X m (±Y m) » et « Appliquer ») si la médiane d'au moins 10 mesures sur 20 s s'écarte du sol d'au moins 10 m avec une précision
// de 10 m au plus ; le géoïde EGM96 est retranché sur Android (altitude au-dessus de l'ellipsoïde). Jamais appliqué tout seul.
// Tout passe par les commandes de la v1 (curseur #obsH, étage #floorN des Réglages) : même calcul, même mémoire. Aucun point d'entrée dans le code de la v1.
import {PAS_DEG,LIGNES,COLONNES,GRILLE_DM} from './_geoide-egm96.js';
export const MESURES_MIN=10, ECHANTILLON_MIN_MS=20000, PRECISION_MAX_M=10, ECART_PROPOSITION_M=10, HISTORIQUE_MS=60000;
export function ondulationGeoide(lat,lon){
  const la=Math.max(-90,Math.min(90,lat)), lo=((((lon+180)%360)+360)%360)-180, fy=(la+90)/PAS_DEG, fx=(lo+180)/PAS_DEG;
  const y0=Math.min(LIGNES-2,Math.floor(fy)), x0=Math.min(COLONNES-2,Math.floor(fx)), ty=fy-y0, tx=fx-x0, v=(y,x)=>GRILLE_DM[y*COLONNES+x]/10;
  return (v(y0,x0)*(1-tx)+v(y0,x0+1)*tx)*(1-ty)+(v(y0+1,x0)*(1-tx)+v(y0+1,x0+1)*tx)*ty;
}
const mediane=v=>{ if(!v.length) return null; const s=v.slice().sort((a,b)=>a-b), m=s.length>>1; return s.length%2?s[m]:(s[m-1]+s[m])/2; };
/** Pur (v2/src/scene/oeil-gps.js) : proposition de correction d'après les mesures {t, alt, prec} et le sol. */
export function proposer(mesures,solM,ondulationM=0){
  const ok=mesures.filter(m=>typeof m.alt==='number'&&Number.isFinite(m.alt)), n=ok.length, duree=n?ok[n-1].t-ok[0].t:0;
  const med=mediane(ok.map(m=>m.alt-ondulationM)), prec=mediane(ok.map(m=>m.prec).filter(p=>typeof p==='number'&&Number.isFinite(p)));
  const r={n,duree,med,prec,proposee:false,raison:'',correction:null};
  if(solM==null||Number.isNaN(solM)) return {...r,raison:'sol inconnu'};
  if(n<MESURES_MIN) return {...r,raison:`pas assez de mesures (${n} sur ${MESURES_MIN})`};
  if(duree<ECHANTILLON_MIN_MS) return {...r,raison:`échantillon trop court (${Math.round(duree/1000)} s sur ${ECHANTILLON_MIN_MS/1000})`};
  if(prec==null) return {...r,raison:'précision de l’altitude inconnue'};
  if(prec>PRECISION_MAX_M) return {...r,raison:`précision trop faible (±${Math.round(prec)} m)`};
  const ecart=med-solM; if(Math.abs(ecart)<ECART_PROPOSITION_M) return {...r,raison:`écart au sol de ${Math.round(ecart)} m (moins de ${ECART_PROPOSITION_M} m)`};
  return {...r,proposee:true,correction:Math.max(-30,Math.min(250,Math.round(ecart-1.6)))};
}
let c=null; const mesures=[];
const fmt=v=>(v>0?'+':v<0?'−':'')+Math.abs(v)+' m';
const android=()=>/Android/i.test(navigator.userAgent||'');
function regler(v){ const s=c.$('obsH'); if(!s) return; s.value=String(v); s.dispatchEvent(new Event('input')); s.dispatchEvent(new Event('change')); }
function etage(n){ const f=c.$('floorN'); if(!f) return; f.value=String(n); f.dispatchEvent(new Event('change')); }
function propositionIci(){ const p=c.pos, sol=c.obsGround; if(c.photoMode||!p) return null; return proposer(mesures,sol,android()?ondulationGeoide(p.lat,p.lon):0); }
function majPuce(){
  const chip=c.$('g3Eye'); if(!chip) return;
  const S=c.S, sol=c.obsGround, p=propositionIci(), propose=!!p&&p.proposee&&Math.abs(p.correction-S.obsHeight)>=3;
  chip.textContent=`œil ${S.obsHeight?fmt(S.obsHeight):sol==null?'?':'+0 m'}${propose?' · GPS ?':''}`;
  const pop=c.$('g3EyePop'); if(!pop||pop.hidden) return;
  c.$('g3EyeT').textContent=sol==null?'Sol inconnu : relief en cours de calcul (la correction s’appliquera dès qu’il est calculé)':`Sol estimé ${Math.round(sol)} m${c.obsGroundSrc?` (${c.obsGroundSrc})`:''} · correction ${fmt(S.obsHeight)} → œil à ${Math.round(Math.max(1,sol+1.6+S.obsHeight))} m`;
  c.$('g3EyeQ').value=String(S.obsHeight);
  c.$('g3EyeGps').hidden=!propose; c.$('g3EyeP').textContent=propose?`GPS : ${fmt(p.correction)} (±${Math.round(p.prec)} m)`:(p&&!p.proposee&&p.n?`GPS : ${p.raison}`:'');
}
export default {
  init(ctx){
    c=ctx;
    const st=document.createElement('style');
    st.textContent='#g3Eye{pointer-events:auto;cursor:pointer}#g3EyePop{pointer-events:auto;white-space:normal;max-width:min(320px,80vw);line-height:1.4;display:flex;flex-direction:column;gap:6px}#g3EyePop[hidden]{display:none}#g3EyePop .r{display:flex;gap:6px;align-items:center;flex-wrap:wrap}#g3EyePop button{font:600 12px var(--mono);color:var(--cream);border:1px solid var(--line);border-radius:3px;padding:6px 9px;min-height:32px}#g3EyePop input[type=number]{width:4.5em}';
    document.head.appendChild(st);
    const rad=c.$('radChip'); if(!rad) return;
    const chip=document.createElement('button'); chip.id='g3Eye'; chip.className='chip'; chip.setAttribute('aria-label','Hauteur de l’œil');
    const pop=document.createElement('div'); pop.id='g3EyePop'; pop.className='chip'; pop.hidden=true;
    pop.innerHTML='<span id="g3EyeT"></span><input type="range" id="g3EyeQ" min="-30" max="250" step="1" aria-label="Correction de la hauteur d’œil">'
      +'<div class="r"><button id="g3EyeRe">Réestimer</button><label>étage <input type="number" id="g3EyeEt" min="0" max="80" step="1" inputmode="numeric" placeholder="ex. 7"></label></div>'
      +'<div class="r"><span id="g3EyeP"></span><button id="g3EyeGps" hidden>Appliquer</button></div>';
    const radPop=c.$('radPop'); (radPop||rad.parentNode).after(chip); chip.after(pop); // sous la ligne du rayon : jamais sous la colonne de boutons
    let ferme=0; const refermer=()=>{ clearTimeout(ferme); ferme=setTimeout(()=>{ pop.hidden=true; },8000); };
    chip.addEventListener('click',()=>{ pop.hidden=!pop.hidden; if(!pop.hidden){ refermer(); majPuce(); } });
    c.$('g3EyeQ').addEventListener('input',e=>{ regler(+e.target.value); refermer(); majPuce(); });
    c.$('g3EyeEt').addEventListener('change',e=>{ const n=parseInt(e.target.value,10); if(n>=0) etage(n); refermer(); majPuce(); });
    c.$('g3EyeRe').addEventListener('click',()=>{ regler(0); c.note('Hauteur d’œil réestimée d’après le relief',4000); refermer(); majPuce(); });
    c.$('g3EyeGps').addEventListener('click',()=>{ const p=propositionIci(); if(!p||!p.proposee){ c.note('Aucune proposition du GPS pour l’instant',4000); return; }
      regler(p.correction); c.note(`Hauteur d’œil recalée sur le GPS : correction ${fmt(p.correction)} (±${Math.round(p.prec)} m)`,5000); refermer(); majPuce(); });
    // altitude GPS : son propre suivi, ouvert seulement APRÈS la première position reçue par la v1 (ouvert avant, il privait celui de la v1 de positions)
    let suivi=false; const suivre=()=>{ if(suivi||!c.pos||c.photoMode||!navigator.geolocation) return; suivi=true;
      navigator.geolocation.watchPosition(p=>{ const t=Date.now(); mesures.push({t,alt:p.coords.altitude,prec:p.coords.altitudeAccuracy});
        while(mesures.length&&t-mesures[0].t>HISTORIQUE_MS) mesures.shift(); },()=>{},{enableHighAccuracy:true,maximumAge:5000,timeout:20000}); };
    setInterval(()=>{ suivre(); majPuce(); },1000); majPuce();
  },
  mesures, proposer:propositionIci,
};
