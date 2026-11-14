// debug/deposer.html : dépôt de fichiers du téléphone dans un dépôt GitHub PRIVÉ, un commit par fichier, sans renvoyer ceux déjà présents.
// L'interface de GitHub est simulée (aucun accès réseau réel).
const {test,expect}=require('@playwright/test');
const DOSSIER='Dump_20261114_pontenroyan', JOUR=new Date('2026-11-14T19:00:00'); // le dossier : « Dump_ », la date, le lieu

/** GitHub simulé : un dépôt (privé ou public), un dossier avec des fichiers déjà présents ; note chaque appel. */
async function github(page,{prive=true,presents=['a.json'],dossierAbsent=false,refusEcriture=false,existeAuDepot=[]}={}){
  const etat={appels:[],depots:[],enCours:0,maxEnCours:0,fichiers:new Set(presents)};
  await page.route('https://api.github.com/**',async route=>{
    const req=route.request(), u=new URL(req.url()), m=req.method(), auth=req.headers()['authorization'];
    etat.appels.push(`${m} ${decodeURIComponent(u.pathname)}${u.search}`);
    const json=(status,body)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
    if(auth!=='Bearer github_pat_ESSAI') return json(401,{message:'Bad credentials'});
    if(m==='GET'&&u.pathname==='/repos/romain/photos') return json(200,{full_name:'romain/photos',private:prive,default_branch:'main'});
    if(m==='GET'&&u.pathname==='/repos/romain/photos/contents') return json(200,[{name:'Dump_20261113_morgat',type:'dir'},{name:DOSSIER,type:'dir'},{name:'dumps',type:'dir'},{name:'photo.jpg',type:'file'}]);
    if(m==='GET'&&u.pathname==='/repos/romain/photos/contents/'+DOSSIER) return dossierAbsent?json(404,{message:'Not Found'}):json(200,[...etat.fichiers].map(name=>({name,type:'file'})).concat([{name:'sous-dossier',type:'dir'}]));
    const f=new RegExp('^/repos/romain/photos/contents/'+DOSSIER+'/(.+)$').exec(u.pathname);
    if(m==='PUT'&&f){ const nom=decodeURIComponent(f[1]), body=JSON.parse(req.postData());
      etat.enCours++; etat.maxEnCours=Math.max(etat.maxEnCours,etat.enCours); await new Promise(r=>setTimeout(r,80)); etat.enCours--;
      if(refusEcriture) return json(403,{message:'Resource not accessible by personal access token'});
      if(etat.fichiers.has(nom)||existeAuDepot.includes(nom)) return json(422,{message:'Invalid request. "sha" wasn\'t supplied.'});
      etat.fichiers.add(nom); etat.depots.push({nom,...body}); return json(201,{content:{name:nom}}); }
    return json(404,{message:'Not Found'});
  });
  return etat;
}
const fichiers=()=>[{name:'a.json',mimeType:'application/json',buffer:Buffer.from('{"deja":1}')},{name:'photo été.jpg',mimeType:'image/jpeg',buffer:Buffer.from([0xFF,0xD8,0xFF,0xE1,1,2,3])},{name:'b.json',mimeType:'application/json',buffer:Buffer.from('{"nouveau":2}')}];
async function preparer(page,{depot='romain/photos'}={}){
  await page.clock.setFixedTime(JOUR); await page.goto('/debug/deposer.html');
  await page.fill('#jeton','github_pat_ESSAI'); await page.fill('#depot',depot); await page.fill('#dossier',DOSSIER);
  await page.locator('#depot').dispatchEvent('change');
  await page.setInputFiles('#fichiers',fichiers());
}
const statuts=page=>page.locator('#liste .fichier span:last-child').allTextContents();

test('deposer : chaque nouveau fichier est déposé par son propre commit, l’un après l’autre ; celui déjà présent n’est pas renvoyé ; le jeton est gardé, puis oublié',async({page})=>{
  const erreurs=[]; page.on('pageerror',e=>erreurs.push(String(e)));
  const gh=await github(page); await preparer(page);
  await expect(page.locator('#liste .fichier')).toHaveCount(3); await expect(page.locator('#btnDeposer')).toBeEnabled();
  await page.click('#btnDeposer');
  await expect(page.locator('#bilan')).toHaveText('2 déposé(s) · 1 déjà présent(s)');
  expect(await statuts(page)).toEqual(['déjà présent','déposé ✓','déposé ✓']);
  expect(gh.depots.map(d=>d.nom)).toEqual(['photo été.jpg','b.json']); expect(gh.maxEnCours).toBe(1); // un après l'autre
  expect(Buffer.from(gh.depots[0].content,'base64')).toEqual(Buffer.from([0xFF,0xD8,0xFF,0xE1,1,2,3])); // contenu intact (photo)
  expect(Buffer.from(gh.depots[1].content,'base64').toString()).toBe('{"nouveau":2}');
  expect(gh.depots.every(d=>d.branch==='main'&&d.message.startsWith('Dépôt depuis le téléphone : '))).toBe(true);
  expect(gh.appels.filter(a=>a.startsWith('PUT')).length).toBe(2); expect(gh.appels.some(a=>a===`PUT /repos/romain/photos/contents/${DOSSIER}/a.json`)).toBe(false);
  await expect(page.locator('#etat')).toContainText(`dépôt privé romain/photos · branche main · dossier ${DOSSIER}`);
  // le jeton est gardé sur le téléphone, la page rechargée le reprend ; « Oublier » l'efface
  expect(JSON.parse(await page.evaluate(()=>localStorage.getItem('vh_depot'))).jeton).toBe('github_pat_ESSAI');
  await page.reload(); await expect(page.locator('#jeton')).toHaveValue('github_pat_ESSAI'); await expect(page.locator('#depot')).toHaveValue('romain/photos'); await expect(page.locator('#dossier')).toHaveValue(DOSSIER); // même jour : même dossier
  await page.click('#btnOublier'); await expect(page.locator('#jeton')).toHaveValue('');
  expect(JSON.parse(await page.evaluate(()=>localStorage.getItem('vh_depot'))).jeton).toBeUndefined();
  // seconde fois : tout est déjà présent, rien n'est renvoyé
  await page.fill('#jeton','github_pat_ESSAI'); await page.setInputFiles('#fichiers',fichiers()); await page.click('#btnDeposer');
  await expect(page.locator('#bilan')).toHaveText('0 déposé(s) · 3 déjà présent(s)'); expect(gh.depots.length).toBe(2);
  expect(erreurs).toEqual([]);
});

