// Greffe « plaque » (ajout, éteinte par défaut) : corriger la position en lisant une plaque de rue (v2 : ui/lire-plaque.js, calage/adresse.js, donnees/adresse.js,
// ui/position-propre.js, scene/pas.js). Bouton « Lire une plaque de rue » en tête des Réglages : image de la caméra → texte (Tesseract.js, chargé au premier
// toucher, français) → adresse (Base Adresse Nationale de l'IGN, à moins de 300 m ; seul le TEXTE lu part, jamais l'image) → position. Le texte lu et l'adresse
// sont affichés ; rien n'est appliqué sans « Appliquer ». La position corrigée avance ensuite avec les pas (accéléromètre, 0,7 m par pas, au cap affiché) ;
// le GPS ne reprend la main que s'il s'en écarte de plus de 2 × sa précision pendant 20 s. Numéro lu : point d'adresse ramené au trottoir (4 m de l'axe de la
// rue) ; nom de rue seul : la position est projetée sur la rue (géométrie OSM par Overpass). Points d'entrée : suivi GPS du bouton « Ouvrir la caméra ».
export const URL_TESSERACT='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.esm.min.js';
export const URL_GEOCODAGE='https://data.geopf.fr/geocodage/search/';
export const RAYON_ADRESSE_M=300, TROTTOIR_M=4, LARGEUR_OCR_PX=1280;
export const SEUIL_PAS=1.2, SEUIL_REARMEMENT=0.3, INTERVALLE_MIN_MS=250, LONGUEUR_PAS_M=0.7, FACTEUR_ECART=2, DUREE_ECART_MS=20000;
const ALPHA_GRAVITE=0.05, RAD=Math.PI/180;

