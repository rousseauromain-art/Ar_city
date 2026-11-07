// Greffes de la v3 dans la page (docs/REFONTE-V3.md §3, règle 4) : chaque greffe seule, puis toutes allumées (?g=tout) ; pour chacune, son effet,
// et le comportement de la v1 quand elle est éteinte. Données simulées (aucun réseau) : ces tests tournent sans le dépôt privé des photos.
const {test,expect}=require('@playwright/test');
const {ouvrir,capteurs,videoSynthetique}=require('./aide/v3');
const IDS=['soleil2','lune','permutation','echelle2','oeil','icones','rotation','lieuxWikidata','boussoleA'];
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
  await app.waitFor('terrain&&!terrain.refining&&obsGround!=null');
  const chip=page.locator('#g3Eye'); await expect(chip).toBeVisible(); await expect(chip).toContainText('œil +12 m');
  await chip.click(); await expect(page.locator('#g3EyeT')).toContainText('Sol estimé'); await expect(page.locator('#g3EyeT')).toContainText('correction +12 m');
  await page.fill('#g3EyeEt','3'); await page.locator('#g3EyeEt').dispatchEvent('change'); expect(await app.ev('S.obsHeight')).toBe(10);
  await page.click('#g3EyeRe'); expect(await app.ev('S.obsHeight')).toBe(0); expect(await app.ev("$('obsH').value")).toBe('0');
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
