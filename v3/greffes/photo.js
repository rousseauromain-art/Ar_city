// Greffe « photo » (remplacement, éteinte par défaut) — plan du 16/11, lot R5 : mode photo (constats K8, K11).
// Dans la v1, une photo rejouée est recadrée pour remplir l'écran (object-fit: cover : en paysage, 45 % de sa hauteur hors de l'écran),
// « Caler » ne lit que la partie affichée, en projection approchée, et change le champ ; rien n'est retenu d'une ouverture à l'autre ;
// une photo est toujours supposée d'aplomb ; aucun geste ne permet de se déplacer dans la photo ni de la grossir. Greffe allumée :
//  - photo ENTIÈRE à l'ouverture : la scène (canevas de la v1, W×H) prend exactement le cadre de la photo, centré dans l'écran (bandes noires
//    autour) ; toutes les lectures de la v1 (Caler, soleil, visibilité d'après la photo) voient donc la photo entière, sans rien réécrire ;
//  - un bouton de mode, deux états : « Caler » (glisser = cap et horizon, pincer = champ, comme la v1 ; tourner à deux doigts = rotation du
//    relief et des noms, ±15°) et « Explorer » (glisser = se déplacer dans la photo, pincer = grossir, le calque suit l'image ; double toucher =
//    photo entière ; toucher un nom ouvre toujours sa fiche). En direct, le même bouton verrouille le calage (glisser et pincer ne changent rien) ;
//  - calage retenu par photo (nom, taille, date du fichier) : cap, horizon, champ et rotation ; une photo déjà calée se rouvre calée ;
//  - sinon, « Caler » est lancé tout seul à l'ouverture ; une puce dit « calée automatiquement » et permet d'annuler. Pour la photo, « Caler »
//    lit la photo entière, en projection exacte (si la greffe projection est allumée : les points lus sont ramenés dans le repère de la v1) et
//    laisse le champ tel quel. Un échec ne change rien.
// Les gestes : la greffe écoute les doigts avant la v1 et lui renvoie chaque événement en coordonnées du canevas (décalé dans l'écran, grossi en
// mode Explorer) : les gestionnaires de la v1 ne changent pas.
// Points d'entrée : resize (cadre), pose (rotation), enterPhoto / exitPhoto, draw (obstacles en coordonnées du canevas), runAutoAlign0 (points
// redressés), fitHorizon (champ fixe pour une photo).
const RAD=Math.PI/180;
export const ZOOM_MAX=8, ROTATION_MAX=15, SEUIL_ROTATION=4, SEUIL_PINCE=0.06, DOUBLE_MS=320, TAP_MS=450, TAP_PX=8, CLE='vh3_calages', MAX_CALAGES=300;

/** Cadre de la photo (w×h px) contenue dans un écran Wv×Hv, centrée. → {x,y,w,h} en px entiers. Pure. */
export function cadreContenu(Wv,Hv,w,h){
  const s=Math.min(Wv/w,Hv/h), cw=Math.max(1,Math.round(w*s)), ch=Math.max(1,Math.round(h*s));
  return {x:Math.round((Wv-cw)/2),y:Math.round((Hv-ch)/2),w:cw,h:ch};
}
/** Clé d'une photo pour la mémoire des calages : nom, taille et date du fichier. Pure. */
export function cleDe(f){ return f?`${f.name||''}|${f.size||0}|${f.lastModified||0}`:null; }
/** Vue d'Explorer {z,tx,ty} bornée : grossissement 1 à ZOOM_MAX ; une photo plus grande que l'écran le couvre toujours, une plus petite reste centrée. Pure. */
export function borner(v,cadre,Wv,Hv){
  const z=Math.max(1,Math.min(ZOOM_MAX,v.z||1)); if(z<=1.0005) return {z:1,tx:0,ty:0};
  const axe=(t,o,l,V)=>{ const L=l*z; return L>=V?Math.max(V-L-o,Math.min(-o,t)):(V-L)/2-o; };
  return {z,tx:axe(v.tx,cadre.x,cadre.w,Wv),ty:axe(v.ty,cadre.y,cadre.h,Hv)};
}
/** Grossit la vue de `k` autour du point d'écran (cx,cy) : le point de la photo sous les doigts reste sous les doigts. Pure (non bornée). */
export function zoomer(v,cx,cy,k,cadre){
  const z=v.z*k, ux=(cx-cadre.x-v.tx)/v.z, uy=(cy-cadre.y-v.ty)/v.z;
  return {z,tx:cx-cadre.x-ux*z,ty:cy-cadre.y-uy*z};
}
/** Point d'écran → coordonnées du canevas (W×H), d'après le rectangle affiché du canevas `r` (getBoundingClientRect). Pure. */
export function versLocal(x,y,r,W,H){ return r&&r.width>0&&r.height>0?[(x-r.left)*W/r.width,(y-r.top)*H/r.height]:[x,y]; }
/** Angle (°) du segment de a à b, et écart signé entre deux angles (−180…180). Pures. */
export const angleDe=(a,b)=>Math.atan2(b.y-a.y,b.x-a.x)/RAD;
export const ecartAngle=(a0,a1)=>((((a1-a0)%360)+540)%360)-180;

