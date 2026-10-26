// Calage sur les reperes (landmarkFit) : en ville dense, les concordances fortuites ne doivent pas deplacer le cap ni le champ (Turin, 26/10/2026 :
// cap -19,4° et champ 71,5° -> 58,5° sur une photo dont la direction enregistree etait juste a quelques degres pres).
const {test,expect}=require('@playwright/test');
const {openApp}=require('../helpers/app');

// scene synthetique : pointes de la silhouette (dd, hauteur °) et reperes (cap, distance km, hauteur m) ; le generateur est fixe
const SCENE=`(({lm,peaks,shift})=>{
  S.relief=false; S.camFov=71.5; S.headOff=0; S.pitchOff=0;
  monumentSites=lm.map(([brg,dist,ht],i)=>({name:'repère '+i,cat:'monument',kind:'monument',type:'tour',htOsm:ht,ht,dist,brg:(brg+360)%360,far:false,hidden:false,aP:null}));
  const fh=(W/2)/Math.tan(vFov()/2*D), cols=[];
  for(let dd=-34;dd<=34;dd+=0.25){ let a=0; for(const [pd,pa] of peaks) a=Math.max(a,pa*Math.max(0,1-Math.abs(dd-pd)/0.5)); cols.push({brg:(dd+360)%360,a}); }
  const r=landmarkFit({cols,heading:0,pitch:0,fh});
  return {r,fov:S.camFov};
})`;

// reperes vrais : leurs pointes sont decalees de 7° (le cap de depart est faux de 7° : correction attendue +7°)
const TRUE_LM=[[-20,1.2,60],[-6,2.4,80],[9,1.8,45],[24,3.1,70]];
const truePeaks=TRUE_LM.map(([b,d,h])=>[b-7,Math.atan2(h-1.6,d*1000)/(Math.PI/180)]);

// scene de ville dense sans rapport entre reperes et pointes : generateur fixe par graine ; renvoie {r,fov}
const DENSE=`((nl,np,seed0)=>{ let a=seed0*2654435761>>>0; const rnd=()=>{ a=(a+0x6D2B79F5)>>>0; let t=Math.imul(a^(a>>>15),1|a); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; };
  const lm=Array.from({length:nl},()=>[-32+rnd()*64,0.6+rnd()*3,40+rnd()*60]), peaks=Array.from({length:np},()=>[-32+rnd()*64,0.8+rnd()*2.6]);
  return (${SCENE})({lm,peaks}); })`;

test('ville dense : une scène sans rapport avec le cap, acceptée avant (cap et champ déplacés), est refusée',async({page})=>{
  await page.setViewportSize({width:915,height:412}); // paysage : champ de 71,5° (en portrait la caméra factice n'en montre que 19°)
  await openApp(page,{pos:{lat:45.07,lon:7.68}});
  const out=await page.evaluate(js=>window.__vh.ev(js)(16,14,3),DENSE);  // avant : accepte, champ 71,5° -> 73,5°
  expect(out.r.ok,`calage accepte a tort : ${JSON.stringify(out.r)}`).toBe(false);
  expect(out.r.cam).toBeUndefined();
});

test('ville dense : concordances fortuites presque toujours refusées, le champ ne bouge jamais',async({page})=>{
  await page.setViewportSize({width:915,height:412}); // paysage : champ de 71,5° (en portrait la caméra factice n'en montre que 19°)
  await openApp(page,{pos:{lat:45.07,lon:7.68}});
  const res=await page.evaluate(js=>{ const f=window.__vh.ev(js), out=[]; for(const [nl,np] of [[16,14],[30,20]]) for(let k=1;k<=60;k++){ const o=f(nl,np,k); out.push({ok:o.r.ok,cam:o.r.cam}); } return out; },DENSE);
  expect(res.filter(r=>r.ok&&r.cam!==71.5).length).toBe(0);    // avant : le champ bougeait dans 4 scenes sur 120
  expect(res.filter(r=>r.ok).length).toBeLessThanOrEqual(res.length*0.1); // avant : 94 % acceptees
});

test('repères réellement concordants : le cap est corrigé, le champ reste',async({page})=>{
  await page.setViewportSize({width:915,height:412}); // paysage : champ de 71,5° (en portrait la caméra factice n'en montre que 19°)
  await openApp(page,{pos:{lat:45.07,lon:7.68}});
  for(const [lm,peaks] of [[TRUE_LM,truePeaks],[TRUE_LM.slice(0,3),truePeaks.slice(0,3)],[TRUE_LM.slice(0,2),truePeaks.slice(0,2)]]){
    const out=await page.evaluate(([js,lm,peaks])=>window.__vh.ev(js)({lm,peaks}),[SCENE,lm,peaks]);
    expect(out.r.ok,`${lm.length} reperes vrais : ${JSON.stringify(out.r)}`).toBe(true);
    expect(out.r.corr).toBeCloseTo(7,0); // corr = cap du repere - cap de sa pointe
    expect(out.fov).toBe(71.5);
  }
});
