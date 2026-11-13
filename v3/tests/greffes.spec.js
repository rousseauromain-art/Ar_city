// Greffes de la v3 dans la page (docs/REFONTE-V3.md §3, règle 4) : chaque greffe seule, puis toutes allumées (?g=tout) ; pour chacune, son effet,
// et le comportement de la v1 quand elle est éteinte. Données simulées (aucun réseau) : ces tests tournent sans le dépôt privé des photos.
const {test,expect}=require('@playwright/test');
const {ouvrir,capteurs,videoSynthetique,photoExif}=require('./aide/v3');
const IDS=['soleil2','lune','permutation','echelle2','oeil','icones','rotation','lieuxWikidata','boussoleA','tailleReelle','plaque','capteurRelatif','recalageContinu','montagne','champAuto','nettete','projection','degage','hauteurs','oeilLieu','horizonPhoto','nommer'];
const POS={lat:48.6493,lon:-2.0257};
const MODES=g=>[[g],['tout']]; // seule, puis toutes allumées
const nom=g=>g[0]==='tout'?'toutes allumées':'seule';
const disque='x.fillStyle="rgb(120,160,220)"; x.fillRect(0,0,W,H); x.fillStyle="#fff"; x.beginPath(); x.arc(W/2,H/2,7,0,7); x.fill();';

for(const g of [...IDS.map(i=>[i]),['tout']]){
  test(`greffes ${g.join(',')} : chargée(s) et démarrée(s), sans erreur, cochée(s) dans le panneau, nommée(s) dans le Diagnostic`,async({page})=>{
    const att=g[0]==='tout'?IDS:g, app=await ouvrir(page,{pos:POS,greffes:g});
    expect(app.greffes).toEqual(att);
    await app.waitFor('terrain&&!terrain.refining'); await app.frame(); await app.frame();
    expect(app.errors).toEqual([]); expect(await page.evaluate(()=>window.G.erreurs)).toEqual([]);
    for(const id of IDS) expect(await page.locator('#g3_'+id).isChecked(),id).toBe(att.includes(id));
    await app.ev("$('btnDbg').onclick(); true");
    await expect(page.locator('#dbgBody')).toContainText('allumées : '+att.join(', '));
  });
}

for(const g of MODES('soleil2')) test(`soleil2 (${nom(g)}) : toucher le disque du soleil cale le cap même avec une boussole fausse de 20° ; éteinte, la v1 ne le reconnaît pas`,async({page})=>{
  for(const greffes of [g,[]]){
    const app=await ouvrir(page,{pos:POS,greffes,time:new Date('2026-10-25T13:00:00Z'),settings:{relief:false,headOff:20}});
    const sol=await app.ev('sunNow()'); expect(sol.el).toBeGreaterThan(10);
    await capteurs(app,{cap:sol.az,incl:sol.el}); await videoSynthetique(page,disque);
    await page.click('#btnPoint'); const v=page.viewportSize(); await page.mouse.click(v.width/2,v.height/2);
    const h=await app.ev('S.headOff'), n=await page.locator('#note').textContent();
    if(greffes.length){ expect(n).toContain('calé sur le soleil'); expect(Math.abs(h)).toBeLessThan(0.7); } else { expect(n).not.toContain('soleil'); expect(h).toBe(20); }
    expect(app.errors).toEqual([]);
  }
});

for(const g of MODES('lune')) test(`lune (${nom(g)}) : de nuit, « Caler auto » cale sur la lune de l'image et la dessine ; éteinte, rien`,async({page})=>{
  const {positionLune}=await import('../greffes/_astre.js'), t=new Date('2026-10-25T03:00:00Z'), L=positionLune(t.getTime(),POS.lat,POS.lon);
  for(const greffes of [g,[]]){
    const app=await ouvrir(page,{pos:POS,greffes,time:t,settings:{relief:false,headOff:4}});
    await capteurs(app,{cap:L.az,incl:L.el}); await videoSynthetique(page,disque);
    const textes=(await app.frame()).map(o=>o.text).join(' | ');
    await page.click('#btnAlign'); await expect(page.locator('#note')).not.toHaveText('Calage en cours…',{timeout:20000});
    const n=await page.locator('#note').textContent(), h=await app.ev('S.headOff');
    if(greffes.length){ expect(textes).toMatch(/lune \d+\.\d° · \d+\.\d° · \d+ %/); expect(n).toContain('calé sur la lune'); expect(Math.abs(h)).toBeLessThan(0.7); }
    else { expect(textes).not.toContain('lune '); expect(n).not.toContain('lune'); expect(h).toBe(4); }
    expect(app.errors).toEqual([]);
  }
});

for(const g of MODES('permutation')) test(`permutation (${nom(g)}) : « Caler auto » passe par le test contre le hasard`,async({page})=>{
  const app=await ouvrir(page,{pos:POS,greffes:g});
  const r=await app.ev("(()=>{ let n=0; const f=G.permutation.ajuster; G.permutation.ajuster=ps=>{ n++; return f(ps); }; const r=landmarkFit({cols:[],heading:0,pitch:0,fh:500}); G.permutation.ajuster=f; return {n,r}; })()");
  expect(r.n).toBe(1); expect(r.r.ok).toBe(false); expect(app.errors).toEqual([]);
});

for(const g of MODES('echelle2')) test(`echelle2 (${nom(g)}) : deux lieux touchés donnent le champ et le cap ; éteinte, le champ ne bouge pas`,async({page})=>{
  const {placesAround}=require('../../tests/commun/app');
  const places=placesAround(POS,[['Ouest',12,94,'town',9000],['Est',14,106,'town',9000]]), CAP=100, CHAMP=55; // écartés de 12°, dans le champ (portrait : ~15° affichés)
  for(const greffes of [g,[]]){
    const app=await ouvrir(page,{pos:POS,greffes,places,settings:{relief:false,headOff:5,camFov:67}});
    await app.waitFor("cities.some(c=>c.name==='Est')"); await capteurs(app,{cap:CAP});
    const v=page.viewportSize(), fh=await app.ev(`(innerWidth/2)/Math.tan(vFovFor(${CHAMP})/2*D)`);
    const brg=await app.ev("Object.fromEntries(cities.filter(c=>c.name==='Ouest'||c.name==='Est').map(c=>[c.name,c.brg]))");
    const x=b=>v.width/2+fh*Math.tan(((b-CAP+540)%360-180)*Math.PI/180);
    for(const n of ['Ouest','Est']){ await page.click('#btnPoint'); await page.mouse.click(x(brg[n]),v.height/2); }
    const champ=await app.ev('S.camFov'), cap=await app.ev('pose().heading');
    if(greffes.length){ expect(Math.abs(champ-CHAMP)).toBeLessThanOrEqual(0.5); expect(Math.abs(((cap-CAP+540)%360)-180)).toBeLessThan(0.3); await expect(page.locator('#note')).toContainText('Champ calé'); }
    else expect(champ).toBe(67);
    expect(app.errors).toEqual([]);
  }
});

