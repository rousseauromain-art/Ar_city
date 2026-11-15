// Lot 11 (plan du 15/11) : le journal de la v3 (vh3_journal) et le fichier « contexte » de debug/debug-cache.html.
const {test,expect}=require('@playwright/test');
const {openApp}=require('../../tests/commun/app');
const {readExports}=require('../../tests/commun/cache');
const fs=require('fs');

test('journal : démarrage avec greffes et réglages ; export du contexte sans donnée de calque personnel',async({page},info)=>{
  const app=await openApp(page,{pos:{lat:48.6493,lon:-2.0257},url:'/v3/villes-horizon.html',greffes:['icones','rotation'],settings:{radius:25,hamlets:true,photoVis:true,obsHeight:2}});
  await app.waitFor('terrain&&!terrain.refining'); await app.frame();
  const j=await page.evaluate(()=>window.G.journal());
  const d=j.lignes[j.lignes.length-1];
  expect(d.type).toBe('demarrage'); expect(d.greffes).toEqual(['icones','rotation']);
  expect(d.reglages.radius).toBe(25); expect(d.reglages.hamlets).toBe(true); expect(d.reglages.photoVis).toBe(true); expect(d.reglages.obsHeight).toBe(2);
  expect(d.page).toMatch(/v3 = v1/); expect(typeof d.reglages.camFov).toBe('number');
  // un calque personnel (données de l'utilisateur) et un lieu ne doivent jamais entrer dans le contexte
  await page.evaluate(()=>{ localStorage.setItem('vh-userlayers',JSON.stringify([{id:'secret',pts:[[1,2,'SITE-CONFIDENTIEL']]}])); localStorage.setItem('vh3_greffes',JSON.stringify({icones:true})); });
  await page.goto('/debug/debug-cache.html');
  const dl=page.waitForEvent('download'); await page.click('#btnCtx');
  const f=info.outputPath('contexte.json'); await (await dl).saveAs(f);
  const txt=fs.readFileSync(f,'utf8'), c=JSON.parse(txt);
  expect(c.format).toBe('vh-contexte-1'); expect(Object.keys(c).sort()).toEqual(['at','carnet','format','greffes','journal','reglages','tombes','url']);
  expect(c.greffes).toEqual({icones:true}); expect(c.reglages.radius).toBe(25); expect(c.journal.lignes.length).toBeGreaterThan(0);
  expect(txt).not.toContain('SITE-CONFIDENTIEL'); expect(c.journal.lignes[c.journal.lignes.length-1].greffes).toEqual(['icones','rotation']);
});

test('journal : un changement d’interrupteur est noté avant le rechargement ; borné à 60 lignes',async({page})=>{
  await page.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort());
  await page.goto('/v3/villes-horizon.html?nohook=1'); await page.waitForLoadState('load');
  await Promise.all([page.waitForNavigation(),page.evaluate(()=>{ const c=document.getElementById('g3_lune'); c.checked=true; c.dispatchEvent(new Event('change',{bubbles:true})); })]);
  await page.waitForLoadState('load');
  const j=await page.evaluate(()=>JSON.parse(localStorage.getItem('vh3_journal')));
  const types=j.lignes.map(l=>l.type); expect(types).toContain('interrupteur : lune allumé');
  expect(j.lignes.find(l=>l.type==='interrupteur : lune allumé').greffes).toEqual(['lune']);
  await page.evaluate(()=>{ const j=JSON.parse(localStorage.getItem('vh3_journal')); for(let i=0;i<100;i++) j.lignes.push({t:'x',type:'bourrage',greffes:[]}); localStorage.setItem('vh3_journal',JSON.stringify(j)); });
  await page.reload(); await page.waitForLoadState('load');
  expect((await page.evaluate(()=>window.G.journal())).lignes.length).toBeLessThanOrEqual(60);
});

test('banc : lireContexte rejoue les greffes et les réglages de la dernière ligne du journal ; fichier absent ou étranger : null',async({},info)=>{
  const {lireContexte}=require('../../tests/commun/scenes-reelles'), f=info.outputPath('ctx.json');
  fs.writeFileSync(f,JSON.stringify({format:'vh-contexte-1',journal:{lignes:[{t:'a',greffes:['lune'],reglages:{radius:10}},{t:'b',page:'p',greffes:['icones','toits'],reglages:{radius:25,photoVis:true,calques:{places:true},reperes:{view:true}}}]}}));
  expect(lireContexte(f)).toEqual({greffes:['icones','toits'],reglages:{radius:25,photoVis:true,layers:{places:true},poi:{view:true}},page:'p',t:'b'});
  fs.writeFileSync(f,'{"format":"autre"}'); expect(lireContexte(f)).toBeNull(); expect(lireContexte(info.outputPath('absent.json'))).toBeNull();
});