// ---------- texte lu → adresse (v2 calage/adresse.js) ----------
export const normaliser=t=>String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
const TYPES={RUE:'rue',AV:'avenue',AVE:'avenue',AVENUE:'avenue',BD:'boulevard',BLD:'boulevard',BOULEVARD:'boulevard',PL:'place',PLACE:'place',IMP:'impasse',IMPASSE:'impasse',QUAI:'quai',PASSAGE:'passage',ALLEE:'allée',COURS:'cours',CHEMIN:'chemin',ROUTE:'route',SQUARE:'square',VILLA:'villa',RUELLE:'ruelle',PONT:'pont'};
const MOTS_TYPES=Object.keys(TYPES).sort((a,b)=>b.length-a.length).join('|');
const MOTS_VIDES=new Set(['rue','avenue','boulevard','place','impasse','quai','passage','allee','cours','chemin','route','square','villa','ruelle','pont','des','du','de','la','le','les','sur','sous']);
/** Mots clés d'un nom de rue (4 lettres au moins, hors articles et types de voies). */
export const motsCles=rue=>normaliser(rue).split(/[^a-z0-9]+/).filter(m=>m.length>=4&&!MOTS_VIDES.has(m));
/** Texte d'une plaque (OCR bruité) → {numero, rue, requete} ou null. Tolère « L2 » pour « 12 », ponctuation, code postal et ville à la suite, « bis » / « ter ». */
export function lireTexteAdresse(texte){
  const t=String(texte).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Z0-9' -]/g,' ').replace(/\s+/g,' ').trim();
  const m=new RegExp(`(?:^| )(?:([0-9ILO]{1,4})(?: ?(BIS|TER|B|T))? )?(${MOTS_TYPES}) ([A-Z']+(?:[ -][A-Z']+){0,5})`).exec(t);
  if(!m) return null;
  const brut=m[1]&&/\d/.test(m[1])?m[1].replace(/[IL]/g,'1').replace(/O/g,'0'):'', suffixe=brut&&m[2]?(m[2].startsWith('B')?' bis':' ter'):'';
  const nom=m[4].split(/[ ]/).slice(0,5).join(' ').toLowerCase(), type=TYPES[m[3]];
  if(nom.replace(/[^a-z]/g,'').length<3) return null;
  const numero=brut?brut+suffixe:'';
  return {numero,rue:`${type} ${nom}`,requete:`${numero?numero+' ':''}${type} ${nom}`};
}
/** Réponse de la Base Adresse → adresses {type:'numero'|'rue', libelle, point, numero, rue, distM}, à moins de `rayonM`, les plus proches d'abord. */
export function lireReponseBAN(j,pos,rayonM=RAYON_ADRESSE_M){
  return ((j&&j.features)||[]).map(f=>{ const [lon,lat]=(f.geometry&&f.geometry.coordinates)||[NaN,NaN], p=f.properties||{};
    return {type:p.type==='housenumber'?'numero':p.type==='street'?'rue':'',libelle:String(p.label||''),point:{lat,lon},numero:String(p.housenumber||''),rue:String(p.street||p.name||''),distM:distanceM(pos,{lat,lon})}; })
    .filter(a=>Number.isFinite(a.point.lat)&&a.distM<=rayonM&&!!a.type).sort((a,b)=>a.distM-b.distM);
}
/** Le résultat retenu : le numéro lu d'abord, sinon la rue. */
export function choisirAdresse(adresses,lu){
  const cles=motsCles(lu.rue), memeRue=a=>!cles.length||cles.some(w=>normaliser(a.rue).includes(w)), num=a=>a.type==='numero'&&a.numero.toLowerCase()===lu.numero.toLowerCase();
  if(lu.numero){ const n=adresses.find(a=>num(a)&&memeRue(a))||adresses.find(num); if(n) return n; }
  return adresses.find(a=>a.type==='rue'&&memeRue(a))||adresses.find(a=>a.type==='numero'&&memeRue(a))||adresses[0]||null;
}
const projeter=o=>{ const k=111320*Math.cos(o.lat*RAD); return {versM:p=>[(p.lat-o.lat)*111320,(p.lon-o.lon)*k],versGeo:(n,e)=>({lat:o.lat+n/111320,lon:o.lon+e/k})}; };
function pointLePlusProche(ligne,p,o){
  const {versM}=projeter(o), [pn,pe]=versM(p), pts=ligne.map(versM); let m={n:pts[0][0],e:pts[0][1],d:Infinity};
  for(let i=0;i+1<pts.length;i++){ const [an,ae]=pts[i],[bn,be]=pts[i+1], dn=bn-an, de=be-ae, l2=dn*dn+de*de, t=l2?Math.max(0,Math.min(1,((pn-an)*dn+(pe-ae)*de)/l2)):0, n=an+t*dn, e=ae+t*de, d=Math.hypot(pn-n,pe-e); if(d<m.d) m={n,e,d}; }
  return m;
}
/** Position déduite de l'adresse : {ok, pos, ecartM, libelle} ou {ok:false, raison}. `rues` : [{nom, points}] autour de la position (OSM). */
export function positionDepuisAdresse({adresse,rues,pos}){
  const cles=motsCles(adresse.rue), memes=rues.filter(r=>r.nom&&r.points.length>1&&cles.length>0&&cles.some(w=>normaliser(r.nom).includes(w)));
  const {versGeo,versM}=projeter(pos);
  if(adresse.type==='numero'){
    if(!memes.length) return {ok:true,pos:adresse.point,ecartM:Math.hypot(...versM(adresse.point)),libelle:adresse.libelle};
    const [an,ae]=versM(adresse.point), q=memes.map(r=>pointLePlusProche(r.points,adresse.point,pos)).reduce((a,b)=>b.d<a.d?b:a);
    const d=Math.hypot(an-q.n,ae-q.e), k=d>TROTTOIR_M?TROTTOIR_M/d:1, n=q.n+(an-q.n)*k, e=q.e+(ae-q.e)*k;
    return {ok:true,pos:versGeo(n,e),ecartM:Math.hypot(n,e),libelle:adresse.libelle};
  }
  if(!memes.length) return {ok:false,raison:`la géométrie de « ${adresse.rue} » n'est pas connue ici : lisez un numéro`};
  const q=memes.map(r=>pointLePlusProche(r.points,pos,pos)).reduce((a,b)=>b.d<a.d?b:a);
  return {ok:true,pos:versGeo(q.n,q.e),ecartM:q.d,libelle:adresse.libelle};
}

// ---------- position corrigée qui suit les pas (v2 scene/pas.js) ----------
export const distanceM=(a,b)=>Math.hypot((b.lat-a.lat)*111320,(b.lon-a.lon)*111320*Math.cos(a.lat*RAD));
export const etatPasInitial=()=>({base:9.81,arme:true,derniereMs:-Infinity});
/** Un échantillon d'accélération (avec gravité) : {etat, pas}. Pic de la norme au-dessus de la gravité lissée. */
export function detecterPas(etat,a){
  const m=Math.hypot(a.x,a.y,a.z), base=etat.base+(m-etat.base)*ALPHA_GRAVITE, dyn=m-base;
  if(etat.arme&&dyn>SEUIL_PAS&&a.t-etat.derniereMs>=INTERVALLE_MIN_MS) return {etat:{base,arme:false,derniereMs:a.t},pas:true};
  return {etat:{base,arme:etat.arme||dyn<SEUIL_REARMEMENT,derniereMs:etat.derniereMs},pas:false};
}
export function avancer(pos,capDeg,longueurM,n=1){ const d=longueurM*n, c=capDeg*RAD; return {lat:pos.lat+d*Math.cos(c)/111320,lon:pos.lon+d*Math.sin(c)/(111320*Math.cos(pos.lat*RAD))}; }
/** Un fix GPS : la correction tient tant que le GPS reste à moins de 2 × sa précision ; au-delà pendant 20 s, le GPS reprend la main. */
export function surGps(corr,gps){
  if(distanceM(corr.pos,gps.pos)<=FACTEUR_ECART*Math.max(1,gps.precisionM)) return {corr:{...corr,ecartDepuisMs:null},reprise:false};
  const depuis=corr.ecartDepuisMs??gps.t;
  if(gps.t-depuis>=DUREE_ECART_MS) return {corr:null,reprise:true};
  return {corr:{...corr,ecartDepuisMs:depuis},reprise:false};
}

