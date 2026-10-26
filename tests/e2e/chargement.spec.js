// a) la page se charge et demarre sans erreur JavaScript ; pages annexes (redirection, diagnostic) en place
const {test,expect}=require('@playwright/test');
const fs=require('fs'), path=require('path');
const {openApp}=require('../helpers/app');
const ROOT=path.resolve(__dirname,'..','..');

test('villes-horizon.html se charge et demarre sans erreur JavaScript',async({page})=>{
  const app=await openApp(page,{pos:{lat:48.6493,lon:-2.0257}});
  await app.waitFor('terrain&&!terrain.refining'); // relief simule calcule, deux passes comprises
  await app.frame(); await app.frame();
  expect(app.errors).toEqual([]);
  expect(await app.ev('APP_VERSION')).toMatch(/^2026-\d\d-\d\d/);
  expect(await app.ev('CONFIG_LOADED')).toBe(true); // config.js a la racine
  expect(await app.ev('relayBase()')).toMatch(/^https:\/\/villes-horizon-relais\./);
  const net=await page.evaluate(()=>window.__VH_NET);
  expect(net.length).toBeGreaterThan(0); // le reseau a bien ete sollicite... et servi par la simulation
  expect(app.blocked.filter(u=>!/fonts\.(googleapis|gstatic)\.com/.test(u))).toEqual([]);
});

test('index.html redirige vers villes-horizon.html',async({page})=>{
  await page.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort());
  await page.goto('/index.html?x=1');
  await page.waitForURL(/villes-horizon\.html\?x=1$/);
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

test('le tri Wikidata (bloc WDCLASS) est identique dans la page et dans debug-trafic',()=>{
  const block=f=>{ const s=fs.readFileSync(path.join(ROOT,f),'utf8'), a=s.indexOf('// <<WDCLASS'), b=s.indexOf('// WDCLASS>>'); return a>=0&&b>a?s.slice(a,b):null; };
  const main=block('villes-horizon.html');
  expect(main).not.toBeNull();
  expect(block('debug/debug-trafic.html')).toBe(main);
});
