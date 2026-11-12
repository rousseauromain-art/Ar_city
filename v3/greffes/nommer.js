// Greffe « nommer » (ajout, éteinte par défaut) : toucher le relief donne son nom (sommet, col, crête, plateau, lieu-dit…).
// Demande du 11/11/2026 (Vercors).
//  1. Le point touché devient une direction (cap, hauteur), avec la même formule que le calage au doigt de la v1 (roulis compris).
//  2. Le rayon est suivi dans le relief DÉJÀ chargé (masque par cap de la v1, aucun téléchargement) : premier point du sol atteint, et la crête
//     de ce versant juste au-dessus. Un toucher dans le ciel à moins de 3° au-dessus de la silhouette vise la silhouette.
//  3. Le nom : d'abord les sommets déjà chargés (v1 et greffe montagne), tout de suite ; puis OpenStreetMap autour du point touché et de sa
//     crête (rayon : 5 % de la distance, entre 0,5 et 4 km) : sommets, cols, crêtes, falaises, plateaux, vallées, lieux-dits, refuges, forêts,
//     et ce qui englobe le point (massif, parc, commune). Le plus probable d'abord : le plus proche, un sommet du rayon passant devant un lieu-dit.
//  4. La fiche s'ouvre tout de suite (« relief à X km, Y m »), le nom la complète ; une épingle nommée reste une minute sur le point touché.
// OpenStreetMap nomme bien les sommets et les cols, moins bien les plateaux et les massifs : quand rien n'est nommé, la fiche le dit.
// Réponses gardées 30 jours sur l'appareil. Points d'entrée : showTelecomDetail (toucher sans rien dessous), draw (épingle).
const RAD=Math.PI/180;
export const TOLERANCE_CIEL_DEG=3, PROCHE_KM=0.15, RAYON_PART=0.05, RAYON_MIN_KM=0.5, RAYON_MAX_KM=4, TTL_MS=30*86400000, EPINGLE_MS=60000;
const distKm=(a,b)=>{ const la1=a.lat*RAD, la2=b.lat*RAD, dl=(b.lon-a.lon)*RAD, h=Math.sin((la2-la1)/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dl/2)**2; return 6371*2*Math.asin(Math.sqrt(Math.min(1,h))); };
const norm=s=>String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
const km=d=>d<10?d.toFixed(1).replace('.',','):String(Math.round(d));

/**
 * Point du relief visé dans la direction (cap `brg`, hauteur `el`, degrés). T : relief de la v1 {c:{lat,lon}, h0, pm} (pm[i][k] : hauteur
 * maximale rencontrée jusqu'à la distance TDIST[k] au cap i ; pm.raw : hauteur de chaque point) ; K : {TDIST, BSTEP, NB, REFF}. Pure.
 * @returns {null | {ciel:true,ecart:number} | {proche:true} | {brg,el,d,lat,lon,alt,angle,surSilhouette:boolean,crete:{d,lat,lon,alt,angle}}}
 */