test('deposer : un dépôt PUBLIC est refusé (aucun envoi) ; jeton refusé, dossier absent, droit d’écriture manquant, fichier apparu entre-temps',async({page})=>{
  let gh=await github(page,{prive:false}); await preparer(page);
  await page.click('#btnDeposer'); await expect(page.locator('#etat')).toContainText('dépôt PUBLIC'); expect(gh.appels.filter(a=>a.startsWith('PUT'))).toEqual([]);
  await page.unrouteAll();
  // jeton mal copié
  gh=await github(page); await preparer(page); await page.fill('#jeton','autre'); await page.click('#btnVerifier');
  await expect(page.locator('#etat')).toContainText('Jeton refusé'); await page.unrouteAll();
  // dossier pas encore créé : tout est déposé
  gh=await github(page,{dossierAbsent:true,presents:[]}); await preparer(page); await page.click('#btnDeposer');
  await expect(page.locator('#bilan')).toHaveText('3 déposé(s) · 0 déjà présent(s)'); await expect(page.locator('#etat')).toContainText('dossier créé au premier dépôt'); await page.unrouteAll();
  // fichier apparu entre la liste et l'envoi (GitHub répond 422) : compté comme déjà présent
  gh=await github(page,{presents:[],existeAuDepot:['b.json']}); await preparer(page); await page.click('#btnDeposer');
  await expect(page.locator('#bilan')).toHaveText('2 déposé(s) · 1 déjà présent(s)'); expect(await statuts(page)).toEqual(['déposé ✓','déposé ✓','déjà présent']); await page.unrouteAll();
  // jeton en lecture seule : arrêt au premier refus, la raison est dite
  gh=await github(page,{presents:[],refusEcriture:true}); await preparer(page); await page.click('#btnDeposer');
  await expect(page.locator('#etat')).toContainText('Read and write'); expect(await statuts(page)).toEqual(['refusé','non envoyé','non envoyé']);
  expect(gh.appels.filter(a=>a.startsWith('PUT')).length).toBe(1);
});

test('deposer : la page ne charge rien d’extérieur et n’accepte de parler qu’à GitHub (règle de sécurité du contenu)',async({page})=>{
  const ext=[]; page.on('request',r=>{ const u=new URL(r.url()); if(u.hostname!=='127.0.0.1'&&u.hostname!=='localhost') ext.push(r.url()); });
  await page.goto('/debug/deposer.html');
  expect(ext).toEqual([]);
  const csp=await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("connect-src https://api.github.com;"); expect(csp).toContain("default-src 'none'");
  expect(await page.locator('#fichiers').getAttribute('accept')).toBeNull(); // le gestionnaire de fichiers, qui garde la position des photos
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test('deposer : dossier prérempli « Dump_ » + date du jour, le lieu à compléter ; les dossiers « Dump_… » existants se choisissent d’un toucher ; le lendemain, nouveau dossier',async({page})=>{
  const gh=await github(page); await page.clock.setFixedTime(JOUR); await page.goto('/debug/deposer.html');
  await expect(page.locator('#dossier')).toHaveValue('Dump_20261114_');
  await page.fill('#jeton','github_pat_ESSAI'); await page.fill('#depot','romain/photos'); await page.setInputFiles('#fichiers',fichiers());
  await page.click('#btnDeposer'); await expect(page.locator('#etat')).toContainText('Complétez le nom du dossier avec le lieu, par exemple Dump_20261114_pontenroyan');
  expect(gh.appels.filter(a=>a.startsWith('PUT'))).toEqual([]);
  await page.click('#btnVerifier'); await expect(page.locator('#etat')).toContainText('ou touchez un dossier existant'); // les dossiers Dump_ du dépôt, le plus récent d'abord (pas « dumps »)
  await expect(page.locator('#dossiers button')).toHaveText([DOSSIER,'Dump_20261113_morgat']);
  await page.locator('#dossiers button',{hasText:DOSSIER}).click(); await expect(page.locator('#dossier')).toHaveValue(DOSSIER);
  await page.click('#btnDeposer'); await expect(page.locator('#bilan')).toHaveText('2 déposé(s) · 1 déjà présent(s)');
  expect(gh.depots.map(d=>d.nom)).toEqual(['photo été.jpg','b.json']);
  // le lendemain : le dossier de la veille n'est plus proposé d'office
  await page.clock.setFixedTime(new Date('2026-11-15T09:00:00')); await page.reload(); await expect(page.locator('#dossier')).toHaveValue('Dump_20261115_');
  await expect(page.locator('#dossiers button')).toHaveCount(2); // jeton gardé : dossiers proposés dès l'ouverture
});
