// Aides des tests de la v3 : ouverture (v1 ou v3, greffes choisies), capteurs simulés (cap, inclinaison, roulis), vidéo synthétique.
const {openApp}=require('../../../tests/commun/app');
const V1='/v1/villes-horizon.html', V3='/v3/villes-horizon.html';
/** Ouvre la v3 (greffes : liste, ['tout'] ou [] = toutes éteintes) ou la v1 (version:'v1'). */
async function ouvrir(page,{version='v3',greffes=[],...opts}={}){
  const app=await openApp(page,{...opts,url:version==='v1'?V1:V3,greffes:version==='v1'?undefined:greffes});
  // greffe montagne sans masquage du relief : son avertissement arrive après la position, à un instant variable, et remplaçait parfois le message
  // qu'un test attend juste après (soleil2 toutes allumées, 1 fois sur 8) → on attend qu'il soit passé avant de rendre la main
  if(version!=='v1'&&opts.start!==false&&opts.pos&&opts.settings&&opts.settings.relief===false&&(greffes.includes('tout')||greffes.includes('montagne')))
    await app.waitFor("G.montagne.etat().msg!=='en attente du relief'",8000).catch(()=>{});
  return app;
}
/** Capteurs simulés : axe de la caméra au cap `cap`, inclinaison `incl`, roulis `roulis` (°) ; la boussole seule (pas de gyroscope). */
async function capteurs(app,{cap=0,incl=0,roulis=0}){
  await app.ev(`(()=>{ const c=${cap}*D, i=${incl}*D, r=${roulis}*D; svAbs=svRel=null; sv=[Math.sin(c)*Math.cos(i),Math.cos(c)*Math.cos(i),Math.sin(i)];
    const h=[Math.cos(c),-Math.sin(c),0], u=[-Math.sin(c)*Math.sin(i),-Math.cos(c)*Math.sin(i),Math.cos(i)]; sr=h.map((k,j)=>k*Math.cos(r)+u[j]*Math.sin(r)); sensor=true; return true; })()`);
}
/** Remplace le flux de la caméra par un canvas peint par `peindre(ctx2d, W, H)` (source de la fonction), rafraîchi toutes les 50 ms. */
async function videoSynthetique(page,peindre,args={}){
  await page.evaluate(({src,args})=>{
    // même rapport que l'écran : pas de recadrage, un point de l'écran = le même point de l'image
    const v=document.getElementById('cam'), W=innerWidth, H=innerHeight, c=document.createElement('canvas'); c.width=W; c.height=H;
    const x=c.getContext('2d'), f=new Function('x','W','H','a',src); const p=()=>f(x,W,H,args); p(); setInterval(p,50);
    v.srcObject=c.captureStream(20); v.play().catch(()=>{});
  },{src:peindre,args});
  await page.waitForFunction(()=>{ const v=document.getElementById('cam'); return v.videoWidth>0&&!v.paused; },null,{timeout:10000});
}
/** Petite photo JPEG avec un EXIF minimal (marque, modèle, focale équivalente 24×36, date, position, altitude GPS) : `jpeg` = image sans EXIF (Buffer), le bloc EXIF est inséré en tête. */
function photoExif(jpeg,{lat,lon,alt=0,make='Google',model,f35,date}){
  const asc=t=>({type:2,n:t.length+1,v:Buffer.from(t+'\0','latin1')}), rat=l=>{ const b=Buffer.alloc(8*l.length); l.forEach(([n,q],i)=>{ b.writeUInt32LE(n,8*i); b.writeUInt32LE(q,8*i+4); }); return {type:5,n:l.length,v:b}; };
  const dms=v=>{ const a=Math.abs(v), d=Math.floor(a), m=Math.floor((a-d)*60), s=Math.round(((a-d)*60-m)*60*1000); return rat([[d,1],[m,1],[s,1000]]); };
  // une table (IFD) placée à `debut` dans le bloc TIFF : entrées triées par numéro, valeurs de plus de 4 octets rangées après la table
  const table=(entrees,debut)=>{ const n=entrees.length, t=Buffer.alloc(2+12*n+4), suite=[]; let pos=debut+t.length; t.writeUInt16LE(n,0);
    entrees.sort((a,b)=>a.tag-b.tag).forEach((e,i)=>{ const o=2+12*i; t.writeUInt16LE(e.tag,o); t.writeUInt16LE(e.type,o+2); t.writeUInt32LE(e.n,o+4);
      if(Buffer.isBuffer(e.v)){ if(e.v.length<=4) e.v.copy(t,o+8); else { t.writeUInt32LE(pos,o+8); const b=e.v.length&1?Buffer.concat([e.v,Buffer.alloc(1)]):e.v; suite.push(b); pos+=b.length; } }
      else if(e.type===3) t.writeUInt16LE(e.v,o+8); else if(e.type===1) t.writeUInt8(e.v,o+8); else t.writeUInt32LE(e.v,o+8); });
    return Buffer.concat([t,...suite]); };
  const gps=d=>table([{tag:1,...asc(lat<0?'S':'N')},{tag:2,...dms(lat)},{tag:3,...asc(lon<0?'W':'E')},{tag:4,...dms(lon)},{tag:5,type:1,n:1,v:alt<0?1:0},{tag:6,...rat([[Math.round(Math.abs(alt)*100),100]])}],d);
  const exif=d=>table([...(f35?[{tag:0xA405,type:3,n:1,v:f35}]:[]),...(date?[{tag:0x9003,...asc(date)}]:[])],d);
  const base=(oExif,oGps)=>table([{tag:0x010F,...asc(make)},...(model?[{tag:0x0110,...asc(model)}]:[]),{tag:0x8769,type:4,n:1,v:oExif},{tag:0x8825,type:4,n:1,v:oGps}],8);
  const l0=base(0,0).length, e=exif(8+l0), tiff=Buffer.concat([Buffer.from([0x49,0x49,42,0,8,0,0,0]),base(8+l0,8+l0+e.length),e,gps(8+l0+e.length)]);
  const seg=Buffer.concat([Buffer.from([0xFF,0xE1,0,0]),Buffer.from('Exif\0\0','latin1'),tiff]); seg.writeUInt16BE(seg.length-2,2);
  return Buffer.concat([jpeg.subarray(0,2),seg,jpeg.subarray(2)]);
}
module.exports={ouvrir,capteurs,videoSynthetique,photoExif,V1,V3};