for(const g of MODES('oeil')) test(`oeil (${nom(g)}) : puce près du rayon, détail au toucher, étage et « Réestimer » passent par les réglages de la v1`,async({page})=>{
  const app=await ouvrir(page,{pos:POS,greffes:g,settings:{obsHeight:12}});
  if(g[0]==='tout'){ await app.waitFor('S.obsHeight===0'); await reglerOeil(page,12); } // greffe oeilLieu : 12 m d'on ne sait où ne sont pas gardés ; réglés ici, ils le sont
  await app.waitFor('!terrainBusy&&terrain&&!terrain.refining&&obsGround!=null');
  const chip=page.locator('#g3Eye'); await expect(chip).toBeVisible(); await expect(chip).toContainText('œil +12 m');
  await chip.click(); await expect(page.locator('#g3EyeT')).toContainText('Sol estimé'); await expect(page.locator('#g3EyeT')).toContainText('correction +12 m');
  await page.fill('#g3EyeEt','3'); await page.locator('#g3EyeEt').dispatchEvent('change'); expect(await app.ev('S.obsHeight')).toBe(10);
  await page.locator('#g3EyeRe').dispatchEvent('click'); expect(await app.ev('S.obsHeight')).toBe(0); // la fenêtre se referme seule après 8 s : clic direct expect(await app.ev("$('obsH').value")).toBe('0');
  expect(app.errors).toEqual([]);
});
test('oeil éteinte : pas de puce',async({page})=>{ await ouvrir(page,{pos:POS,greffes:[]}); await expect(page.locator('#g3Eye')).toHaveCount(0); });

for(const g of MODES('icones')) test(`icones (${nom(g)}) : un libellé sous chacun des 6 boutons, les aides « ? » de la v1 toutes là`,async({page})=>{
  const app=await ouvrir(page,{pos:POS,greffes:g});
  expect(await page.locator('#tools button .lbl').allTextContents()).toEqual(['Calques','Cherch.','Caler','Pointer','Relire','Écran']);
  const q=await page.locator('#sheet .qbtn').count(); expect(q).toBeGreaterThan(5);
  const app0=await ouvrir(page,{pos:POS,greffes:[]}); expect(await page.locator('#tools .lbl').count()).toBe(0); expect(await page.locator('#sheet .qbtn').count()).toBe(q);
  expect(app.errors.concat(app0.errors)).toEqual([]);
});

for(const g of MODES('rotation')) test(`rotation (${nom(g)}) : écran en portrait, téléphone tenu en paysage (roulis −70°) : message après 1,5 s, fermé au toucher`,async({page})=>{
  // écran verrouillé en portrait (rotation automatique coupée) : le navigateur sans tête annonce un écran de bureau en paysage
  await page.addInitScript(()=>{ try{ Object.defineProperty(screen.orientation,'type',{get:()=>'portrait-primary'}); }catch(e){} });
  const t0=new Date('2026-10-26T23:30:00Z'), app=await ouvrir(page,{pos:POS,greffes:g,time:t0});
  expect(await page.evaluate(()=>screen.orientation.type)).toMatch(/^portrait/);
  await capteurs(app,{cap:30,roulis:-70}); await page.waitForTimeout(400); await expect(page.locator('#g3Rot')).toBeHidden();
  await page.clock.setFixedTime(new Date(t0.getTime()+2000)); await expect(page.locator('#g3Rot')).toBeVisible();
  await expect(page.locator('#g3Rot')).toContainText('activez la rotation automatique');
  await page.click('#g3Rot'); await expect(page.locator('#g3Rot')).toBeHidden();
  expect(app.errors).toEqual([]);
});

for(const g of MODES('lieuxWikidata')) test(`lieuxWikidata (${nom(g)}) : Overpass en panne, les lieux viennent de Wikidata ; éteinte, pas de requête Wikidata`,async({browser})=>{
  const b=(id,n,lat,lon,cls,pop)=>({item:{value:'http://www.wikidata.org/entity/'+id},itemLabel:{value:n},coord:{value:`Point(${lon} ${lat})`},classe:{value:'http://www.wikidata.org/entity/'+cls},pop:{value:String(pop)}});
  const fetch=[{match:'query\\.wikidata\\.org/sparql',body:{results:{bindings:[b('Q1','Dinan',48.4547,-2.0466,'Q3957',14000),b('Q2','Cancale',48.6763,-1.8519,'Q3957',5000)]}}}];
  for(const greffes of [g,[]]){ // un contexte neuf à chaque fois : ni cache ni atlas hérités
    const ctx=await browser.newContext(), page=await ctx.newPage();
    const app=await ouvrir(page,{pos:POS,greffes,fetch,beforeStart:"overpassQuery=async()=>{ throw new Error('Overpass en panne (test)'); }; true"});
    await app.waitFor('!loading&&lastFetch',30000);
    const r=await app.ev("({noms:cities.map(c=>c.name),source,wd:(window.__VH_NET||[]).filter(u=>/wikidata\\.org\\/sparql\\?.*P1082/.test(u)).length})");
    if(greffes.length){ expect(r.noms).toEqual(expect.arrayContaining(['Dinan','Cancale'])); expect(r.source).toContain('Wikidata'); }
    else { expect(r.noms).not.toContain('Cancale'); expect(r.wd).toBe(0); }
    expect(app.errors).toEqual([]); await ctx.close();
  }
});

for(const g of MODES('boussoleA')) test(`boussoleA (${nom(g)}) : une boussole perturbée de 60° pendant 3 s ne défait plus le calage ; un vrai saut du gyroscope si (la v1 le défaisait au bout de 2 s)`,async({page})=>{
  const t0=Date.parse('2026-10-26T23:30:00Z');
  for(const greffes of [g,[]]){
    const app=await ouvrir(page,{pos:POS,greffes,time:new Date(t0)});
    const vec=a=>`[Math.sin(${a}*D),Math.cos(${a}*D),0]`;
    await app.ev(`svAbs=${vec(0)}; svRel=${vec(0)}; srAbs=srRel=[1,0,0]; relT=Date.now(); gyroK=null; magBins.fill(null); gyroLearn(); noteCalib(); svAbs=${vec(60)}; true`);
    for(let k=1;k<=6;k++){ await page.clock.setFixedTime(new Date(t0+k*500)); await app.ev('relT=Date.now(); gyroLearn(); true'); }
    const r=await app.ev('({gyroK,gyroResets,pause:magPauseUntil>Date.now()})');
    if(greffes.length){ expect(r.gyroResets).toBe(0); expect(Math.abs(r.gyroK)).toBeLessThan(1); expect(r.pause).toBe(true);
      await page.evaluate(()=>{ for(const a of [10,80]) window.dispatchEvent(new DeviceOrientationEvent('deviceorientation',{alpha:a,beta:90,gamma:0,absolute:false})); });
      await app.ev('svAbs=[Math.sin(60*D),Math.cos(60*D),0]; relT=Date.now(); gyroLearn(); true'); expect(await app.ev('gyroResets')).toBe(1); }
    else { expect(r.gyroResets).toBe(1); expect(r.pause).toBe(false); }
    expect(app.errors).toEqual([]);
  }
});

