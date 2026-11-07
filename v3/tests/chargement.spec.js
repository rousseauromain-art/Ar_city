// a) la page se charge et demarre sans erreur JavaScript ; page d'accueil et pages de diagnostic en place
const {test,expect}=require('@playwright/test');
const fs=require('fs'), path=require('path');
const {openApp}=require('../../tests/commun/app');
const ROOT=path.resolve(__dirname,'..','..');

test('v1/villes-horizon.html se charge et demarre sans erreur JavaScript',async({page})=>{
  const app=await openApp(page,{pos:{lat:48.6493,lon:-2.0257}});
  await app.waitFor('terrain&&!terrain.refining'); // relief simule calcule, deux passes comprises
  await app.frame(); await app.frame();
  expect(app.errors).toEqual([]);
  expect(await app.ev('APP_VERSION')).toMatch(/^2026-10-25 \(j\)/); // la v1 est figee
  expect(await app.ev('CONFIG_LOADED')).toBe(true); // ../config.js depuis v1/
  expect(await app.ev('relayBase()')).toMatch(/^https:\/\/villes-horizon-relais\./);
  const net=await page.evaluate(()=>window.__VH_NET);
  expect(net.length).toBeGreaterThan(0); // le reseau a bien ete sollicite... et servi par la simulation
  expect(app.blocked.filter(u=>!/fonts\.(googleapis|gstatic)\.com/.test(u))).toEqual([]);
});

test('page d’accueil : la v3 en premier, les outils de diagnostic, la v1 « référence », la v2 « gelée » tout en bas',async({page})=>{
  await page.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort());
  await page.goto('/index.html');
  await expect(page.locator('#v3ar')).toHaveAttribute('href','v3/villes-horizon.html'); await expect(page.locator('#v3photo')).toHaveAttribute('href','v3/villes-horizon.html');
  await expect(page.locator('#ar')).toHaveAttribute('href','v1/villes-horizon.html'); await expect(page.locator('#photo')).toHaveAttribute('href','v1/villes-horizon.html');
  await expect(page.locator('#v2ar')).toHaveAttribute('href','v2/ar.html'); await expect(page.locator('#v2photo')).toHaveAttribute('href','v2/ar.html?mode=photo');
  await expect(page.locator('#photoNote')).toContainText('Rejouer une photo'); await expect(page.locator('#v3Note')).toContainText('Greffes v2');
  await expect(page.getByRole('heading',{name:'Version 3 — active'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Version 1 — référence'})).toBeVisible(); await expect(page.getByRole('heading',{name:'Version 2 — gelée'})).toBeVisible();
  // ordre vertical : v3, outils de diagnostic, v1, v2
  const y=async(sel)=>(await page.locator(sel).boundingBox()).y, yOutils=(await page.getByRole('link',{name:/Trafic/}).boundingBox()).y;
  expect(await y('#v3ar')).toBeLessThan(await y('#v3photo')); expect(await y('#v3photo')).toBeLessThan(yOutils); expect(yOutils).toBeLessThan(await y('#ar')); expect(await y('#photo')).toBeLessThan(await y('#v2ar'));
  for(const [nom,href] of [[/Trafic/,'debug/debug-trafic.html'],[/Profondeur/,'debug/debug-profondeur.html'],[/Lieux et monuments/,'debug/debug-lieux.html'],[/Export du cache/,'debug/debug-cache.html'],[/Outils v2/,'v2/outils.html']])
    await expect(page.getByRole('link',{name:nom})).toHaveAttribute('href',href);
  for(const l of await page.getByRole('link').all()){ const b=await l.boundingBox(); expect(b.height,'zone de toucher >= 44 px').toBeGreaterThanOrEqual(44); }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);   // pas de defilement horizontal
});

test('l’ancienne adresse /villes-horizon.html à la racine n’existe plus (la page d’accueil est la seule entrée)',async({request})=>{
  expect((await request.get('/villes-horizon.html')).status()).toBe(404);
});

test('v3/villes-horizon.html se charge et démarre sans erreur JavaScript, greffes éteintes ; script valide sans le crochet',async({page,browser})=>{
  const app=await openApp(page,{pos:{lat:48.6493,lon:-2.0257},url:'/v3/villes-horizon.html',greffes:[]});
  await app.waitFor('terrain&&!terrain.refining'); await app.frame(); await app.frame();
  expect(app.errors).toEqual([]); expect(app.greffes).toEqual([]);
  expect(await app.ev('APP_VERSION')).toMatch(/^2026-10-25 \(j\)/); // la v1 (j), telle quelle
  expect(await app.ev("[PKEY,!!localStorage.getItem('vh3_settings')]")).toEqual(['vh3_settings',true]);
  const p=await browser.newPage(), errors=[]; p.on('pageerror',e=>errors.push(String(e)));
  await p.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort()); await p.goto('/v3/villes-horizon.html?nohook=1'); await p.waitForLoadState('load');
  expect(errors).toEqual([]); expect(await p.evaluate(()=>!!document.getElementById('g3Panel')&&typeof window.G.actif)).toBe('function'); await p.close();
});