export function viser(T,K,brg,el){
  if(!T||!T.pm||!T.pm.raw) return null;
  const i=Math.round((((brg%360)+360)%360)/K.BSTEP)%K.NB, row=T.pm[i], raw=T.pm.raw[i]; if(!row||!raw) return null;
  const n=row.length, ciel=row[n-1], surSilhouette=el>ciel;
  if(surSilhouette&&el-ciel>TOLERANCE_CIEL_DEG) return {ciel:true,ecart:el-ciel};
  const cible=surSilhouette?ciel-1e-4:el; let k=0; while(k<n-1&&row[k]<cible) k++;
  if(K.TDIST[k]<PROCHE_KM) return {proche:true};
  let kc=k; while(kc<n-1&&row[kc+1]>row[kc]+1e-4) kc++; // crête de ce versant : le masque cesse de monter (le sol passe derrière)
  const b=i*K.BSTEP*RAD, cosL=Math.cos(T.c.lat*RAD);
  const point=j=>{ const d=K.TDIST[j], dm=d*1000, a=raw[j]; return {d,lat:T.c.lat+d*Math.cos(b)/111.32,lon:T.c.lon+d*Math.sin(b)/(111.32*cosL),angle:a===a?a:row[j],alt:a===a?T.h0+dm*Math.tan(a*RAD)+dm*dm/(2*K.REFF):null}; };
  return {brg:i*K.BSTEP,el,...point(k),surSilhouette,crete:point(kc)};
}
/** Rayon de recherche (km) autour d'un point à `dKm` : 5 % de la distance (le doigt couvre environ 3°), entre 0,5 et 4 km. */
export const rayonKm=dKm=>Math.max(RAYON_MIN_KM,Math.min(RAYON_MAX_KM,dKm*RAYON_PART));
const SELECTEURS=['["natural"~"^(peak|volcano|hill|saddle|ridge|arete|cliff|rock|stone|plateau|valley|gorge|massif|mountain_range|fell|glacier|cave_entrance|cape|wood)$"]',
  '["mountain_pass"="yes"]','["place"~"^(locality|isolated_dwelling|hamlet|village|town)$"]','["tourism"~"^(alpine_hut|wilderness_hut|viewpoint)$"]','["landuse"="forest"]'];
/** Requête Overpass : ce qui est nommé autour des centres (point touché, crête), et ce qui englobe le premier. */
export function requete(centres,rKm){
  const autour=centres.map(p=>`(around:${Math.round(rKm*1000)},${p.lat.toFixed(5)},${p.lon.toFixed(5)})`), p=centres[0];
  return `[out:json][timeout:25];(${autour.map(a=>SELECTEURS.map(s=>`nwr["name"]${s}${a};`).join('')).join('')});out tags center 80;`
    +`is_in(${p.lat.toFixed(5)},${p.lon.toFixed(5)})->.a;(area.a["name"]["natural"];area.a["name"]["boundary"="administrative"]["admin_level"="8"];`
    +`area.a["name"]["boundary"~"^(protected_area|national_park)$"];area.a["name"]["region:type"="mountain_area"];area.a["name"]["landuse"="forest"];);out tags;`;
}
const RELIEF_NOM=/^(plateau|mont|montagne|pic|puy|roc|roche|rochers?|cr[êe]te|col|pas|t[êe]te|aiguille|dent|cime|pointe|serre|signal|sommet|bec|ballon|causse|combe|vallon)\b/i;
/** Nature d'un objet OpenStreetMap, en clair, et son avantage dans le classement : un sommet dans le rayon passe devant un lieu-dit plus proche. */
export function nature(t){
  const n=t.natural, p=t.place, to=t.tourism;
  if(n==='peak'||n==='volcano'||n==='hill') return ['sommet',0.6];
  if(n==='saddle'||t.mountain_pass==='yes') return ['col',0.35];
  if(n==='ridge'||n==='arete') return ['crête',0.3];
  if(n==='plateau') return ['plateau',0.3];
  if(n==='massif'||n==='mountain_range'||t['region:type']==='mountain_area') return ['massif',0.25];
  if(n==='cliff') return ['falaise',0.2];
  if(n==='cape') return ['cap',0.2];
  if(n==='valley') return ['vallée',0.15];
  if(n==='gorge') return ['gorge',0.15];
  if(n==='rock'||n==='stone') return ['rocher',0.15];
  if(n==='glacier') return ['glacier',0.15];
  if(p==='locality') return ['lieu-dit',RELIEF_NOM.test(t['name:fr']||t.name||'')?0.3:0.12]; // « Plateau de… », « Crête de… » : un lieu-dit qui nomme un relief
  if(n==='fell') return ['alpage',0.1];
  if(to==='alpine_hut'||to==='wilderness_hut') return ['refuge',0.1];
  if(to==='viewpoint') return ['point de vue',0.1];
  if(n==='cave_entrance') return ['grotte',0.05];
  if(n==='wood'||t.landuse==='forest') return ['forêt',0.02];
  if(p==='isolated_dwelling'||p==='hamlet') return ['hameau',0];
  if(p==='village'||p==='town') return ['village',0];
  if(t.boundary==='administrative') return ['commune',0];
  if(t.boundary==='protected_area'||t.boundary==='national_park') return ['parc ou réserve',0];
  return ['lieu',0];
}
const altitude=v=>{ if(v==null) return null; const m=/-?\d[\d\s]*(?:[.,]\d+)?/.exec(String(v)); if(!m) return null; const x=parseFloat(m[0].replace(/\s/g,'').replace(',','.')); return isFinite(x)&&x>-500&&x<9000?x:null; };
/**
 * Réponse Overpass + sommets déjà chargés → noms classés. `V` : résultat de viser ; `locaux` : [{name,lat,lon,ele}] (sommets de la page). Pure.
 * @returns {{noms:{name,type,ele,lat,lon,d,ou,score,wikipedia,osm}[], autour:{name,type}[]}}
 */
