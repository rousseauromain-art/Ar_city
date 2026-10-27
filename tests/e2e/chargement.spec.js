// a) la page se charge et demarre sans erreur JavaScript ; pages annexes (redirection, diagnostic) en place
const {test,expect}=require('@playwright/test');
const fs=require('fs'), path=require('path');
const {openApp}=require('../helpers/app');
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

test('l\'ancienne adresse /villes-horizon.html redirige vers la v1 (requête et ancre conservées)',async({page})=>{
  await page.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort());
  await page.goto('/villes-horizon.html?x=1#h');
  await page.waitForURL(/\/v1\/villes-horizon\.html\?x=1#h$/);
});

test('lanceur : modes de la v1, v2 en développement sans lien, outils de diagnostic (dont l\'export du cache)',async({page})=>{
  await page.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort());
  await page.goto('/index.html');
  const ar=page.getByRole('link',{name:/Réalité augmentée/}), ph=page.getByRole('link',{name:/Analyse d'une photo/});
  await expect(ar).toHaveAttribute('href','v1/villes-horizon.html');
  await expect(ph).toHaveAttribute('href','v1/villes-horizon.html');
  await expect(page.locator('#photoNote')).toContainText('Rejouer une photo');
  const v2=page.locator('#v2'); await expect(v2).toContainText('v2'); await expect(v2).toContainText('en développement');
  expect(await v2.locator('a').count()).toBe(0);                    // pas de lien vers la v2 pour l'instant
  for(const [nom,href] of [[/Trafic/,'debug/debug-trafic.html'],[/Profondeur/,'debug/debug-profondeur.html'],[/Lieux et monuments/,'debug/debug-lieux.html'],[/Export du cache/,'debug/debug-cache.html']])
    await expect(page.getByRole('link',{name:nom})).toHaveAttribute('href',href);
  for(const l of await page.getByRole('link').all()){ const b=await l.boundingBox(); expect(b.height,'zone de toucher >= 44 px').toBeGreaterThanOrEqual(44); }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);   // pas de defilement horizontal
});

test('lanceur : les liens de la v1 et des outils mènent à des pages qui existent',async({page,request})=>{
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
