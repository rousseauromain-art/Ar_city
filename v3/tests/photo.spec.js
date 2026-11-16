// Greffe « photo » (plan du 16/11, lot R5) sur les photos de Pont-en-Royans (dépôt privé ; ignoré sans lui, sauf PARITE_OBLIGATOIRE=1) :
// photo entière, calage à l'ouverture (gorges calée seule, plaine à moins de 3° du réglage de Romain, 24 mm : rien ne bouge), calage et
// rotation repris à la réouverture, Explorer (un nom reste sur son point quand on grossit ou qu'on se déplace), toucher d'un nom et glisser
// dans le cadre décalé, et en direct le calage verrouillé.
const {test,expect}=require('@playwright/test');
const {ouvrirSceneReelle,ignorerSiAbsent,PHOTOS_DIR}=require('../../tests/commun/scenes-reelles');
const {capturer,GREFFES_CONTEXTE}=require('../../tests/commun/planche');
const {resume,COULEURS_CALQUES,COULEUR_MONUMENT}=require('../../tests/commun/controles-visuels');
const {textPoly}=require('../../tests/commun/labels');
const os=require('os'), path=require('path'), fs=require('fs');
const V3='/v3/villes-horizon.html', PAYSAGE={width:809,height:331}, PORTRAIT={width:411,height:753};
const GREFFES=[...GREFFES_CONTEXTE,'visibilite','calques','toucher','placement','photo'];
const charger=async()=>{ const pont=await import('../../tests/commun/caracterisation/pont-en-royans.mjs'); return {sc:id=>pont.SCENES_PONT.find(s=>s.id===id),reglages:pont.REGLAGES_TEL}; };
const ecart=(a,b)=>Math.abs(((((a-b)%360)+540)%360)-180);
const ouvrir=async(browser,id,ecran=PAYSAGE)=>{ const m=await charger(), sc0=m.sc(id); ignorerSiAbsent(test,sc0);
  return ouvrirSceneReelle(browser,{...sc0,ecran},{url:V3,greffes:GREFFES,reglages:m.reglages}); };
const etat=o=>o.app.ev("({h:S.headOff,p:S.pitchOff,cam:S.camFov,roll:pose().roll,W,H,e:G.photo.etat(),dir0:photoMode&&photoMode.dir0})");
/** Deux doigts (événements tactiles du navigateur) : de a0,b0 à a1,b1 en n étapes. */
async function deuxDoigts(page,[a0,b0],[a1,b1],n=8){
  const cdp=await page.context().newCDPSession(page), pt=(p,id)=>({x:p[0],y:p[1],id});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[pt(a0,0),pt(b0,1)]});
  for(let i=1;i<=n;i++){ const t=i/n, m=(p,q)=>[p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t];
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[pt(m(a0,a1),0),pt(m(b0,b1),1)]}); await page.waitForTimeout(20); }
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await cdp.detach();
}

test('photo : gorges — photo entière, calée seule à l’ouverture (cap 75,6° ±1°), rien d’écrit l’un sur l’autre ni sous un bouton',async({browser})=>{
  test.setTimeout(300000);
  const o=await ouvrir(browser,'pont-photo-gorges'), s=await etat(o);
  console.log('gorges',JSON.stringify({h:s.h,p:s.p,msg:s.e.message}));
  const r=await o.app.ev("({w:photoMode.w,h:photoMode.h})");
  expect(Math.abs(s.W/s.H-r.w/r.h)).toBeLessThan(0.01); // la scène a les proportions de la photo : rien n'est recadré
  expect(s.W<=PAYSAGE.width&&s.H<=PAYSAGE.height&&(s.W===PAYSAGE.width||s.H===PAYSAGE.height)).toBe(true);
  expect(s.e.auto&&s.e.auto.genre).toBe('relief');
  expect(ecart(s.h,75.6)).toBeLessThanOrEqual(1);
  expect(s.cam).toBe(s.e.auto.avant.cam); // le champ de la photo est laissé tel quel
  expect(await o.page.isVisible('#g3Cale')).toBe(true);
  const png=path.join(os.tmpdir(),'photo-gorges.png'), {infractions}=await capturer(o,png); fs.rmSync(png,{force:true});
  console.log('gorges ·',resume(infractions));
  expect(infractions.recouvrements).toEqual([]); expect(infractions.sousLesBoutons).toEqual([]); expect(infractions.cachesEcrits).toEqual([]);
  expect(infractions.traitsTropLongs.filter(t=>!COULEURS_CALQUES.test(String(t.couleur))&&!COULEUR_MONUMENT.test(String(t.couleur)))).toEqual([]);
  // « annuler » : retour au calage d'avant
  await o.page.click('#g3Cale'); const a=await etat(o);
  expect(ecart(a.h,s.e.auto.avant.h)).toBeLessThan(0.01); expect(Math.abs(a.p-s.e.auto.avant.p)).toBeLessThan(0.01);
  await o.ctx.close(); expect(o.erreurs).toEqual([]);
});