// tailleReelle : un monument proche (gratte-ciel à 0,2 km, comme Les Horizons vus de près ; 60 m supposés : 16,7° vus d'ici, plus que le plafond) mesuré à deux inclinaisons. Hauteur dessinée de la silhouette, en degrés
// (sol → sommet, d'après les ordonnées passées à drawSprite). Éteinte : le plafond de la v1 (30 % de l'écran, 240 px) ne joue que pied à l'écran.
async function silhouette(page,greffes,inclinaisons){
  const app=await ouvrir(page,{pos:POS,greffes,settings:{relief:false,cross:false}});
  const m=require('../../tests/commun/app').offset(POS,0.2,30);
  await app.ev(`applyMonuments([{name:'Les Horizons',lat:${m.lat},lon:${m.lon},links:20,types:'gratte-ciel',qid:'Q3W',htWd:100,prot:true}],'test',[],false,30,1); true`);
  await app.waitFor("monumentSites.some(c=>c.name==='Les Horizons'&&c.dist!=null)");
  await app.ev("window.__spr=[]; const _d=drawSprite; drawSprite=(k,x,yT,yB,...r)=>{ window.__spr.push([yT,yB]); return _d(k,x,yT,yB,...r); }; true");
  const res=[];
  for(const incl of inclinaisons){
    await capteurs(app,{cap:34,incl}); await app.ev('window.__spr.length=0; true'); const f=await app.frame(); // monument 4° à gauche : place pour son nom à droite
    const r=await app.ev("(()=>{ const s=window.__spr[window.__spr.length-1]; if(!s) return null; const fh=(W/2)/Math.tan(vFov()/2*D), P=pose(), a=y=>P.pitch-Math.atan((y-H/2)/fh)/D; return {deg:a(s[0])-a(s[1]),px:s[1]-s[0],yTop:s[0],yBase:s[1],H,mx:Math.min(240,H*0.3),vraie:monumentSites.find(c=>c.name==='Les Horizons').angH}; })()");
    const nom=f.find(t=>t.text==='Les Horizons'); res.push({incl,...r,nomY:nom?(nom.m[1]*nom.x+nom.m[3]*nom.y+nom.m[5])/nom.dpr:null,nomVu:!!nom});
  }
  expect(app.errors).toEqual([]); return {res};
}
for(const g of MODES('tailleReelle')) test(`tailleReelle (${nom(g)}) : même hauteur en degrés pied à l'écran et téléphone levé ; éteinte, le plafond de la v1`,async({page})=>{
  const on=(await silhouette(page,g,[0,27])).res, vraie=on[0].vraie; console.log('greffe',JSON.stringify(on)); // hauteur réelle vue d'ici (sol → sommet, sans relief)
  for(const r of on){ expect(r,'silhouette dessinée').not.toBeNull(); expect(Math.abs(r.deg-vraie)).toBeLessThan(0.6); expect(r.nomVu,`nom dessiné (incl ${r.incl})`).toBe(true); expect(r.nomY).toBeGreaterThan(70); }
  expect(Math.abs(on[0].deg-on[1].deg)).toBeLessThan(0.3);
  const off=(await silhouette(page,[],[0,27])).res; console.log('éteinte',JSON.stringify(off));
  expect(Math.abs(off[0].px-off[0].mx)).toBeLessThan(0.5); expect(off[0].deg).toBeLessThan(vraie-3); // pied à l'écran : plafonnée
  expect(Math.abs(off[1].deg-vraie)).toBeLessThan(0.6); // pied hors de l'écran : taille réelle (l'incohérence constatée)
});
test('tailleReelle : sommet hors de l’écran (téléphone baissé) → nom au bord haut, sous la ligne des puces ; silhouette toujours à taille réelle',async({page})=>{
  const {res}=await silhouette(page,['tailleReelle'],[-14]), r=res[0], lim=await page.evaluate(()=>window.G.tailleReelle.limiteHaute());
  console.log(JSON.stringify(r),'limite',lim);
  expect(r.yTop).toBeLessThan(lim); expect(Math.abs(r.deg-r.vraie)).toBeLessThan(0.6);
  expect(r.nomVu,'le nom est dessiné').toBe(true); expect(r.nomY).toBeGreaterThan(lim); expect(r.nomY).toBeLessThan(lim+80);
});

for(const g of MODES('plaque')) test(`plaque (${nom(g)}) : plaque filmée → adresse → position corrigée après « Appliquer », tenue contre le GPS ; éteinte, pas de bouton`,async({page})=>{
  const cible={lat:POS.lat+30/111320,lon:POS.lon}; // le numéro lu est à 30 m au nord du GPS
  const fetch=[{match:'data\\.geopf\\.fr/geocodage/search',body:{features:[{geometry:{coordinates:[cible.lon,cible.lat]},properties:{type:'housenumber',label:'12 Rue de Dinan 35400 Saint-Malo',housenumber:'12',street:'Rue de Dinan'}}]}}];
  await page.addInitScript(()=>{ window.__vhOcr=async()=>'12 RUE DE DINAN\n35400 SAINT-MALO'; });
  for(const greffes of [g,[]]){
    const app=await ouvrir(page,{pos:POS,greffes,fetch,settings:{relief:false}});
    if(!greffes.length){ await expect(page.locator('#g3PlaqueBtn')).toHaveCount(0); expect(app.errors).toEqual([]); continue; }
    await videoSynthetique(page,'x.fillStyle="#246"; x.fillRect(0,0,W,H);');
    await page.click('#btnSet'); await page.click('#g3PlaqueBtn');
    await expect(page.locator('#g3PlaqueMsg')).toContainText('Plaque lue : « 12 rue de dinan »',{timeout:30000});
    await expect(page.locator('#g3PlaqueMsg')).toContainText('corrigée de 30 m');
    expect((await app.ev('(window.__VH_NET||[]).filter(u=>/geocodage/.test(u))'))[0]).toMatch(/q=12%20rue%20de%20dinan&lat=48\.649300&lon=-2\.025700/);
    await page.click('#g3PlaqueOui');
    const d=await app.ev(`distBrg(pos,${JSON.stringify(cible)}).dist*1000`); expect(d).toBeLessThan(0.5);
    expect(await app.ev(`G.plaque.garder(${POS.lat},${POS.lon},10)`)).toBe(true); // le GPS à 30 m pour ± 10 m : la position corrigée tient (20 s)
    expect(await app.ev(`distBrg(pos,${JSON.stringify(cible)}).dist*1000`)).toBeLessThan(0.5);
    expect(app.errors).toEqual([]);
  }
});