test('v3 : réglages propres, recopiés UNE fois depuis ceux de la v1 ; la v3 ne réécrit jamais ceux de la v1',async({page})=>{
  await page.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort());
  await page.goto('/index.html');
  await page.evaluate(()=>{ localStorage.clear(); localStorage.setItem('vh_settings_v2',JSON.stringify({radius:85,camFov:61})); });
  await page.goto('/v3/villes-horizon.html?nohook=1'); await page.waitForLoadState('load');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('vh3_settings')).radius)).toBe(85);
  await page.evaluate(()=>{ const r=document.getElementById('rad'); r.value='120'; r.dispatchEvent(new Event('input')); r.dispatchEvent(new Event('change')); });
  await page.waitForTimeout(600);
  const k=await page.evaluate(()=>({v1:JSON.parse(localStorage.getItem('vh_settings_v2')),v3:JSON.parse(localStorage.getItem('vh3_settings'))}));
  expect(k.v1).toEqual({radius:85,camFov:61}); expect(k.v3.radius).toBe(120);
  await page.evaluate(()=>localStorage.setItem('vh_settings_v2',JSON.stringify({radius:30}))); await page.reload(); await page.waitForLoadState('load');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('vh3_settings')).radius)).toBe(120); // pas de seconde recopie
});

test('v3 : interrupteurs par l’adresse (?g=) et par le panneau (mémorisés à part, clé vh3_greffes)',async({page})=>{
  await page.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort());
  await page.goto('/v3/villes-horizon.html?nohook=1&g=icones,rotation'); await page.waitForLoadState('load');
  expect(await page.evaluate(()=>window.G.pret())).toEqual(['icones','rotation']);
  expect(await page.evaluate(()=>localStorage.getItem('vh3_greffes'))).toBeNull();
  await page.goto('/v3/villes-horizon.html?nohook=1'); await page.waitForLoadState('load');
  expect(await page.evaluate(()=>window.G.pret())).toEqual([]);
  await Promise.all([page.waitForNavigation(),page.evaluate(()=>{ const c=document.getElementById('g3_lune'); c.checked=true; c.dispatchEvent(new Event('change',{bubbles:true})); })]);
  await page.waitForLoadState('load');
  expect(await page.evaluate(()=>window.G.pret())).toEqual(['lune']);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('vh3_greffes')))).toEqual({lune:true});
});

test('v3 : pierres tombales comptées et affichées dans le Diagnostic',async({page})=>{
  const app=await openApp(page,{pos:{lat:48.6493,lon:-2.0257},url:'/v3/villes-horizon.html',greffes:[]});
  await app.waitFor('terrain&&!terrain.refining'); await app.frame();
  const t=await page.evaluate(()=>window.G.tombes());
  expect(t.sunNow&&t.sunNow.n).toBeGreaterThan(0); expect(t.reliefV1).toBeUndefined(); // sunNow : à chaque image ; reliefV1 : option jamais cochée
  await app.ev("$('btnDbg').onclick(); true");
  await expect(page.locator('#dbgBody')).toContainText('Pierres tombales'); await expect(page.locator('#dbgBody')).toContainText('allumées : aucune (v3 = v1)');
});

test('page d’accueil : tous les liens mènent à des pages qui existent',async({page,request})=>{
  await page.goto('/index.html');
  for(const href of await page.locator('a').evaluateAll(a=>a.map(x=>x.getAttribute('href'))))
    expect((await request.get('/'+href)).status(),href).toBe(200);
});

for(const name of ['debug-trafic','debug-lieux']){
  test(`debug/${name}.html se charge sans erreur JavaScript`,async({page})=>{
    const errors=[]; page.on('pageerror',e=>errors.push(String(e)));
    await page.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort());
    const resp=await page.goto(`/debug/${name}.html`); expect(resp.status()).toBe(200);
    await page.waitForLoadState('load');
    if(name==='debug-trafic') expect(await page.evaluate(()=>window.APP_CONFIG&&window.APP_CONFIG.relay)).toMatch(/^https:/); // ../config.js
    expect(errors).toEqual([]);
  });
}

test('debug/debug-profondeur.html est servie',async({request})=>{
  expect((await request.get('/debug/debug-profondeur.html')).status()).toBe(200);
});

test('le tri Wikidata (bloc WDCLASS) est identique dans v1 et dans debug-trafic',()=>{
  const block=f=>{ const s=fs.readFileSync(path.join(ROOT,f),'utf8'), a=s.indexOf('// <<WDCLASS'), b=s.indexOf('// WDCLASS>>'); return a>=0&&b>a?s.slice(a,b):null; };
  const main=block('v1/villes-horizon.html');
  expect(main).not.toBeNull();
  expect(block('debug/debug-trafic.html')).toBe(main);
});

test('le script de v1/villes-horizon.html est syntaxiquement valide (même sans le crochet de test)',async({page})=>{
  const errors=[]; page.on('pageerror',e=>errors.push(String(e)));
  await page.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort());
  await page.goto('/v1/villes-horizon.html?nohook=1');
  await page.waitForLoadState('load');
  expect(errors).toEqual([]);
  expect(await page.evaluate(()=>!!document.getElementById('go')&&typeof window.APP_CONFIG)).toBe('object'); // le script a bien tourne jusqu'au bout
});