for(const [id,ecran] of [['pont-photo-plaine',PAYSAGE],['pont-photo-24mm',PORTRAIT]])
  test(`photo : ${id} — calage de l’ouverture jamais faux : plaine à moins de 3° de 279,4°, 24 mm à moins de 2° de 226,4° ou rien ne bouge`,async({browser})=>{
    test.setTimeout(300000);
    const o=await ouvrir(browser,id,ecran), s=await etat(o);
    console.log(id,JSON.stringify({h:s.h,p:s.p,msg:s.e.message,essais:s.e.essais}));
    if(id==='pont-photo-plaine') expect(ecart(s.h,279.4)).toBeLessThan(3);
    else if(s.e.auto) expect(ecart(s.h,226.4)).toBeLessThan(2);
    else { expect(s.h).toBe(s.dir0); expect(await o.page.textContent('#g3Cale')).toContain('pas calée'); }
    // avec le champ mesuré des photos du Pixel 9 (≈ 69,5°, K9 ; le champ par défaut des photos est le lot R7) : même exigence
    const r=await o.app.ev("(async()=>{ S.headOff=photoMode.dir0; S.pitchOff=0; S.camFov=69.5; await G.photo.recaler(); return {h:S.headOff,e:G.photo.etat()}; })()");
    console.log(id,'69,5°',JSON.stringify({h:r.h,msg:r.e.message}));
    if(id==='pont-photo-plaine') expect(ecart(r.h,279.4)).toBeLessThan(3);
    else if(r.e.auto) expect(ecart(r.h,226.4)).toBeLessThan(2);
    await o.ctx.close(); expect(o.erreurs).toEqual([]);
  });

test('photo : rotation à deux doigts (±15°), retenue avec le calage ; la photo rouverte reprend calage et rotation sans recaler',async({browser})=>{
  test.setTimeout(300000);
  const m=await charger(), o=await ouvrir(browser,'pont-photo-gorges'), cx=PAYSAGE.width/2, cy=PAYSAGE.height/2;
  // tourner de 10° dans le sens des aiguilles d'une montre, sans écarter les doigts
  const rot=(a,r=80)=>[[cx-r*Math.cos(a),cy-r*Math.sin(a)],[cx+r*Math.cos(a),cy+r*Math.sin(a)]];
  await deuxDoigts(o.page,rot(0),rot(10*Math.PI/180),10); await o.page.waitForTimeout(300);
  const s=await etat(o); console.log('rotation',s.roll,s.cam);
  expect(s.roll).toBeGreaterThan(8); expect(s.roll).toBeLessThanOrEqual(10.5); expect(s.cam).toBe(s.e.auto.avant.cam); // le champ ne bouge pas en tournant
  await deuxDoigts(o.page,rot(0),rot(40*Math.PI/180),10); expect((await etat(o)).roll).toBe(15); // borné à ±15°
  await deuxDoigts(o.page,rot(0),rot(-5*Math.PI/180),5); await o.page.waitForTimeout(900); // rotation retenue (≈ 10°)
  const avant=await etat(o);
  // rouvrir la même photo : calage retenu repris, pas de nouveau calage automatique
  await o.page.setInputFiles('#photoFile',path.join(PHOTOS_DIR,m.sc('pont-photo-gorges').photo));
  await o.app.waitFor("photoMode&&G.photo.etat().pret&&G.photo.etat().repris",30000);
  const apres=await etat(o); console.log('réouverture',JSON.stringify({avant:[avant.h,avant.p,avant.roll],apres:[apres.h,apres.p,apres.roll]}));
  expect(ecart(apres.h,avant.h)).toBeLessThan(0.01); expect(Math.abs(apres.p-avant.p)).toBeLessThan(0.01); expect(Math.abs(apres.roll-avant.roll)).toBeLessThan(0.01);
  expect(apres.e.auto).toBe(null);
  await o.ctx.close(); expect(o.erreurs).toEqual([]);
});

