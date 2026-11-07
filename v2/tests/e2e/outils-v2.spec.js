// v2/outils.html : journal, test du relais (simulé), rapport téléchargé, drapeaux, stockage vh2:, Eruda sans réseau.
const {test,expect}=require('@playwright/test');
const fs=require('fs');

/** Page ouverte sans réseau réel : seul le relais de config.js est simulé. */
async function ouvrir(page,{relais=200,query=''}={}){
  const erreurs=[]; page.on('pageerror',e=>erreurs.push(String(e)));
  await page.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>{
    const u=r.request().url();
    if(/villes-horizon-relais\.[^/]+\/check/.test(u)) return r.fulfill({status:relais,headers:{'access-control-allow-origin':'*','content-type':'application/json'},body:JSON.stringify({ok:true})});
    return r.abort();
  });
  await page.goto('/v2/outils.html'+query);
  await expect(page.locator('#version')).toContainText('2.0.0-dev');
  return erreurs;
}

test('la page démarre sans erreur, journal en direct',async({page})=>{
  const erreurs=await ouvrir(page);
  await expect(page.locator('#journal li').first()).toContainText('page ouverte');
  await page.evaluate(()=>{ throw new Error('boum test'); }).catch(()=>{});
  await page.evaluate(()=>{ setTimeout(()=>{ throw new Error('erreur de page'); },0); });
  await expect(page.locator('#journal li.erreur').first()).toContainText('erreur de page');
  expect(erreurs.filter(e=>!/boum|erreur de page/.test(e))).toEqual([]);
});

test('Tester le relais : succès et échec affichés, traces au journal',async({page})=>{
  await ouvrir(page);
  await page.click('#btnRelais'); await expect(page.locator('#resRelais')).toContainText('Relais joignable');
  await expect(page.locator('#journal')).toContainText('relais joignable');
});
test('Tester le relais : relais en panne',async({page})=>{
  await ouvrir(page,{relais:500});
  await page.click('#btnRelais'); await expect(page.locator('#resRelais')).toContainText('injoignable');
  await expect(page.locator('#journal li.erreur').first()).toContainText('relais injoignable');
});

test('Exporter un rapport : fichier JSON avec version, drapeaux et journal',async({page},info)=>{
  await ouvrir(page,{query:'?drapeaux=lune'});
  const dl=page.waitForEvent('download'); await page.click('#btnRapport');
  const d=await dl; expect(d.suggestedFilename()).toMatch(/^villes-horizon-rapport_.*\.json$/);
  const f=info.outputPath('rapport.json'); await d.saveAs(f);
  const r=JSON.parse(fs.readFileSync(f,'utf8'));
  expect(r.format).toBe('vh2-rapport-1'); expect(r.version).toContain('2.0.0-dev'); expect(r.drapeaux.lune).toBe(true); expect(r.drapeaux.profondeur).toBe(false);
  expect(r.journal.some(e=>/page ouverte/.test(e.message))).toBe(true); expect(r.navigateur.agent).toContain('Chrome');
});

test('drapeaux mémorisés sous vh2: ; la v1 et ses clés ne sont pas touchées',async({page})=>{
  await ouvrir(page);
  await page.evaluate(()=>localStorage.setItem('vh_settings_v2','{"radius":60}'));
  await page.locator('#drapeaux label',{hasText:'profondeur'}).locator('input').check();
  expect(await page.evaluate(()=>localStorage.getItem('vh2:drapeaux'))).toBe('{"v":1,"d":["profondeur"]}');
  await page.reload();
  await expect(page.locator('#drapeaux label',{hasText:'profondeur'}).locator('input')).toBeChecked();
  await expect(page.locator('#stockage')).toContainText('1 valeur(s) vh2:');
  page.on('dialog',d=>d.accept()); await page.click('#btnVider');
  await expect(page.locator('#stockage')).toContainText('0 valeur(s) vh2:');
  expect(await page.evaluate(()=>localStorage.getItem('vh_settings_v2'))).toBe('{"radius":60}'); // la v1 est intacte
});

test('?debug=1 sans réseau : Eruda ne se charge pas, la page continue de fonctionner',async({page})=>{
  const erreurs=await ouvrir(page,{query:'?debug=1'});
  await expect(page.locator('#debugEtat')).toContainText('Eruda non chargée');
  await expect(page.locator('#journal li.avert').first()).toContainText('Eruda non chargée');
  await page.click('#btnRelais'); await expect(page.locator('#resRelais')).toContainText('Relais joignable');
  expect(erreurs).toEqual([]);
});