for(const g of MODES('capteurRelatif')) test(`capteurRelatif (${nom(g)}) : les quaternions du capteur relatif remplacent le gyroscope de deviceorientation ; éteinte, deviceorientation`,async({page})=>{
  const {quaternionDepuisAngles}=await import('../greffes/capteurRelatif.js'), q=quaternionDepuisAngles(30,90,0);
  await page.addInitScript(()=>{ window.RelativeOrientationSensor=class{ constructor(o){ this.o=o; this.l={}; window.__ros=this; } addEventListener(t,f){ (this.l[t]=this.l[t]||[]).push(f); } start(){} stop(){}
    lire(q){ this.quaternion=q; for(const f of this.l.reading||[]) f(); } }; });
  for(const greffes of [g,[]]){
    const app=await ouvrir(page,{pos:POS,greffes});
    await page.evaluate(q=>{ if(window.__ros) window.__ros.lire(q); window.dispatchEvent(new DeviceOrientationEvent('deviceorientation',{alpha:200,beta:90,gamma:0,absolute:false})); },q);
    const r=await app.ev('({cap:yawOf(svRel),q:yawOf(camAxes(30,90,0).v),o:yawOf(camAxes(200,90,0).v)})');
    if(greffes.length){ expect(Math.abs(r.cap-r.q)).toBeLessThan(0.01); expect(await app.ev('G.capteurRelatif.enService()')).toBe(true); expect(await app.ev('G.capteurRelatif.etat().total')).toBe(1); }
    else { expect(Math.abs(r.cap-r.o)).toBeLessThan(0.01); expect(await page.evaluate(()=>window.__ros)).toBeUndefined(); }
    expect(app.errors).toEqual([]);
  }
});

for(const g of MODES('recalageContinu')) test(`recalageContinu (${nom(g)}) : le soleil dans l’image, cap faux de 4° → corrigé seul par demi-pas, pas plus d’un pas en 10 s ; éteinte, rien`,async({page})=>{
  for(const greffes of [g,[]]){
    const app=await ouvrir(page,{pos:POS,greffes,time:new Date('2026-10-25T13:00:00Z'),settings:{relief:false,headOff:4}});
    const sol=await app.ev('sunNow()'); await capteurs(app,{cap:sol.az,incl:sol.el}); await videoSynthetique(page,disque);
    if(!greffes.length){ expect(await page.evaluate(()=>window.G.recalageContinu)).toBeUndefined(); expect(await app.ev('S.headOff')).toBe(4); continue; }
    const pas=async ts=>page.evaluate(ts=>{ for(const t of ts) window.G.recalageContinu.tick(t); return window.G.recalageContinu.etat(); },ts);
    const T=1e9;
    await pas([T,T+3000]); const h1=await app.ev('S.headOff'); expect(Math.abs(h1-2)).toBeLessThan(0.3);
    await expect(page.locator('#note')).toContainText('Cap recalé sur le soleil');
    await capteurs(app,{cap:sol.az,incl:sol.el});
    await pas([T+6000,T+9000]); expect(await app.ev('S.headOff')).toBe(h1); // pause de 10 s entre deux pas
    const e=await pas([T+13000,T+16000]); expect(Math.abs(await app.ev('S.headOff')-1)).toBeLessThan(0.3); expect(e.pas).toBe(2);
    expect(app.errors).toEqual([]);
  }
});

for(const g of MODES('montagne')) test(`montagne (${nom(g)}) : les sommets OSM dominants à moins de 120 km s’affichent (ceux qui ne dominent pas leurs voisins non) ; éteinte, rien`,async({page})=>{
  const at=(dKm,brg)=>({lat:POS.lat+dKm*Math.cos(brg*Math.PI/180)/111.2,lon:POS.lon+dKm*Math.sin(brg*Math.PI/180)/(111.2*Math.cos(POS.lat*Math.PI/180))});
  const el=(id,name,ele,p)=>({type:'node',id,lat:p.lat,lon:p.lon,tags:{natural:'peak',name,ele:String(ele)}});
  const EL=[el(1,'Pic Haut',2500,at(50,90)),el(2,'Pic Voisin',2400,at(50.8,90)),el(3,'Petit Mont',300,at(5,92)),el(4,'Mont Loin',1800,at(150,90))];
  const beforeStart=`overpassQuery=(o=>async(q,ms,p)=>/natural"="peak"\\]\\["name"\\]\\["ele"\\]/.test(q)?p({elements:${JSON.stringify(EL)}}):o(q,ms,p))(overpassQuery); true`;
  for(const greffes of [g,[]]){
    const app=await ouvrir(page,{pos:POS,greffes,beforeStart});
    await app.waitFor('terrain&&!terrain.refining',60000);
    if(greffes.length) await app.waitFor("G.montagne.etat().msg==='ok'",30000);
    await capteurs(app,{cap:90,incl:0}); await app.frame();
    const textes=(await app.frame()).map(o=>o.text).join(' | '), noms=await app.ev('farPeaks.map(c=>c.name)');
    if(greffes.length){ expect(noms).toEqual(expect.arrayContaining(['Pic Haut','Petit Mont'])); expect(noms).not.toContain('Pic Voisin'); expect(noms).not.toContain('Mont Loin');
      expect(textes).toContain('Pic Haut'); expect(textes).toContain('Petit Mont'); }
    else { expect(noms).toEqual([]); expect(textes).not.toContain('Pic Haut'); }
    expect(app.errors).toEqual([]);
  }
});

