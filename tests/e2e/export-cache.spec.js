// Réglages > Exporter le cache : le fichier contient les tuiles de relief utiles ICI et les données mémorisées, et se rejoue tel quel.
const {test,expect}=require('@playwright/test');
const fs=require('fs');
const {openApp}=require('../helpers/app');
const {readDump,seedCaches}=require('../helpers/cache');

const POS={lat:48.6497,lon:-2.0265};

test('export du cache : tuiles utiles + données mémorisées, rejouables dans une autre page',async({page,browser},info)=>{
  const app=await openApp(page,{pos:POS});
  await app.waitFor('terrain&&!terrain.refining&&reliefState==="ok"');
  // le relief simule ne passe pas par la Cache API : on y met une tuile utile ici, une tuile ailleurs, et deux jeux de donnees
  const urls=await app.ev('(()=>{ const u=[...cacheReliefUrls(pos)]; return {near:u.find(x=>x.includes("mapterhorn")),far:"https://tiles.mapterhorn.com/13/1/1.webp"}; })()');
  await page.evaluate(async({near,far})=>{
    const t=await caches.open('vh-terrain-v1'), d=await caches.open('vh-data-v1'), h=type=>({headers:{'x-t':'1','content-type':type}});
    await t.put(near,new Response(new Uint8Array([1,2,3,250,251]),h('image/webp'))); await t.put(far,new Response(new Uint8Array([9]),h('image/webp')));
    await d.put('https://vh.cache/wd/12,34',new Response('{"rows":[1]}',h('application/json')));
    await d.put('https://vh.cache/live/sea/1,1',new Response('[]',h('application/json')));
    await d.put('https://vh.cache/bd/9',new Response(new Uint8Array([7]),h('application/octet-stream')));
  },urls);
  const dl=page.waitForEvent('download');
  await page.evaluate(()=>{ document.getElementById('sheet').classList.add('open'); document.getElementById('btnCacheExp').closest('details').open=true; });
  await page.click('#btnCacheExp');
  const file=info.outputPath('cache.json'); await (await dl).saveAs(file);
  const dump=readDump(file);
  expect(dump.pos.lat).toBeCloseTo(POS.lat,3);
  const keys=dump.entries.map(e=>`${e.c}:${e.k}`);
  expect(keys).toContain('t:'+urls.near);
  expect(keys).not.toContain('t:'+urls.far);          // tuile hors de la zone : exclue
  expect(keys).toContain('dc:wd/12,34');
  expect(keys.some(k=>/^dc:(live|bd)\//.test(k))).toBe(false); // memoire des mobiles et empreintes de batiments : exclues
  expect(dump.entries.find(e=>e.k===urls.near).d).toBe(Buffer.from([1,2,3,250,251]).toString('base64'));
  await expect(page.locator('#cacheExpInfo')).toContainText('1 tuile(s) de relief');

  // rejeu dans une page neuve : memes cles, memes octets
  const p2=await (await browser.newContext({baseURL:info.project.use.baseURL})).newPage();
  await p2.goto('/villes-horizon.html'); await p2.waitForFunction(()=>!!window.__vh);
  expect(await seedCaches(p2,dump)).toBe(dump.entries.length);
  const back=await p2.evaluate(async u=>({t:Array.from(new Uint8Array(await (await (await caches.open('vh-terrain-v1')).match(u)).arrayBuffer())),
    d:await (await (await caches.open('vh-data-v1')).match('https://vh.cache/wd/12,34')).json(), via:await window.__vh.ev('dcRead("wd/12,34",1e12,false)').then(r=>r&&r.d)}),urls.near);
  expect(back.t).toEqual([1,2,3,250,251]);
  expect(back.d).toEqual({rows:[1]});
  expect(back.via).toEqual({rows:[1]});                 // le vrai code de l'appli relit l'entree rejouee
  expect(app.errors).toEqual([]);
});

test('les traits bleus (silhouette lue sur la photo) ne sont plus affichés par défaut',async({page})=>{
  const app=await openApp(page,{pos:POS});
  expect(await app.ev('S.dbgSky')).toBeFalsy();
  await expect(page.locator('#dbgSky')).not.toBeChecked();
});