export function lireNoms(j,V,locaux=[]){
  const R=rayonKm(V.d), vus=new Map(), autour=[], vusA=new Set();
  const ajouter=(o,bonus)=>{ const dP=distKm(o,V), dC=distKm(o,V.crete), d=Math.min(dP,dC); if(d>R*1.15) return;
    let score=d/R-bonus; if(o.type==='sommet'&&o.ele!=null&&V.crete.alt!=null&&Math.abs(o.ele-V.crete.alt)<80) score-=0.1; // un sommet à l'altitude de la crête visée
    const cle=norm(o.name), deja=vus.get(cle), moi={...o,d,ou:dC<dP?'crête':'point',score}; if(!deja){ vus.set(cle,moi); return; }
    const [g,p]=score<deja.score?[moi,deja]:[deja,moi], fiche=g.osm?g:p.osm?p:g; // même nom vu deux fois : le mieux placé ; orthographe et liens de la fiche OpenStreetMap
    vus.set(cle,{...g,name:fiche.name,ele:fiche.ele??g.ele??p.ele??null,wikipedia:g.wikipedia||p.wikipedia||null,osm:g.osm||p.osm||null}); };
  for(const s of locaux) if(s&&s.name&&isFinite(s.lat)&&isFinite(s.lon)) ajouter({name:s.name,type:'sommet',ele:s.ele??null,lat:s.lat,lon:s.lon},0.6);
  for(const e of (j&&j.elements)||[]){
    const t=e.tags||{}, name=t['name:fr']||t.name; if(!name) continue; const [type,bonus]=nature(t);
    if(e.type==='area'){ const cle=type+'|'+norm(name); if(!vusA.has(cle)){ vusA.add(cle); autour.push({name,type}); } continue; }
    const lat=e.lat??(e.center&&e.center.lat), lon=e.lon??(e.center&&e.center.lon); if(!isFinite(lat)||!isFinite(lon)) continue;
    ajouter({name,type,ele:altitude(t.ele),lat,lon,wikipedia:t.wikipedia||null,osm:e.type&&e.id?`${e.type}/${e.id}`:null},bonus);
  }
  const ordre={massif:0,'parc ou réserve':1,plateau:2,forêt:3,commune:4};
  return {noms:[...vus.values()].sort((a,b)=>a.score-b.score),autour:autour.sort((a,b)=>(ordre[a.type]??2.5)-(ordre[b.type]??2.5))};
}