test('montagne : calque « Sommets » (les retire, les remet) ; Diagnostic : sommets du champ et raison ; masquage du relief décoché → message et alerte',async({page})=>{
  const at=(dKm,brg)=>({lat:POS.lat+dKm*Math.cos(brg*Math.PI/180)/111.2,lon:POS.lon+dKm*Math.sin(brg*Math.PI/180)/(111.2*Math.cos(POS.lat*Math.PI/180))});
  const EL=[{type:'node',id:1,...at(50,90),tags:{natural:'peak',name:'Pic Haut',ele:'2500'}}];
  const beforeStart=`overpassQuery=(o=>async(q,ms,p)=>/natural"="peak"\\]\\["name"\\]\\["ele"\\]/.test(q)?p({elements:${JSON.stringify(EL)}}):o(q,ms,p))(overpassQuery); true`;
  let app=await ouvrir(page,{pos:POS,greffes:['montagne'],beforeStart});
  await app.waitFor('terrain&&!terrain.refining',60000); await app.waitFor("G.montagne.etat().msg==='ok'",30000);
  await capteurs(app,{cap:90,incl:0});
  await app.ev("$('btnDbg').onclick(); true");
  await expect(page.locator('#dbgBody')).toContainText('ancrage des noms : sur le relief');
  await expect(page.locator('#dbgBody')).toContainText(/sommets dans le champ .* Pic Haut 2500 m 50\.0 km → net/);
  await page.click('#dbgClose'); await page.click('#btnLayers'); const cb=page.locator('#lyMtg'); await expect(cb).toBeChecked();
  await cb.uncheck(); expect(await app.ev('farPeaks.some(c=>c.montagne)')).toBe(false);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('vh3_montagne')))).toEqual({calque:false});
  await cb.check(); await app.waitFor("farPeaks.some(c=>c.name==='Pic Haut')",30000);
  // masquage du relief décoché : la v1 pose les noms sur l'horizon et ne charge aucun sommet lointain ; la greffe le dit
  app=await ouvrir(page,{pos:POS,greffes:['montagne'],beforeStart,settings:{relief:false,skyline:true}});
  await app.waitFor('terrain&&!terrain.refining',60000); await app.waitFor("G.montagne.etat().msg==='ok'",30000);
  await expect(page.locator('#note')).toContainText('Masquer ce qui est caché par le relief');
  await app.ev("$('btnDbg').onclick(); true");
  await expect(page.locator('#dbgBody')).toContainText('est DÉCOCHÉ (Réglages) : tous les noms sont posés sur la ligne d’horizon');
  expect(app.errors).toEqual([]);
});

/** Pincement à deux doigts au milieu de l'écran : les doigts passent d'un écart `de` à un écart `a` (px). */
async function pincer(page,de,a){
  const cdp=await page.context().newCDPSession(page), v=page.viewportSize(), y=Math.round(v.height*0.45), cx=v.width/2, pts=d=>[{x:Math.round(cx-d/2),y,id:1},{x:Math.round(cx+d/2),y,id:2}];
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:pts(de)});
  for(const k of [1,2,3]) await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:pts(de+(a-de)*k/3)});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await cdp.detach();
}
// l'estimation elle-même (gyroscope + image) est prouvée dans greffes.test.mjs sur une caméra simulée ; ici : ce que la page en fait
const mesureFaite='(()=>{ window.G.champAuto.suivi().etat=()=>({ok:true,champ:68.3,n:15,rms:0.41,retard:90,rotation:104,paires:15,dernier:""}); window.G.champAuto.conclure(); return true; })()';
for(const g of MODES('champAuto')) test(`champAuto (${nom(g)}) : le champ mesuré est appliqué, gardé pour cette caméra, le pincement ne le change plus ; déréglé, un bouton le reprend`,async({page})=>{
  let app=await ouvrir(page,{pos:POS,greffes:g,settings:{camFov:44}});
  await page.waitForFunction(()=>window.G.champAuto.etat().camera);
  await pincer(page,120,200); const avant=await app.ev('S.camFov'); expect(avant).toBeLessThan(44); // pas encore mesuré : le pincement règle le champ, comme la v1
  await page.evaluate(()=>window.G.champAuto.demarrer()); await expect(page.locator('#g3Champ')).toHaveText('champ : mesure 0 % · tournez-vous lentement'); // la mesure se voit
  await page.evaluate(mesureFaite); await expect(page.locator('#g3Champ')).toHaveText('champ 68.5° mesuré');
  expect(await app.ev('S.camFov')).toBe(68.5); expect(await page.locator('#fov').inputValue()).toBe('68.5');
  await expect(page.locator('#note')).toContainText(`Champ de la caméra mesuré : 68.5° (il était réglé à ${avant}°)`);
  const garde=await page.evaluate(()=>JSON.parse(localStorage.getItem('vh3_champAuto'))), cam=Object.keys(garde); expect(cam.length).toBe(1); expect(garde[cam[0]]).toMatchObject({champ:68.5,n:15});
  await pincer(page,120,200); expect(await app.ev('S.camFov')).toBe(68.5); await expect(page.locator('#note')).toContainText('le pincement ne le change plus');
  await expect(page.locator('#g3ChampV')).toHaveText('68.5°');
  await app.ev("$('btnDbg').onclick(); true"); await expect(page.locator('#dbgBody')).toContainText('champAuto : champ mesuré 68.5° (15 mesures, 104° de rotation');
  expect(app.errors).toEqual([]);
  // page rouverte avec un champ déréglé : la mesure de cette caméra est retrouvée, signalée, reprise d'un bouton
  app=await ouvrir(page,{pos:POS,greffes:g,settings:{camFov:44}});
  await page.waitForFunction(()=>window.G.champAuto.etat().mesure);
  await expect(page.locator('#note')).toContainText('Champ réglé à 44°, mesuré à 68.5°'); await expect(page.locator('#g3ChampBtn')).toHaveText('Reprendre la mesure');
  await page.evaluate(()=>document.getElementById('g3ChampBtn').click()); expect(await app.ev('S.camFov')).toBe(68.5); await expect(page.locator('#g3ChampBtn')).toHaveText('Remesurer');
  expect(app.errors).toEqual([]);
});
test('champAuto éteinte : ni ligne dans les Réglages ni puce, le pincement règle le champ comme dans la v1',async({page})=>{
  const app=await ouvrir(page,{pos:POS,greffes:[],settings:{camFov:60}});
  await expect(page.locator('#g3ChampRow')).toHaveCount(0); await expect(page.locator('#g3Champ')).toHaveCount(0);
  await pincer(page,120,200); expect(await app.ev('S.camFov')).toBeLessThan(60); expect(app.errors).toEqual([]);
});