let c=null, mode='caler', verrou=false, vue={z:1,tx:0,ty:0}, cadre=null, roulis=0, cle=null, cadreActif=false;
let etat={pret:true,auto:null,message:'',repris:false}, utilisateur=false, dernier=null, puceT=null;
const doigts=new Map(); let geste=null, tapPrec=null, tapT=null;
const lireMemoire=()=>{ try{ return JSON.parse(localStorage.getItem(CLE)||'{}')||{}; }catch(e){ return {}; } };
const ecrireMemoire=m=>{ try{ const k=Object.keys(m); if(k.length>MAX_CALAGES){ k.sort((a,b)=>(m[a].t||0)-(m[b].t||0)); for(const x of k.slice(0,k.length-MAX_CALAGES)) delete m[x]; } localStorage.setItem(CLE,JSON.stringify(m)); }catch(e){} };
const calageActuel=()=>({h:+c.S.headOff.toFixed(3),p:+c.S.pitchOff.toFixed(3),cam:c.S.camFov,r:+roulis.toFixed(2)});
const memeCalage=(a,b)=>a&&b&&Math.abs(a.h-b.h)<0.01&&Math.abs(a.p-b.p)<0.01&&a.cam===b.cam&&Math.abs(a.r-b.r)<0.01;
function retenir(force){
  if(!cle||!c.photoMode) return; const k=calageActuel(); if(!force&&memeCalage(k,dernier)) return;
  const m=lireMemoire(); m[cle]={...k,t:Date.now()}; ecrireMemoire(m); dernier=k;
}
function appliquer(k){
  c.S.headOff=k.h; c.S.pitchOff=k.p; if(k.cam){ c.S.camFov=k.cam; const f=c.$('fov'); if(f) f.value=k.cam; c.showFov(); } roulis=Math.max(-ROTATION_MAX,Math.min(ROTATION_MAX,k.r||0));
  c.bumpCities();
}

// ---------- cadre et vue ----------
const ov=()=>c.$('ov'), img=()=>c.$('photoBg');
function poser(){
  for(const el of [img(),ov()]){ if(!el) continue; const s=el.style;
    if(!cadreActif){ for(const p of ['left','top','right','bottom','width','height','transform','transformOrigin']) s[p]=''; continue; }
    s.left=cadre.x+'px'; s.top=cadre.y+'px'; s.right='auto'; s.bottom='auto'; s.width=cadre.w+'px'; s.height=cadre.h+'px'; s.transformOrigin='0 0';
    s.transform=vue.z===1&&!vue.tx&&!vue.ty?'':`translate(${vue.tx}px,${vue.ty}px) scale(${vue.z})`; }
}
function local(x,y){ const o=ov(); return versLocal(x,y,o&&o.getBoundingClientRect(),c.W,c.H); }

