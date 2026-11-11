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
module.exports={ouvrir,capteurs,videoSynthetique,V1,V3};