for(const g of MODES('nettete')) test(`nettete (${nom(g)}) : à l'ouverture de la caméra, la mise au point est fixée au plus loin ; éteinte, rien n'est demandé`,async({page})=>{
  const beforeStart=`(()=>{ const o=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices); navigator.mediaDevices.getUserMedia=async k=>{ const st=await o(k), tr=st.getVideoTracks()[0];
    tr.getCapabilities=()=>({focusMode:['continuous','manual'],focusDistance:{min:0.1,max:12.5,step:0.01}}); tr.applyConstraints=async q=>{ (window.__mise=window.__mise||[]).push(q); }; return st; }; return true; })()`;
  for(const greffes of [g,[]]){
    const app=await ouvrir(page,{pos:POS,greffes,beforeStart});
    if(!greffes.length){ await app.frame(); expect(await page.evaluate(()=>window.__mise)).toBeUndefined(); continue; }
    await page.waitForFunction(()=>window.G.nettete.etat().mode==='infini');
    expect(await page.evaluate(()=>window.__mise)).toEqual([{advanced:[{focusMode:'manual',focusDistance:12.5}]}]);
    await app.ev("$('btnDbg').onclick(); true"); await expect(page.locator('#dbgBody')).toContainText('nettete : mise au point fixée à l’infini');
    expect(app.errors).toEqual([]);
  }
});

for(const g of MODES('nommer')) test(`nommer (${nom(g)}) : toucher le relief ouvre sa fiche (distance, altitude), le nom vient d'OpenStreetMap, une épingle le garde à l'écran ; éteinte, rien`,async({page})=>{
  const {offset}=require('../../tests/commun/app'), mont=offset(POS,2,90), v=page.viewportSize();
  const EL=[{type:'node',id:7,lat:mont.lat,lon:mont.lon,tags:{natural:'peak',name:'Mont Essai',ele:'300',wikipedia:'fr:Mont Essai'}},{type:'node',id:8,...offset(POS,1.75,90),tags:{place:'locality',name:'Le Pré Haut'}},
    {type:'area',id:9,tags:{boundary:'administrative',admin_level:'8',name:'Saint-Essai'}}];
  const beforeStart=`overpassQuery=(o=>async(q,ms,p)=>/mountain_pass/.test(q)?p({elements:${JSON.stringify(EL)}}):o(q,ms,p))(overpassQuery); true`;
  for(const greffes of [g,[]]){
    const app=await ouvrir(page,{pos:POS,greffes,beforeStart,terrain:{features:[{lat:mont.lat,lon:mont.lon,r:300,h:300}]}}); // colline de 300 m à 2 km à l'est
    await app.waitFor('terrain&&!terrain.refining',60000);
    await capteurs(app,{cap:90,incl:4}); await app.frame();
    await page.mouse.click(v.width/2,v.height/2); // 4° au-dessus de l'horizon, plein est : le flanc de la colline
    if(!greffes.length){ await app.frame(); expect(await page.evaluate(()=>document.getElementById('dbg').classList.contains('open'))).toBe(false); continue; }
    await expect(page.locator('#dbgTitle')).toHaveText('Relief touché');
    const corps=page.locator('#dbgBody');
    await expect(corps).toContainText('Mont Essai'); await expect(corps).toContainText(/sommet · 300 m · à 1,7 km d’ici · direction 90°/);
    await expect(corps).toContainText(/Point touché.*relief à 1,7 km, (29\d|30\d) m/); await expect(corps).toContainText('Le Pré Haut — lieu-dit'); await expect(corps).toContainText('Saint-Essai (commune)');
    await expect(corps.locator('a',{hasText:'Wikipédia'})).toHaveAttribute('href','https://fr.wikipedia.org/wiki/Mont_Essai');
    await page.click('#dbgClose');
    expect((await app.frame()).map(o=>o.text)).toContain('Mont Essai 300 m · 1,7 km');
    await page.mouse.click(v.width/2,v.height*0.2); await expect(page.locator('#note')).toContainText('C’est le ciel'); // bien au-dessus de la silhouette
    await app.ev("$('btnDbg').onclick(); true"); await expect(page.locator('#dbgBody')).toContainText(/nommer : 1 relief\(s\) touché\(s\) · dernier : ciel/);
    expect(app.errors).toEqual([]);
  }
});

for(const g of MODES('projection')) test(`projection (${nom(g)}) : le soleil est dessiné là où une caméra le voit (la v1 : 30 px plus bas, à 26° du centre) ; le toucher là le trouve ; éteinte, la v1`,async({page})=>{
  await page.setViewportSize({width:915,height:412}); // téléphone en paysage : l'écart grandit avec la largeur du champ
  const R=Math.PI/180, dz=26;
  for(const greffes of [g,[]]){
    const app=await ouvrir(page,{pos:POS,greffes,time:new Date('2026-10-25T13:00:00Z'),settings:{relief:false}});
    const sol=await app.ev('sunNow()'), incl=sol.el-7; await capteurs(app,{cap:sol.az-dz,incl}); await app.frame();
    const t=(await app.frame()).find(o=>/^soleil /.test(o.text)); expect(t).toBeTruthy();
    const {W,H,fh}=await app.ev('({W,H,fh:(W/2)/Math.tan(vFov()/2*D)})');
    const xv=W/2+fh*Math.tan(dz*R), yv=H/2+fh*Math.tan((incl-sol.el)*R); // la v1
    const X=Math.cos(sol.el*R)*Math.sin(dz*R), Z=Math.cos(sol.el*R)*Math.cos(dz*R)*Math.cos(incl*R)+Math.sin(sol.el*R)*Math.sin(incl*R), Y=-Math.cos(sol.el*R)*Math.cos(dz*R)*Math.sin(incl*R)+Math.sin(sol.el*R)*Math.cos(incl*R);
    const xs=W/2+fh*X/Z, ys=H/2-fh*Y/Z; // la caméra
    expect(yv-ys).toBeGreaterThan(15);
    if(!greffes.length){ expect(Math.abs(t.x-(xv+22))).toBeLessThan(0.01); expect(Math.abs(t.y-(yv+4))).toBeLessThan(0.01); }
    else { expect(Math.abs(t.x-(xs+22))).toBeLessThan(6); expect(Math.abs(t.y-(ys+4))).toBeLessThan(6); // le libellé suit son symbole, à 22 px (déplacé d'un bloc depuis son propre ancrage)
      const q=await page.evaluate(([x,y])=>window.G.projection.inverse(x,y),[xs,ys]); expect(Math.abs(q[0]-xv)).toBeLessThan(0.05); expect(Math.abs(q[1]-yv)).toBeLessThan(0.05); }
    // calage au doigt : toucher le soleil là où la caméra le voit. Greffe allumée : rien à corriger ; v1 : elle « corrige » l'horizon de son propre écart
    await page.click('#btnPoint'); await page.mouse.click(xs,ys); await expect(page.locator('#note')).toContainText('calé sur le soleil');
    const dp=Math.abs(await app.ev('S.pitchOff')), dh=Math.abs(await app.ev('((S.headOff+540)%360)-180'));
    if(greffes.length){ expect(dp).toBeLessThan(0.15); expect(dh).toBeLessThan(0.15); } else expect(dp).toBeGreaterThan(0.8);
    if(greffes.length){ await app.ev("$('btnDbg').onclick(); true"); await expect(page.locator('#dbgBody')).toContainText('projection : exacte · inclinaison'); }
    expect(app.errors).toEqual([]);
  }
});