test('photo : Explorer — un nom reste sur son point de la photo quand on grossit et qu’on se déplace ; double toucher = photo entière ; Caler : glisser et toucher un nom dans le cadre décalé',async({browser})=>{
  test.setTimeout(300000);
  const o=await ouvrir(browser,'pont-photo-gorges'), page=o.page;
  // Caler : toucher un nom (coordonnées d'écran = canevas + décalage du cadre) ouvre SA fiche
  const cadre=(await etat(o)).e.cadre, textes=(await o.app.frame()).filter(t=>String(t.text).length>3&&!/km|m$/.test(t.text));
  const t=textes.find(x=>{ const P=textPoly(x), mx=P.reduce((a,p)=>a+p[0],0)/4, my=P.reduce((a,p)=>a+p[1],0)/4; return mx>40&&mx<cadre.w-60&&my>60&&my<cadre.h-60; });
  expect(t).toBeTruthy(); const P=textPoly(t), mx=P.reduce((a,p)=>a+p[0],0)/4, my=P.reduce((a,p)=>a+p[1],0)/4;
  await page.mouse.click(cadre.x+mx,cadre.y+my); await page.waitForTimeout(500);
  expect(await page.evaluate(()=>document.getElementById('dbg').classList.contains('open'))).toBe(true);
  console.log('fiche',t.text,'→',await page.textContent('#dbgTitle'));
  await page.evaluate(()=>document.getElementById('dbg').classList.remove('open'));
  // Caler : glisser de 60 px vers la gauche tourne le cap de atan(60/f), f en pixels du cadre
  const s0=await etat(o), f=await o.app.ev('(W/2)/Math.tan(vFov()/2*D)');
  await page.mouse.move(cadre.x+200,cadre.y+250); await page.mouse.down(); await page.mouse.move(cadre.x+170,cadre.y+250,{steps:3}); await page.mouse.move(cadre.x+140,cadre.y+250,{steps:3}); await page.mouse.up();
  const s1=await etat(o); expect(Math.abs(ecart(s1.h,s0.h)-Math.atan(60/f)*180/Math.PI)).toBeLessThan(0.05);
  // Explorer
  await page.click('#g3Mode'); expect(await o.app.ev("G.photo.mode()")).toBe('explorer');
  await page.waitForTimeout(600);
  // un nom écrit maintenant (le glisser a déplacé la vue), vers le milieu de la photo
  const avant=(await o.app.frame()).filter(x=>String(x.text).length>3&&!/km|m$/.test(x.text)).sort((a,b)=>{ const d=x=>{ const Q=textPoly(x); return Math.hypot(Q[0][0]-cadre.w/2,Q[0][1]-cadre.h/2); }; return d(a)-d(b); })[0];
  expect(avant).toBeTruthy(); const nom=avant.text;
  const versPhoto=async(x,y)=>page.evaluate(([x,y])=>{ const ov=document.getElementById('ov').getBoundingClientRect(), im=document.getElementById('photoBg').getBoundingClientRect(), W=window.__vh.ev('W');
    const X=ov.left+x*ov.width/W, Y=ov.top+y*ov.height/window.__vh.ev('H'); return [(X-im.left)/im.width,(Y-im.top)/im.height]; },[x,y]);
  const centre=x=>{ const Q=textPoly(x); return [Q.reduce((a,q)=>a+q[0],0)/4,Q.reduce((a,q)=>a+q[1],0)/4]; };
  const p0=await versPhoto(...centre(avant));
  await deuxDoigts(page,[[300,160],[500,170]],[[220,150],[600,180]],8); // écarter : grossir
  await page.mouse.move(400,200); await page.mouse.down(); await page.mouse.move(340,170,{steps:5}); await page.mouse.up(); // se déplacer
  await page.waitForTimeout(600);
  const v=await o.app.ev('G.photo.vue()'); console.log('vue',JSON.stringify(v)); expect(v.z).toBeGreaterThan(1.5);
  const s2=await etat(o); expect(ecart(s2.h,s1.h)).toBeLessThan(0.001); expect(s2.cam).toBe(s1.cam); // le calage ne bouge pas en Explorer
  const apres=(await o.app.frame()).find(x=>x.text===nom); expect(apres).toBeTruthy();
  const p1=await versPhoto(...centre(apres)), im=await o.app.ev('({w:photoMode.w,h:photoMode.h})');
  console.log('point du nom sur la photo',p0,p1);
  expect(Math.abs(p1[0]-p0[0])*im.w).toBeLessThan(2); expect(Math.abs(p1[1]-p0[1])*im.h).toBeLessThan(2);
  // double toucher : photo entière
  await page.touchscreen.tap(400,200); await page.waitForTimeout(80); await page.touchscreen.tap(400,200); await page.waitForTimeout(500);
  expect((await o.app.ev('G.photo.vue()')).z).toBe(1);
  await o.ctx.close(); expect(o.erreurs).toEqual([]);
});

test('photo : en direct, le bouton verrouille le calage (glisser ne change plus le cap)',async({browser})=>{
  test.setTimeout(300000);
  const m=await charger(), sc=m.sc('pont-est'); ignorerSiAbsent(test,sc);
  const o=await ouvrirSceneReelle(browser,sc,{url:V3,greffes:GREFFES,reglages:m.reglages}), page=o.page;
  const glisser=async()=>{ await page.mouse.move(400,250); await page.mouse.down(); await page.mouse.move(330,250,{steps:5}); await page.mouse.up(); await page.waitForTimeout(200); };
  await page.click('#g3Mode'); expect(await o.app.ev("G.photo.mode()")).toBe('verrou');
  const h0=await o.app.ev('S.headOff'); await glisser(); expect(await o.app.ev('S.headOff')).toBe(h0);
  await page.click('#g3Mode'); expect(await o.app.ev("G.photo.mode()")).toBe('libre');
  await glisser(); expect(ecart(await o.app.ev('S.headOff'),h0)).toBeGreaterThan(1);
  await o.ctx.close(); expect(o.erreurs).toEqual([]);
});
