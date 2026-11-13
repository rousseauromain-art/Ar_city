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
/** Petite photo JPEG avec un EXIF minimal (marque, position, altitude GPS) : `jpeg` = image sans EXIF (Buffer), le bloc EXIF est inséré en tête. */
function photoExif(jpeg,{lat,lon,alt,make='Google'}){
  const t=Buffer.alloc(8+2+2*12+4+8+2+6*12+4+24+24+8), w16=(o,v)=>t.writeUInt16LE(v,o), w32=(o,v)=>t.writeUInt32LE(v,o);
  const entree=(o,tag,type,n,val)=>{ w16(o,tag); w16(o+2,type); w32(o+4,n); if(typeof val==='string') t.write(val,o+8,'latin1'); else w32(o+8,val); };
  t.write('II',0,'latin1'); w16(2,42); w32(4,8);
  const oMarque=8+2+24+4, oGps=oMarque+8, oLat=oGps+2+72+4, oLon=oLat+24, oAlt=oLon+24;
  w16(8,2); entree(10,0x010F,2,make.length+1,oMarque); entree(22,0x8825,4,1,oGps); t.write(make.slice(0,7),oMarque,'latin1');
  const dms=(o,v)=>{ const a=Math.abs(v), d=Math.floor(a), m=Math.floor((a-d)*60), s=Math.round(((a-d)*60-m)*60*1000); [[d,1],[m,1],[s,1000]].forEach(([n,q],i)=>{ w32(o+8*i,n); w32(o+8*i+4,q); }); };
  w16(oGps,6); let e=oGps+2;
  entree(e,1,2,2,lat<0?'S':'N'); entree(e+12,2,5,3,oLat); entree(e+24,3,2,2,lon<0?'W':'E'); entree(e+36,4,5,3,oLon); entree(e+48,5,1,1,alt<0?1:0); entree(e+60,6,5,1,oAlt);
  dms(oLat,lat); dms(oLon,lon); w32(oAlt,Math.round(Math.abs(alt)*100)); w32(oAlt+4,100);
  const seg=Buffer.concat([Buffer.from([0xFF,0xE1,0,0]),Buffer.from('Exif\0\0','latin1'),t]); seg.writeUInt16BE(seg.length-2,2);
  return Buffer.concat([jpeg.subarray(0,2),seg,jpeg.subarray(2)]);
}
module.exports={ouvrir,capteurs,videoSynthetique,photoExif,V1,V3};