/** Petite photo JPEG sans EXIF, ouverte par le champ de fichier de la page (position simulée faute de position dans le fichier). */
async function rejouerPhoto(page,app){
  await app.ev("S.simPos='48.6493, -2.0257'; true");
  const b64=await page.evaluate(()=>{ const c=document.createElement('canvas'); c.width=64; c.height=48; const x=c.getContext('2d'); x.fillStyle='#7aa'; x.fillRect(0,0,64,48); return c.toDataURL('image/jpeg').split(',')[1]; });
  await page.setInputFiles('#photoFile',{name:'photo.jpg',mimeType:'image/jpeg',buffer:Buffer.from(b64,'base64')}); await app.waitFor('photoMode&&pos');
}
for(const g of MODES('degage')) test(`degage (${nom(g)}) : ÉCRAN masque puces, boutons et barre du bas (plus d'obstacle pour les noms), ⤡ les ramène ; en photo le bandeau est replié ; éteinte, la v1`,async({page})=>{
  for(const greffes of [g,[]]){
    const app=await ouvrir(page,{pos:POS,greffes});
    await app.frame(); expect(await app.ev('uiObstacles().length')).toBeGreaterThan(0);
    await page.click('#btnFs');
    if(!greffes.length){ await expect(page.locator('#chips')).toBeVisible(); await expect(page.locator('#bar')).toBeVisible(); await expect(page.locator('#g3Retour')).toHaveCount(0); }
    else { for(const s of ['#chips','#tools','#bar']) await expect(page.locator(s)).toBeHidden();
      await app.frame(); expect(await app.ev('uiObstacles().length')).toBe(0); // les noms peuvent descendre jusqu'en bas
      await page.click('#g3Retour'); for(const s of ['#chips','#tools','#bar']) await expect(page.locator(s)).toBeVisible(); await expect(page.locator('#g3Retour')).toBeHidden();
      await page.evaluate(()=>window.G.degage.regler(true)); await page.evaluate(()=>document.dispatchEvent(new Event('fullscreenchange'))); await expect(page.locator('#chips')).toBeVisible(); } // geste « retour » : tout revient
    await page.evaluate(()=>{ if(document.fullscreenElement) return document.exitFullscreen(); });
    await rejouerPhoto(page,app);
    if(!greffes.length){ await expect(page.locator('#photoChip')).toBeVisible(); await expect(page.locator('#g3Photo')).toHaveCount(0); }
    else { await expect(page.locator('#photoChip')).toBeHidden(); await expect(page.locator('#g3Photo')).toHaveText('📷 photo · détails');
      await page.click('#g3Photo'); await expect(page.locator('#photoChip')).toBeVisible(); await expect(page.locator('#photoChip')).toContainText('quitter');
      await page.click('#g3Photo'); await expect(page.locator('#photoChip')).toBeHidden(); }
    expect(app.errors).toEqual([]);
  }
});
test('champAuto : en photo rejouée, pas de puce « champ » (son champ vient du fichier) et le pincement règle le champ comme dans la v1',async({page})=>{
  const app=await ouvrir(page,{pos:POS,greffes:['champAuto'],settings:{camFov:60}});
  await page.waitForFunction(()=>window.G.champAuto.etat().camera);
  await page.evaluate(()=>window.G.champAuto.demarrer()); await expect(page.locator('#g3Champ')).toBeVisible();
  await page.evaluate(mesureFaite); expect(await app.ev('S.camFov')).toBe(68.5);
  await rejouerPhoto(page,app); await expect(page.locator('#g3Champ')).toBeHidden();
  await pincer(page,120,200); expect(await app.ev('S.camFov')).toBeLessThan(68.5);
  expect(app.errors).toEqual([]);
});