// ---------- bouton de mode ----------
const ICONE={caler:'<svg viewBox="0 0 24 24"><path d="M12 3v18M3 12h18M12 3l-2.5 2.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5"/></svg>',
  explorer:'<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21M10.5 7.5v6M7.5 10.5h6"/></svg>',
  verrou:'<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  libre:'<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/></svg>'};
function majBouton(){
  const b=c.$('g3Mode'); if(!b) return;
  const photo=!!c.photoMode, k=photo?mode:(verrou?'verrou':'libre');
  b.innerHTML=ICONE[k]+`<span class="g3ModeT">${photo?(mode==='caler'?'Caler':'Explorer'):(verrou?'Verrouillé':'Libre')}</span>`;
  b.classList.toggle('on',photo?mode==='explorer':verrou);
  const t=photo?(mode==='caler'?'Mode Caler : glisser = cap et horizon, pincer = champ, tourner à deux doigts = rotation. Toucher : passer en Explorer'
    :'Mode Explorer : glisser = se déplacer, pincer = grossir, toucher deux fois = photo entière. Toucher : revenir à Caler')
    :(verrou?'Calage verrouillé : glisser et pincer ne le changent plus. Toucher : déverrouiller':'Toucher : verrouiller le calage');
  b.title=t; b.setAttribute('aria-label',t); b.setAttribute('aria-pressed',String(photo?mode==='explorer':verrou));
}
function basculer(){
  if(c.photoMode){ mode=mode==='caler'?'explorer':'caler';
    c.note(mode==='explorer'?'Explorer : glisser pour se déplacer dans la photo, pincer pour grossir, toucher deux fois pour la revoir entière':'Caler : glisser = cap et horizon, pincer = champ, tourner à deux doigts = rotation (±15°)',4500); }
  else { verrou=!verrou; c.note(verrou?'Calage verrouillé : glisser et pincer ne le changent plus':'Calage déverrouillé',3000); }
  majBouton();
}
function monter(){
  const tools=c.$('tools'); if(!tools||c.$('g3Mode')) return;
  const st=document.createElement('style'); st.textContent='#g3Mode{position:relative}#g3Mode .g3ModeT{position:absolute;left:0;right:0;bottom:-1px;font:600 7.5px/1 var(--mono);letter-spacing:0;text-align:center;pointer-events:none}'
    +'#g3Mode.on{color:#FFD23F}#g3Cale{pointer-events:auto;cursor:pointer;color:#8FE3A0;border:1px solid rgba(143,227,160,.5);white-space:normal}';
  document.head.appendChild(st);
  const b=document.createElement('button'); b.id='g3Mode'; b.type='button'; b.onclick=basculer; tools.appendChild(b); majBouton();
  const pc=c.$('photoChip'); if(pc&&!c.$('g3Cale')){ const p=document.createElement('div'); p.id='g3Cale'; p.className='chip'; p.hidden=true; pc.after(p);
    p.onclick=()=>annuler(); }
}

// ---------- gestes ----------
const gestesIci=()=>!!c.photoMode||verrou;
const cibleScene=t=>{ const o=ov(), i=img(), s=c.$('stage'); return t===o||t===i||t===s; };
function relayer(e,x,y){
  const ev=new PointerEvent(e.type,{pointerId:e.pointerId,pointerType:e.pointerType,isPrimary:e.isPrimary,clientX:x,clientY:y,screenX:e.screenX,screenY:e.screenY,
    button:e.button,buttons:e.buttons,width:e.width,height:e.height,pressure:e.pressure,bubbles:true,cancelable:true,composed:true});
  ev.__g3photo=true; ov().dispatchEvent(ev);
}
function toucherIci(x,y){ const q=local(x,y); c.toucherEcran(q[0],q[1]); }
function surDown(e){
  if(e.__g3photo||!gestesIci()||!cibleScene(e.target)) return;
  e.stopPropagation(); doigts.set(e.pointerId,{x:e.clientX,y:e.clientY,x0:e.clientX,y0:e.clientY,t:Date.now()});
  if(c.photoMode&&mode==='caler'){ utilisateur=true;
    if(doigts.size===2){ const [a,b]=[...doigts.values()]; geste={type:'deux',a0:angleDe(a,b),d0:Math.hypot(a.x-b.x,a.y-b.y)||1,r0:roulis,rot:false}; }
    const q=local(e.clientX,e.clientY); relayer(e,q[0],q[1]); return; }
  // Explorer (photo) ou calage verrouillé (direct) : la greffe garde le geste
  if(doigts.size===1) geste={type:'un',v0:{...vue},moved:false};
  else if(doigts.size===2){ const [a,b]=[...doigts.values()]; geste={type:'pince',v0:{...vue},d0:Math.hypot(a.x-b.x,a.y-b.y)||1,cx:(a.x+b.x)/2,cy:(a.y+b.y)/2,moved:true}; }
}
function surMove(e){
  if(e.__g3photo||!doigts.has(e.pointerId)) return;
  e.stopPropagation(); const d=doigts.get(e.pointerId); d.x=e.clientX; d.y=e.clientY;
  if(c.photoMode&&mode==='caler'){
    if(geste&&geste.type==='deux'&&doigts.size>=2){ const [a,b]=[...doigts.values()], da=ecartAngle(geste.a0,angleDe(a,b)), k=(Math.hypot(a.x-b.x,a.y-b.y)||1)/geste.d0;
      if(!geste.rot&&Math.abs(da)>=SEUIL_ROTATION&&Math.abs(k-1)<SEUIL_PINCE) geste.rot=true; // tourner sans écarter : rotation, le champ ne bouge plus
      if(geste.rot){ roulis=Math.max(-ROTATION_MAX,Math.min(ROTATION_MAX,geste.r0+da)); c.bumpCities(); c.note(`Rotation ${roulis>=0?'+':''}${roulis.toFixed(1)}°`,1200); return; } }
    const q=local(e.clientX,e.clientY); relayer(e,q[0],q[1]); return; }
  if(!geste) return;
  if(geste.type==='un'&&Math.hypot(d.x-d.x0,d.y-d.y0)>TAP_PX) geste.moved=true;
  if(!c.photoMode) return; // calage verrouillé en direct : rien ne bouge
  const Wv=innerWidth, Hv=innerHeight;
  if(geste.type==='un'&&doigts.size===1){ if(!geste.moved) return;
    vue=borner({z:geste.v0.z,tx:geste.v0.tx+d.x-d.x0,ty:geste.v0.ty+d.y-d.y0},cadre,Wv,Hv); poser(); return; }
  if(geste.type==='pince'&&doigts.size>=2){ const [a,b]=[...doigts.values()], k=(Math.hypot(a.x-b.x,a.y-b.y)||1)/geste.d0, cx=(a.x+b.x)/2, cy=(a.y+b.y)/2;
    const v=zoomer(geste.v0,geste.cx,geste.cy,k,cadre); v.tx+=cx-geste.cx; v.ty+=cy-geste.cy; vue=borner(v,cadre,Wv,Hv); poser(); }
}
function surUp(e){
  if(e.__g3photo||!doigts.has(e.pointerId)) return;
  e.stopPropagation(); const d=doigts.get(e.pointerId); doigts.delete(e.pointerId);
  if(c.photoMode&&mode==='caler'){
    const rot=geste&&geste.rot, q=local(e.clientX,e.clientY); relayer(e,q[0],q[1]); // fin d'un geste à deux doigts : la v1 n'y voit ni toucher ni glisser
    if(!doigts.size){ geste=null; if(rot) c.saveSettings(); } return; }
  if(e.type==='pointercancel'){ if(!doigts.size) geste=null; return; }
  const tap=geste&&geste.type==='un'&&!geste.moved&&Date.now()-d.t<TAP_MS; if(!doigts.size) geste=null;
  if(!tap) return;
  if(c.photoMode&&tapPrec&&Date.now()-tapPrec.t<DOUBLE_MS&&Math.hypot(e.clientX-tapPrec.x,e.clientY-tapPrec.y)<30){ // double toucher : photo entière
    clearTimeout(tapT); tapPrec=null; vue={z:1,tx:0,ty:0}; poser(); return; }
  if(!c.photoMode){ toucherIci(e.clientX,e.clientY); return; }
  const x=e.clientX, y=e.clientY; tapPrec={t:Date.now(),x,y}; clearTimeout(tapT); tapT=setTimeout(()=>{ tapPrec=null; toucherIci(x,y); },DOUBLE_MS);
}

// ---------- ouverture ----------
const attendre=ms=>new Promise(r=>setTimeout(r,ms));
/** Départs d'inclinaison essayés à l'ouverture (° autour de l'horizon de départ) : la photo entière peut avoir son horizon n'importe où, et la v1
 *  ne cherche le bord du relief que dans une bande de quelques degrés autour de l'horizon attendu. */
export const DEPARTS=[0,-6,6,-12,-18,-24];
/** Un calage trouvé depuis un seul départ peut être une concordance fortuite (photo de Pont-en-Royans en 24 mm : cap faux de 16° à ±0,18°) :
 *  il faut qu'un autre départ retombe au même endroit, à ACCORD_DEG près en cap et en horizon. */
export const ACCORD_DEG=1.5, APPUIS_MIN=1;
/** Nombre d'autres essais qui retombent au même calage que `e`. Pure. */
export function appuis(e,liste){ return liste.filter(o=>o!==e&&Math.abs(((((o.k.h-e.k.h)%360)+540)%360)-180)<=ACCORD_DEG&&Math.abs(o.k.p-e.k.p)<=ACCORD_DEG).length; }
/** Résultat d'un essai de « Caler » d'après son message : précision du relief (°), calage sur des repères, horizon seul, ou échec. Pure. */
export function lireEssai(msg){
  const m=/^calé : .*précision ±([\d.]+)°/.exec(msg||''); if(m) return {genre:'relief',cout:+m[1]};
  if(/^calé sur (?!le soleil|la lune)/.test(msg||'')) return {genre:'reperes',cout:null};
  if(/^horizon/.test(msg||'')) return {genre:'horizon',cout:null};
  return {genre:'echec',cout:null};
}
/** Calage automatique de l'ouverture : « Caler » sur le relief (ou les repères) depuis plusieurs inclinaisons de départ, le plus précis gagne ;
 *  le soleil n'y sert pas (sur la photo entière, des nuages éclairés passent pour lui : trois photos de Pont-en-Royans sur quatre faussées de 15 à
 *  23°) ; il reste au bouton « Caler ». Un échec ne change rien. */
async function caleAuto(pm,force){
  etat={pret:false,auto:null,message:'calage automatique en cours',repris:false};
  const t0=Date.now(); while(Date.now()-t0<30000&&c.photoMode===pm&&(!c.terrain||c.terrainBusy||c.terrain.refining)) await attendre(150); // relief complet : le relief lointain seul donne un autre calage
  if(c.photoMode!==pm){ etat={...etat,pret:true,message:'photo quittée'}; return; }
  if(utilisateur&&!force){ etat={...etat,pret:true,message:'calé à la main pendant le chargement du relief : pas de calage automatique'}; return; }
  const avant={...calageActuel()}, utc=pm.utc, essais=[];
  try{
    pm.utc=null; // pas de soleil (ni de lune) pour ce calage
    const essayer=async(h,p)=>{ c.S.headOff=h; c.S.pitchOff=p; let msg=''; try{ msg=await c.runAutoAlign0(); }catch(e){ msg='échec : '+(e&&e.message||e); }
      const r={...lireEssai(msg),msg,k:calageActuel()}; essais.push(r); return r; };
    for(const d of DEPARTS){ if(c.photoMode!==pm) break; await essayer(avant.h,avant.p+d); }
    const reliefs=essais.filter(e=>e.genre==='relief').sort((a,b)=>a.cout-b.cout), meilleur=reliefs.find(e=>appuis(e,reliefs)>=APPUIS_MIN);
    let choix=meilleur||(reliefs.length?null:essais.find(e=>e.genre==='reperes')||(essais[0]&&essais[0].genre==='horizon'?essais[0]:null));
    if(choix&&choix.genre==='relief'){ const r=await essayer(choix.k.h,choix.k.p); if(r.genre==='relief'&&r.cout<=choix.cout+0.02) choix=r; } // affinage depuis le meilleur
    if(choix) appliquer({...avant,h:choix.k.h,p:choix.k.p}); else appliquer(avant);
    const fin=calageActuel(), bouge=!memeCalage(avant,fin), f=v=>(v>=0?'+':'')+v.toFixed(1)+'°';
    const msg=!choix?(reliefs.length?`${reliefs.length} calage(s) sur le relief, aucun retrouvé depuis deux départs`:(essais[0]&&essais[0].msg)||'rien de sûr'):choix.genre==='relief'?`cap ${f(c.wrap(fin.h-avant.h))}, horizon ${f(fin.p-avant.p)}, précision ±${choix.cout.toFixed(2)}°`:choix.msg;
    etat={pret:true,auto:bouge?{avant,apres:fin,genre:choix.genre,cout:choix.cout}:null,message:msg,repris:false,essais:essais.map(e=>({genre:e.genre,cout:e.cout,h:e.k.h,p:e.k.p}))};
    pm.utc=utc;
    if(bouge){ c.saveSettings(); c.noteCalib(); retenir(true); c.calRecord('auto ouverture photo',{h:avant.h,p:avant.p},{msg:msg.slice(0,120)}); c.logNet('Calage',true,`photo calée à l’ouverture : ${msg}`); puce('calée automatiquement · <u>annuler</u>'); }
    else c.note('Photo non calée automatiquement (rien de sûr) : glissez pour caler',3500);
  }finally{ if(pm.utc===null) pm.utc=utc; }
}
function puce(html){ const p=c.$('g3Cale'); if(!p) return; p.innerHTML='📷 '+html; p.hidden=false; clearTimeout(puceT); puceT=setTimeout(()=>{ p.hidden=true; },20000); }
function annuler(){
  const p=c.$('g3Cale'); if(p) p.hidden=true; if(!etat.auto||!c.photoMode) return;
  appliquer(etat.auto.avant); c.saveSettings(); retenir(true); c.note('Calage automatique annulé',3000); etat={...etat,auto:null,message:'annulé'};
}

export default {
  init(ctx){ c=ctx; monter(); setTimeout(monter,0);
    addEventListener('pointerdown',surDown,true); addEventListener('pointermove',surMove,true); addEventListener('pointerup',surUp,true); addEventListener('pointercancel',surUp,true);
    setInterval(()=>{ if(c.photoMode&&cle&&utilisateur&&!doigts.size) retenir(false); },700); },
  cadreContenu,cleDe,borner,zoomer,versLocal,angleDe,ecartAngle,
  /** Point d'entrée de resize : en mode photo, la scène prend le cadre de la photo entière. → {w,h} */
  cadre(Wv,Hv){
    const pm=c.photoMode; if(!pm||!pm.w||!pm.h){ if(cadreActif){ cadreActif=false; poser(); } return {w:Wv,h:Hv}; }
    cadre=cadreContenu(Wv,Hv,pm.w,pm.h); cadreActif=true; vue=borner(vue,cadre,Wv,Hv); poser(); return {w:cadre.w,h:cadre.h};
  },
  /** Point d'entrée de pose : rotation de la photo (°). */
  roulis:()=>c&&c.photoMode?roulis:0,
  /** Point d'entrée d'enterPhoto : photo ouverte (fichier `f`). Calage retenu repris, sinon « Caler » lancé tout seul. */
  ouvrir(f){
    const pm=c.photoMode; if(!pm) return; cle=cleDe(f); vue={z:1,tx:0,ty:0}; roulis=0; mode='caler'; utilisateur=false; dernier=null; doigts.clear(); geste=null;
    const p=c.$('g3Cale'); if(p) p.hidden=true;
    c.resize(); majBouton();
    const m=cle&&lireMemoire()[cle];
    if(m){ appliquer(m); dernier=calageActuel(); utilisateur=true; c.saveSettings(); etat={pret:true,auto:null,message:'calage retenu repris',repris:true};
      c.note(`Calage retenu de cette photo repris (cap ${m.h.toFixed(1)}°${m.r?`, rotation ${m.r>=0?'+':''}${m.r.toFixed(1)}°`:''})`,5000); return; }
    caleAuto(pm);
  },
  /** Point d'entrée d'exitPhoto. */
  fermer(){ if(c.photoMode) return; cle=null; roulis=0; vue={z:1,tx:0,ty:0}; mode='caler'; doigts.clear(); geste=null; const p=c.$('g3Cale'); if(p) p.hidden=true; c.resize(); majBouton(); },
  /** Point d'entrée de draw : obstacles de l'interface (rectangles [x0,x1,y0,y1] en coordonnées d'écran) ramenés dans le canevas de la photo entière. */
  versCadre(placed){
    if(!cadreActif) return; // cadre de la photo entière, sans la vue d'Explorer : grossir ou se déplacer ne refait pas le placement (le calque suit l'image)
    const r={left:cadre.x,top:cadre.y,width:cadre.w,height:cadre.h}, kx=c.W/r.width, ky=c.H/r.height;
    const G=typeof window!=='undefined'&&window.G, inv=G&&G.actif('projection')?G.projection.inverse:null;
    for(const p of placed){ p[0]=(p[0]-r.left)*kx; p[1]=(p[1]-r.left)*kx; p[2]=(p[2]-r.top)*ky; p[3]=(p[3]-r.top)*ky;
      if(inv){ // la v1 place les noms dans son repère, la projection exacte les déplace ensuite : l'obstacle est ramené dans ce repère (photo entière : jusqu'à 30° du centre en hauteur)
        const xs=[], ys=[]; for(let i=0;i<=4;i++) for(let j=0;j<=4;j++){ const x=p[0]+(p[1]-p[0])*i/4, y=p[2]+(p[3]-p[2])*j/4;{ const q=inv(x,y); xs.push(q[0]); ys.push(q[1]); } }
        p[0]=Math.min(...xs); p[1]=Math.max(...xs); p[2]=Math.min(...ys); p[3]=Math.max(...ys); } }
  },
  /** Point d'entrée de runAutoAlign0 : points de l'horizon lus sur la photo (repère de la scène), ramenés dans le repère de la v1 quand le dessin
   *  est en projection exacte : l'ajustement de la v1 devient exact. */
  redresser(pts){
    const G=typeof window!=='undefined'&&window.G; if(!c.photoMode||!G||!G.actif('projection')) return 0;
    for(const p of pts){ const q=G.projection.inverse(p.x,p.y); p.x=q[0]; p.y=q[1]; } return pts.length;
  },
  /** Point d'entrée de fitHorizon : le champ d'une photo n'est pas changé par « Caler ». */
  champFixe:()=>!!(c&&c.photoMode),
  mode:()=>c&&c.photoMode?mode:(verrou?'verrou':'libre'),
  basculer,
  vue:()=>({...vue}),
  etat:()=>({...etat,cle,roulis,mode:c&&c.photoMode?mode:null,cadre:cadre&&{...cadre}}),
  annuler,
  /** Relance le calage automatique de l'ouverture depuis le calage en cours (bancs d'essai). */
  recaler:()=>c&&c.photoMode?caleAuto(c.photoMode,true):null,
  lireEssai,appuis,DEPARTS,
  statut(){ return `photo : ${c&&c.photoMode?`mode ${mode}, vue ×${vue.z.toFixed(2)}, rotation ${roulis.toFixed(1)}° · ${etat.message||'—'}`:(verrou?'calage verrouillé':'en attente d’une photo')}`; },
};
