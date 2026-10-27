// debug/debug-cache.html : export du cache (relief d'un lieu, données) en paquets bornés, rejouables par tests/helpers/cache.js.
// L'outil est une page à part : la v1 figée n'est pas modifiée ; il lit les mêmes caches (même origine).
const {test,expect}=require('@playwright/test');
const fs=require('fs');
const {readDump,readExports,seedCaches}=require('../helpers/cache');

const C={lat:48.2393,lon:-4.4628};
async function remplir(page,{n=6,taille=40000}={}){
  return page.evaluate(async({n,taille,C})=>{
    const t=await caches.open('vh-terrain-v1'), d=await caches.open('vh-data-v1'), h=type=>({headers:{'x-t':'1','content-type':type}});
    // tuile Mapterhorn z13 qui contient le lieu, et une tuile ailleurs
    const z=13, nn=512*2**z, s=Math.sin(C.lat*Math.PI/180), x=Math.floor((C.lon+180)/360*nn/512), y=Math.floor((0.5-Math.log((1+s)/(1-s))/(4*Math.PI))*nn/512);
    const near=`https://tiles.mapterhorn.com/${z}/${x}/${y}.webp`, far='https://tiles.mapterhorn.com/13/1/1.webp';
    await t.put(near,new Response(new Uint8Array([1,2,3,250]),h('image/webp'))); await t.put(far,new Response(new Uint8Array([9]),h('image/webp')));
    await d.put('https://vh.cache/pl/osm/48.250,-4.450/30/1/beach',new Response('{"data":[]}',h('application/json')));
    for(let i=0;i<n;i++) await d.put('https://vh.cache/wd/'+i,new Response(JSON.stringify({rows:'x'.repeat(taille)}),h('application/json')));
    await d.put('https://vh.cache/live/sea/1,1',new Response('[]',h('application/json')));
    await d.put('https://vh.cache/bd/9',new Response(new Uint8Array([7]),h('application/octet-stream')));
    return {near,far};
  },{n,taille,C});
}
const tel=async(page,sel)=>{ const fichiers=[]; page.on('download',async d=>{ fichiers.push(d); }); await page.click(sel); return fichiers; };

test('relief d\'un lieu : tuiles utiles seulement, via la liste des lieux connus',async({page},info)=>{
  await page.goto('/debug/debug-cache.html');
  const {near,far}=await remplir(page); await page.reload();
  await expect(page.locator('#lieux button')).toHaveCount(1);
  await expect(page.locator('#lieux button')).toContainText('48.250, -4.450');
  const dl=page.waitForEvent('download'); await page.locator('#lieux button').click();
  const f=info.outputPath('relief.json'); await (await dl).saveAs(f);
  const d=readDump(f);
  expect(d.entries.every(e=>e.c==='t')).toBe(true);
  expect(d.entries.map(e=>e.k)).toContain(near);          // la tuile de ce lieu (bande fine de 5 km) est exportee
  expect(d.entries.map(e=>e.k)).not.toContain(far);
});

test('coordonnées saisies : la tuile du lieu est exportée, pas celle d\'ailleurs',async({page},info)=>{
  await page.goto('/debug/debug-cache.html');
  const {near,far}=await remplir(page);
  await page.fill('#coord',`${C.lat}, ${C.lon}`);
  const dl=page.waitForEvent('download'); await page.click('#btnCoord');
  const f=info.outputPath('relief2.json'); await (await dl).saveAs(f);
  const d=readDump(f);
  expect(d.pos.lat).toBeCloseTo(C.lat,3);
  expect(d.entries.map(e=>e.k)).toContain(near);
  expect(d.entries.map(e=>e.k)).not.toContain(far);
  expect(d.entries.find(e=>e.k===near).d).toBe(Buffer.from([1,2,3,250]).toString('base64'));
});

test('sans tuile en mémoire : message clair, aucun fichier',async({page})=>{
  await page.goto('/debug/debug-cache.html');
  await page.fill('#coord','10.5, 20.5'); await page.click('#btnCoord');
  await expect(page.locator('#msg')).toContainText('Aucune tuile de relief en mémoire');
});

test('données : coupées en paquets bornés, sans mobiles ni bâtiments, fusionnables',async({page},info)=>{
  await page.goto('/debug/debug-cache.html?maxOctets=120000');
  await remplir(page,{n:6,taille:40000});
  const dls=[]; page.on('download',d=>dls.push(d));
  await page.click('#btnDon');
  await expect(page.locator('#msg')).toContainText('fichiers créés');
  await expect.poll(()=>dls.length).toBeGreaterThanOrEqual(3);
  const fichiers=[]; for(const [i,d] of dls.entries()){ const f=info.outputPath(`don${i}.json`); await d.saveAs(f); fichiers.push(f); }
  for(const f of fichiers) expect(fs.statSync(f).size).toBeLessThanOrEqual(120000);   // chaque paquet respecte la limite
  expect(dls.map(d=>d.suggestedFilename()).every(n=>/^villes-horizon-donnees_p\dsur\d\.json$/.test(n))).toBe(true);
  const all=readExports(fichiers);
  const cles=all.entries.map(e=>e.k);
  expect(cles.filter(k=>k.startsWith('wd/')).length).toBe(6);
  expect(cles.some(k=>/^(live|bd)\//.test(k))).toBe(false);
  // rejeu : une page neuve relit le tout
  const p2=await (await page.context().browser().newContext({baseURL:info.project.use.baseURL})).newPage();
  await p2.goto('/debug/debug-cache.html'); expect(await seedCaches(p2,all)).toBe(all.entries.length);
  expect(await p2.evaluate(async()=>(await (await caches.open('vh-data-v1')).keys()).length)).toBe(all.entries.length);
});

test('l\'outil se charge sans erreur et la v1 figée n\'est pas touchée',async({page})=>{
  const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
  await page.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort());
  await page.goto('/debug/debug-cache.html'); await expect(page.locator('#stat')).toContainText('en mémoire');
  expect(errs).toEqual([]);
});