/** Curseur de la hauteur d'œil réglé comme au doigt. */
const reglerOeil=(page,v)=>page.evaluate(v=>{ const s=document.getElementById('obsH'); s.value=String(v); s.dispatchEvent(new Event('input')); s.dispatchEvent(new Event('change')); },v);
for(const g of MODES('oeilLieu')) test(`oeilLieu (${nom(g)}) : en direct, une hauteur d'œil réglée ailleurs revient à 0, celle réglée ici est gardée à 150 m près et reprise au retour`,async({page})=>{
  const app=await ouvrir(page,{pos:POS,greffes:g,settings:{obsHeight:13}});
  await app.waitFor('S.obsHeight===0'); await expect(page.locator('#note')).toContainText('remise à 0'); // 13 m d'on ne sait où : pas gardée
  expect(await page.evaluate(()=>window.G.oeilLieu.etat().lieux)).toEqual([]);
  await reglerOeil(page,20); expect((await page.evaluate(()=>window.G.oeilLieu.etat().lieux)).map(l=>l.h)).toEqual([20]);
  await app.ev(`onNewPos(${POS.lat+0.0009},${POS.lon},5); true`); await page.evaluate(()=>window.G.oeilLieu.suivre()); expect(await app.ev('S.obsHeight')).toBe(20); // 100 m : même lieu
  await app.ev(`onNewPos(${POS.lat+0.01},${POS.lon},5); true`); await page.evaluate(()=>window.G.oeilLieu.suivre()); expect(await app.ev('S.obsHeight')).toBe(0); // 1,1 km : au sol
  expect(await page.evaluate(()=>window.G.oeilLieu.statut())).toContain('à 1.1 km d’ici');
  await app.ev(`onNewPos(${POS.lat},${POS.lon},5); true`); await page.evaluate(()=>window.G.oeilLieu.suivre()); expect(await app.ev('S.obsHeight')).toBe(20); // retour : reprise
  await expect(page.locator('#note')).toContainText('reprise'); expect(await page.inputValue('#obsH')).toBe('20');
  expect(JSON.parse(await page.evaluate(()=>localStorage.getItem('vh3_oeilLieu'))).length).toBe(1);
  expect(app.errors).toEqual([]);
});
test('oeilLieu : sur une photo, la hauteur d’œil vient de l’altitude de la photo (en hauteur à partir de 10 m au-dessus du sol du modèle, sinon au sol) ; corrigée à la main, elle est gardée pour l’endroit de la photo ; photo quittée, retour à la hauteur du lieu',async({page})=>{
  const LIEU={lat:POS.lat+0.05,lon:POS.lon}, N=49.1; // plateau à 100 m sous la photo ; géoïde de Saint-Malo
  const app=await ouvrir(page,{pos:POS,greffes:['oeilLieu'],terrain:{features:[{lat:LIEU.lat,lon:LIEU.lon,r:1500,h:100}]}});
  await reglerOeil(page,7); // hauteur du lieu où l'on est : ne doit pas servir à la photo
  const b64=await page.evaluate(()=>{ const c=document.createElement('canvas'); c.width=64; c.height=48; const x=c.getContext('2d'); x.fillStyle='#7aa'; x.fillRect(0,0,64,48); return c.toDataURL('image/jpeg').split(',')[1]; });
  const photo=alt=>({name:'photo.jpg',mimeType:'image/jpeg',buffer:photoExif(Buffer.from(b64,'base64'),{...LIEU,alt})});
  const decision=()=>page.evaluate(()=>{ const e=window.G.oeilLieu.etat(); return e.photo&&e.photo.decision; });
  await page.setInputFiles('#photoFile',photo(100+N+1.6+25)); await app.waitFor('photoMode&&pos');
  expect(await app.ev('Math.abs(pos.lat-'+LIEU.lat+')<1e-4&&Math.abs(photoMode.alt-'+(100+N+1.6+25)+')<0.01')).toBe(true);
  await expect.poll(decision,{timeout:30000}).toBeTruthy();
  let d=await decision(); expect(d.source).toBe('altitude'); expect(Math.abs(d.correction-25)).toBeLessThanOrEqual(1); expect(await app.ev('S.obsHeight')).toBe(d.correction);
  await expect(page.locator('#note')).toContainText('Photo prise en hauteur'); expect(await app.ev('Math.round(obsGround)')).toBe(100);
  await page.setInputFiles('#photoFile',photo(100+N+1.6+4)); await expect.poll(async()=>{ const x=await decision(); return x&&x.correction; },{timeout:30000}).toBe(0); // 4 m : au sol
  expect(await app.ev('S.obsHeight')).toBe(0); expect((await decision()).texte).toMatch(/^au sol/);
  await reglerOeil(page,5); expect((await decision()).source).toBe('main'); // corrigée à la main : gardée pour cet endroit
  await page.setInputFiles('#photoFile',photo(100+N+1.6+40)); await expect.poll(async()=>{ const x=await decision(); return x&&x.source+x.correction; },{timeout:30000}).toBe('main5'); expect(await app.ev('S.obsHeight')).toBe(5);
  await page.evaluate(()=>document.getElementById('photoChip').click()); await app.waitFor('!photoMode&&S.obsHeight===7'); // photo quittée : hauteur du lieu
  expect(app.errors).toEqual([]);
});

/** Photo JPEG d'une rue synthétique (appareil levé de `inclinaison`°, penché de `roulis`°), avec une position EXIF ; champ 71,5° comme le réglage de la page. */
async function photoRue(page,{inclinaison,roulis=0,graine=3}){
  const {rue}=await import('./aide/ville-synthetique.mjs'), im=rue({w:1280,h:964,champ:71.5,inclinaison,roulis,graine});
  const b64=await page.evaluate(({g,w,h})=>{ const o=Uint8Array.from(atob(g),ch=>ch.charCodeAt(0)), c=document.createElement('canvas'); c.width=w; c.height=h; const x=c.getContext('2d'), d=x.createImageData(w,h);
    for(let i=0;i<w*h;i++){ d.data[4*i]=d.data[4*i+1]=d.data[4*i+2]=o[i]; d.data[4*i+3]=255; } x.putImageData(d,0,0); return c.toDataURL('image/jpeg',0.9).split(',')[1]; },{g:Buffer.from(im.g).toString('base64'),w:im.w,h:im.h});
  return {name:'rue.jpg',mimeType:'image/jpeg',buffer:photoExif(Buffer.from(b64,'base64'),{...POS,alt:60})};
}
for(const g of MODES('horizonPhoto')) test(`horizonPhoto (${nom(g)}) : sur une photo de rue, l'horizon est réglé d'après les verticales des bâtiments ; il suit le champ s'il est corrigé, jamais un horizon réglé à la main ; éteinte, l'horizon reste au milieu`,async({page})=>{
  test.setTimeout(90000);
  for(const greffes of [g,[]]){
    const app=await ouvrir(page,{pos:POS,greffes,settings:{camFov:71.5}});
    await page.setInputFiles('#photoFile',await photoRue(page,{inclinaison:9,roulis:1})); await app.waitFor('photoMode&&pos');
    if(!greffes.length){ await page.waitForTimeout(800); expect(await app.ev('S.pitchOff')).toBe(0); continue; } // la v1 : horizon au milieu de l'image
    await app.waitFor('S.pitchOff!==0'); const e=await page.evaluate(()=>window.G.horizonPhoto.etat());
    expect(e.applique).toBe(true); expect(Math.abs(await app.ev('S.pitchOff')-9)).toBeLessThan(0.6); expect(Math.abs(e.res.roulis-1)).toBeLessThan(0.6);
    expect(await page.evaluate(()=>window.G.horizonPhoto.statut())).toContain('appareil levé de');
    // la ligne d'horizon de l'écran passe là où la rue synthétique a son horizon : f·tan(9°) sous le milieu de l'image
    expect(await app.ev('Math.abs(pose().pitch-9)<0.6&&photoMode.w===1280')).toBe(true);
    // champ corrigé (plus étroit) : la même convergence veut dire un appareil plus incliné
    await app.ev('S.camFov=64; showFov(); true'); await app.waitFor('S.pitchOff>9.6'); expect(Math.abs(await app.ev('S.pitchOff')-Math.atan(Math.tan(9*Math.PI/180)*Math.tan(71.5/2*Math.PI/180)/Math.tan(32*Math.PI/180))*180/Math.PI)).toBeLessThan(0.7);
    // horizon réglé à la main : la greffe n'y touche plus, même si le champ change encore
    await app.ev('S.pitchOff=3; S.camFov=71.5; true'); await page.evaluate(()=>window.G.horizonPhoto.suivre()); await page.waitForTimeout(700); expect(await app.ev('S.pitchOff')).toBe(3);
    // photo sans bâtiments : rien ne change
    await page.evaluate(()=>document.getElementById('photoChip').click()); await app.waitFor('!photoMode');
    await rejouerPhoto(page,app); await page.waitForTimeout(700); expect(await app.ev('S.pitchOff')).toBe(0); expect(await page.evaluate(()=>window.G.horizonPhoto.statut())).toContain('laissé tel quel');
    expect(app.errors).toEqual([]);
  }
});