// ---------- la page ----------
let c=null, correction=null, pasEtat=etatPasInitial(), travailleur=null;
const etat={lue:'',adresse:'',source:'',pas:0,reprises:0};
async function ocrTesseract(cv){
  if(!travailleur){ const mod=await import(URL_TESSERACT); travailleur=await (mod.createWorker||mod.default.createWorker)('fra'); }
  return String((await travailleur.recognize(cv)).data.text||'');
}
function imageCamera(){
  const v=c.$('cam'); if(!v||!v.videoWidth) return null;
  const cv=document.createElement('canvas'), k=Math.min(1,LARGEUR_OCR_PX/v.videoWidth); cv.width=Math.round(v.videoWidth*k); cv.height=Math.round(v.videoHeight*k);
  const x=cv.getContext('2d'); if(!x) return null; x.drawImage(v,0,0,cv.width,cv.height); return cv;
}
async function chercherAdresses(texte,pos){
  const url=`${URL_GEOCODAGE}?q=${encodeURIComponent(texte)}&lat=${pos.lat.toFixed(6)}&lon=${pos.lon.toFixed(6)}&limit=5`;
  const r=await c.fetchT(url,{},8000); if(!r.ok) throw new Error('Base Adresse : HTTP '+r.status);
  return lireReponseBAN(await r.json(),pos);
}
/** Rues nommées autour de la position (OSM) : [{nom, points}]. Seulement quand le nom de rue seul a été lu. */
async function ruesAutour(pos,cles){
  if(!cles.length) return [];
  const re=cles.map(w=>w.replace(/[^a-z0-9]/g,'')).join('|'), q=`[out:json][timeout:15];way["highway"]["name"~"${re}",i](around:${RAYON_ADRESSE_M},${pos.lat},${pos.lon});out geom;`;
  try{ const j=await c.overpassQuery(q,15000,j=>j); return ((j&&j.elements)||[]).filter(w=>w.geometry).map(w=>({nom:w.tags&&w.tags.name||'',points:w.geometry.map(g=>({lat:g.lat,lon:g.lon}))})); }
  catch(e){ return []; }
}
const bandeau=()=>document.getElementById('g3PlaqueMsg');
function fermer(){ const b=bandeau(); if(b){ b.hidden=true; b.textContent=''; } }
/** La position corrigée devient la position de la v1, puis suit les pas. */
function imposer(p,source){
  correction={pos:{lat:p.lat,lon:p.lon},ecartDepuisMs:null,pas:0}; etat.source=source;
  c.onNewPos(p.lat,p.lon,TROTTOIR_M); c.logNet('Position',true,`corrigée (${source}) : elle avance avec vos pas ; le GPS ne reprend la main qu'après 20 s d'écart de plus de 2 × sa précision`);
}
function demander(lu,r){
  const b=bandeau(); b.textContent=''; b.hidden=false;
  const ligne=t=>Object.assign(document.createElement('div'),{textContent:t}), bouton=t=>Object.assign(document.createElement('button'),{type:'button',textContent:t});
  const oui=bouton('Appliquer'), non=bouton('Annuler'); oui.id='g3PlaqueOui'; non.id='g3PlaqueNon';
  oui.onclick=e=>{ e.stopPropagation(); imposer(r.pos,'plaque : '+r.libelle); fermer(); c.note(`Position corrigée d'après la plaque (${Math.round(r.ecartM)} m)`,6000); };
  non.onclick=e=>{ e.stopPropagation(); fermer(); c.note('Plaque ignorée',3000); };
  b.append(ligne(`Plaque lue : « ${lu} »`),ligne(`→ ${r.libelle} : votre position serait corrigée de ${Math.round(r.ecartM)} m.`),oui,non);
}
async function lire(){
  if(c.photoMode){ c.note('Lire une plaque : en direct seulement (pas sur une photo)',5000); return; }
  const pos=c.pos; if(!pos){ c.note('Lire une plaque : en attente de la position',4000); return; }
  const cv=imageCamera(); if(!cv){ c.note('Caméra indisponible',4000); return; }
  c.note('Lecture de la plaque… (la première fois, le lecteur de texte se télécharge)',20000);
  try{
    const texte=String(await (window.__vhOcr||ocrTesseract)(cv)), lu=lireTexteAdresse(texte); etat.lue=texte.replace(/\s+/g,' ').trim().slice(0,60);
    if(!lu){ fermer(); c.note(`Aucune plaque lisible (texte lu : « ${etat.lue.slice(0,40)} »)`,7000); return; }
    const a=choisirAdresse(await chercherAdresses(lu.requete,pos),lu);
    if(!a){ fermer(); c.note(`« ${lu.requete} » : aucune adresse à moins de ${RAYON_ADRESSE_M} m`,7000); return; }
    etat.adresse=a.libelle;
    const r=positionDepuisAdresse({adresse:a,rues:await ruesAutour(pos,motsCles(a.rue)),pos});
    if(!r.ok){ fermer(); c.note(r.raison,7000); return; }
    c.note('Plaque lue : à confirmer',4000); demander(lu.requete,r);
  }catch(e){ fermer(); c.logNet('Position',false,'lecture de la plaque impossible : '+(e&&e.message||e)); c.note('Lecture de la plaque impossible : '+(e&&e.message||e),7000); }
}
export default {
  init(ctx){
    c=ctx;
    const st=document.createElement('style'); st.id='g3PlaqueSt';
    st.textContent='#g3PlaqueMsg{position:fixed;left:12px;right:12px;bottom:calc(110px + env(safe-area-inset-bottom));z-index:30;background:rgba(20,18,14,.92);color:var(--cream,#F3E9D2);border-radius:12px;padding:10px 12px;font:14px/1.35 system-ui,sans-serif}'
      +'#g3PlaqueMsg button{margin:8px 8px 0 0;padding:6px 12px;border-radius:8px;border:1px solid currentColor;background:none;color:inherit;font:inherit}#g3PlaqueBtn{width:100%;margin:6px 0 10px;padding:9px;border-radius:10px;font:600 14px system-ui,sans-serif}';
    document.head.appendChild(st);
    const b=document.createElement('div'); b.id='g3PlaqueMsg'; b.hidden=true; document.body.appendChild(b);
    const btn=Object.assign(document.createElement('button'),{id:'g3PlaqueBtn',type:'button',textContent:'Lire une plaque de rue (corrige la position)'});
    btn.onclick=()=>{ const s=c.$('sheet'); if(s) s.classList.remove('open'); if(!bandeau().hidden){ fermer(); return; } lire(); };
    const h=c.$('sheet')&&c.$('sheet').querySelector('h2'); if(h) h.after(btn);
    addEventListener('devicemotion',e=>{ const a=e.accelerationIncludingGravity; if(!a||typeof a.x!=='number'||typeof a.y!=='number'||typeof a.z!=='number') return; surAcceleration({x:a.x,y:a.y,z:a.z,t:Date.now()}); });
  },
  lire, imposer,
  /** Point d'entrée du suivi GPS : vrai si la position corrigée reste (le fix GPS est alors ignoré). */
  garder(lat,lon,precisionM){
    if(!correction) return false;
    const g=surGps(correction,{pos:{lat,lon},precisionM:precisionM||20,t:Date.now()});
    if(g.reprise){ correction=null; etat.reprises++; c.logNet('Position',false,`le GPS reprend la main (écart durable avec la position corrigée par ${etat.source})`); return false; }
    correction=g.corr; return true;
  },
  correction:()=>correction&&{...correction},
  statut:()=>`plaque : ${correction?`position corrigée (${etat.source}), ${correction.pas} pas depuis`:'aucune correction en cours'}${etat.lue?` · dernier texte lu « ${etat.lue} »`:''}${etat.reprises?` · ${etat.reprises} reprise(s) par le GPS`:''}`,
};
function surAcceleration(a){
  const r=detecterPas(pasEtat,a); pasEtat=r.etat;
  if(!r.pas||!correction||c.photoMode) return;
  correction={...correction,pos:avancer(correction.pos,c.pose().heading,LONGUEUR_PAS_M),pas:correction.pas+1};
  c.onNewPos(correction.pos.lat,correction.pos.lon,c.acc);
}