// ---------- dans la page ----------
let c=null, demande=0, epingle=null;
const etat={touchers:0,dernier:'aucun toucher',erreur:''};
const lien=(u,t)=>`<a style="color:#F2C14E" target="_blank" rel="noopener" href="${esc(u)}">${esc(t)}</a>`;
const altTxt=a=>a!=null?`${Math.round(a).toLocaleString('fr-FR')} m`:'altitude inconnue';
/** Corps de la fiche. `N` : résultat de lireNoms ; `enCours` : OpenStreetMap n'a pas encore répondu ; `erreur` : OpenStreetMap injoignable. */
export function ficheHtml(V,N,{enCours=false,erreur=''}={}){
  const R=rayonKm(V.d), m=N&&N.noms[0], autres=N?N.noms.slice(1,9):[], memeCrete=Math.abs(V.crete.d-V.d)<0.05;
  const tete=m?`<div class="dbgline" style="font-size:18px;font-weight:700;color:#F2C14E">${esc(m.name)}</div><div class="dbgline">${esc(m.type)}${m.ele!=null?' · '+altTxt(m.ele):''} · à ${km(V.d)} km d’ici · direction ${Math.round(V.brg)}°</div>`
    :`<div class="dbgline" style="font-size:18px;font-weight:700;color:#F2C14E">Relief à ${km(V.d)} km</div><div class="dbgline">${altTxt(V.alt)} · direction ${Math.round(V.brg)}°</div>`;
  const rech=enCours?'<div class="dbgline">Recherche du nom dans OpenStreetMap…</div>':erreur?`<div class="dbgline" style="color:#E08787">OpenStreetMap injoignable (${esc(erreur)}) : noms des sommets déjà chargés seulement.</div>`
    :!m?`<div class="dbgline">Rien de nommé dans OpenStreetMap à moins de ${km(R)} km de ce point (les plateaux et les massifs y sont peu nommés).</div>`:'';
  const point=`<div class="dbgsec">Point touché${V.surSilhouette?' (silhouette, juste sous votre doigt)':''}</div><div class="dbgline">relief à ${km(V.d)} km, ${altTxt(V.alt)}${memeCrete?'':` · crête de ce versant : ${altTxt(V.crete.alt)} à ${km(V.crete.d)} km`}</div>`;
  const liste=autres.length?`<div class="dbgsec">Aussi à moins de ${km(R)} km (du plus probable au moins probable)</div><div class="dbgline">${autres.map(o=>`<b style="color:#F3E9D2">${esc(o.name)}</b> — ${esc(o.type)}${o.ele!=null?', '+altTxt(o.ele):''}, à ${km(o.d)} km ${o.ou==='crête'?'de la crête':'du point'}`).join('<br>')}</div>`:'';
  const ici=N&&N.autour.length?`<div class="dbgsec">Ce point est dans</div><div class="dbgline">${N.autour.slice(0,6).map(a=>`${esc(a.name)} <span style="opacity:.7">(${esc(a.type)})</span>`).join(' · ')}</div>`:'';
  const o=m&&m.lat!=null?m:V, wk=m&&m.wikipedia&&/^([a-z-]+):(.+)$/.exec(m.wikipedia);
  const liens=`<div class="dbgsec">En savoir plus</div><div class="dbgline">${[wk?lien(`https://${wk[1]}.wikipedia.org/wiki/${encodeURIComponent(wk[2].replace(/ /g,'_'))}`,'Wikipédia'):'',m&&m.osm?lien(`https://www.openstreetmap.org/${m.osm}`,'fiche OpenStreetMap'):'',
    lien(`https://www.openstreetmap.org/?mlat=${o.lat.toFixed(5)}&mlon=${o.lon.toFixed(5)}#map=14/${o.lat.toFixed(5)}/${o.lon.toFixed(5)}`,'voir sur la carte')].filter(Boolean).join(' · ')}</div>`;
  return `<div id="g3NomCorps">${tete}${rech}${point}${liste}${ici}${liens}</div>`;
}
/** Sommets déjà chargés par la page (v1 et greffe montagne), visibles ou non. */
const locaux=()=>c.farPeaks.concat(c.cities.filter(x=>x.kind==='peak'||x.kind==='cape'));
async function chercher(V){
  const R=rayonKm(V.d), centres=distKm(V,V.crete)>R/2?[V,V.crete]:[V], q=requete(centres,R), cle=`nom/${V.lat.toFixed(3)},${V.lon.toFixed(3)},${V.crete.lat.toFixed(3)},${V.crete.lon.toFixed(3)}`;
  const r=await c.dcFetch('nom',cle,{ttl:TTL_MS,prune:['nom/',80],load:()=>c.overpassQuery(q,25000,j=>j)});
  return typeof r.data==='string'?JSON.parse(r.data):r.data;
}
/** Point d'entrée de showTelecomDetail : un toucher qui n'a rien rencontré (ni monument, ni équipement, ni bateau, ni avion). */
async function toucher(px,py){
  const T=c.terrain; if(!T){ c.note('Relief pas encore chargé : touchez de nouveau dans un instant',4000); return null; }
  const P=c.pose(), fh=(c.W/2)/Math.tan(c.vFov()/2*RAD), cx=c.W/2, cy=c.H/2, dx=px-cx, dy=py-cy, r=P.roll*RAD;
  let lx=cx+dx*Math.cos(r)+dy*Math.sin(r), ly=cy-dx*Math.sin(r)+dy*Math.cos(r); // repère compensé du roulis, comme le rendu et le calage au doigt
  if(window.G&&window.G.actif('projection')) [lx,ly]=window.G.projection.inverse(lx,ly); // greffe projection allumée : le point touché est ramené dans le repère de la v1
  const V=viser(T,c.relief,(P.heading+Math.atan((lx-cx)/fh)/RAD+360)%360,P.pitch-Math.atan((ly-cy)/fh)/RAD);
  if(!V||V.ciel||V.proche){ etat.dernier=!V?'relief indisponible':V.ciel?'ciel':'sol à vos pieds'; if(V&&V.ciel) c.note('C’est le ciel : touchez le relief, ou juste au-dessus de sa silhouette',3500); return V; }
  const moi=++demande; etat.touchers++; etat.erreur=''; etat.dernier=`relief à ${km(V.d)} km, ${altTxt(V.alt)}`;
  const tout=locaux(), N0=lireNoms(null,V,tout), nomme=N=>{ const m=N.noms[0]; epingle={brg:V.brg,angle:V.angle,t:Date.now(),texte:(m?m.name+(m.ele!=null?` ${Math.round(m.ele)} m`:''):`relief ${altTxt(V.alt)}`)+` · ${km(V.d)} km`}; };
  nomme(N0); c.fiche('Relief touché',ficheHtml(V,N0,{enCours:true}));
  const maj=(N,err)=>{ if(moi!==demande) return; nomme(N); const el=document.getElementById('g3NomCorps'); if(el) el.outerHTML=ficheHtml(V,N,{erreur:err}); };
  try{ const N=lireNoms(await chercher(V),V,tout); etat.dernier+=N.noms[0]?` → ${N.noms[0].name} (${N.noms[0].type})`:' → rien de nommé'; maj(N,''); }
  catch(e){ etat.erreur=c.friendlyErr(e); maj(N0,etat.erreur); }
  return V;
}
/** Point d'entrée de draw (dans la scène redressée du roulis) : épingle nommée sur le dernier point touché, une minute. */
function dessiner(x,{heading,pitch,fh,W,H,FM}){
  if(!epingle||Date.now()-epingle.t>EPINGLE_MS) return;
  const dB=((epingle.brg-heading+540)%360)-180; if(Math.abs(dB)>80) return;
  const px=W/2+fh*Math.tan(dB*RAD), py=H/2+fh*Math.tan((pitch-epingle.angle)*RAD); if(px<-20||px>W+20||py<-20||py>H+20) return;
  x.save(); x.lineJoin='round';
  for(const [coul,ep] of [['rgba(14,26,43,.85)',4],['#F2C14E',1.8]]){ x.strokeStyle=coul; x.lineWidth=ep; x.beginPath(); x.arc(px,py,5,0,7); x.moveTo(px,py-5); x.lineTo(px,py-22); x.stroke(); }
  x.font=`600 12px ${FM}`; x.textAlign='center'; x.lineWidth=3; x.strokeStyle='rgba(14,26,43,.9)'; x.strokeText(epingle.texte,px,py-27); x.fillStyle='#F2C14E'; x.fillText(epingle.texte,px,py-27);
  x.restore();
}
export default {
  init(ctx){ c=ctx; },
  toucher, dessiner, viser, requete, lireNoms, nature, rayonKm, ficheHtml,
  etat:()=>({...etat,epingle:epingle&&{...epingle}}),
  statut:()=>`nommer : ${etat.touchers} relief(s) touché(s) · dernier : ${etat.dernier}${etat.erreur?' · OpenStreetMap : '+etat.erreur:''}`,
};
