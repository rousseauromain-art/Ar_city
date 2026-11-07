// Parité de l'interface, v1 contre v2 : tout ce que l'utilisateur voit ou touche dans les Réglages, les Calques et l'écran d'accueil (libellés, aides, boutons, sections),
// et les liens de la page d'accueil. Tout écart est justifié dans tests/ecarts-acceptes.json (domaine « interface »), sinon le test échoue.
const {test,expect}=require('@playwright/test');
const ECARTS=require('../../../tests/commun/ecarts-acceptes.json').filter(e=>e.domaine==='interface');

/** Textes visibles ou dépliables de l'interface, par rubrique. Les textes calculés (éléments à id mis à jour par la page) sont ignorés. */
function extraire(){
  const net=t=>(t||'').replace(/\s+/g,' ').trim();
  const sansQ=el=>{ const c=el.cloneNode(true); c.querySelectorAll('.qbtn,input,em[id],b[id],span[id]').forEach(x=>x.remove()); return net(c.textContent); };
  const L=[];
  const aj=(rub,quoi,t)=>{ if(t) L.push(`${rub} · ${quoi} · ${t}`); };
  document.querySelectorAll('#sheet summary b').forEach(b=>aj('réglages','section',net(b.textContent)));
  document.querySelectorAll('#sheet .row>label').forEach(l=>aj('réglages','libellé',sansQ(l)));
  document.querySelectorAll('#sheet .row>.hint').forEach(h=>{ if(!h.id||['seaHint','skyInfo','simInfo'].includes(h.id)) aj('réglages','aide',net(h.textContent)); });
  document.querySelectorAll('#sheet button:not(.qbtn)').forEach(b=>aj('réglages','bouton',net(b.textContent)));
  document.querySelectorAll('#layers .lyN').forEach(n=>aj('calques','libellé',sansQ(n)));
  document.querySelectorAll('#layers .lyN em:not([id])').forEach(n=>aj('calques','précision',net(n.textContent)));
  document.querySelectorAll('#layers .lyH').forEach(n=>aj('calques','aide',net(n.textContent)));
  document.querySelectorAll('#tools button .lbl').forEach(n=>aj('boutons','libellé',net(n.textContent)));
  return L;
}

async function lire(page,url){
  await page.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort());
  await page.goto(url); await page.waitForLoadState('load');
  return {textes:await page.evaluate(extraire), aides:await page.evaluate(()=>{ const rows=[...document.querySelectorAll('#sheet .row')].filter(r=>r.querySelector(':scope>.hint.help')); return {lignes:rows.length, pastilles:rows.filter(r=>r.querySelector('.qbtn')).length, visibles:[...document.querySelectorAll('#sheet .row>.hint.help')].filter(h=>getComputedStyle(h).display!=='none').length}; })};
}

test('Réglages, Calques, boutons : mêmes libellés, aides et sections que la v1 (écarts justifiés)',async({browser})=>{
  const p1=await browser.newPage(), p2=await browser.newPage();
  const v1=await lire(p1,'/v1/villes-horizon.html?nohook=1'), v2=await lire(p2,'/v2/ar.html');
  const s1=new Set(v1.textes), s2=new Set(v2.textes);
  const justifie=(cote,t)=>ECARTS.some(e=>e[cote]===t);
  const manquants=v1.textes.filter(t=>!s2.has(t)&&!justifie('v1',t));
  const ajouts=v2.textes.filter(t=>!s1.has(t)&&!justifie('v2',t));
  if(manquants.length||ajouts.length) console.log(JSON.stringify({manquants,ajouts},null,1));
  expect(manquants,'textes de la v1 absents de la v2 sans écart justifié').toEqual([]);
  expect(ajouts,'textes propres à la v2 sans écart justifié').toEqual([]);
  // chaque écart déclaré existe encore (pas d'écart périmé)
  for(const e of ECARTS.filter(e=>e.rubrique!=='accueil')){ if(e.v1) expect(s1.has(e.v1)&&!s2.has(e.v1),`écart périmé (v1) : ${e.v1}`).toBe(true); if(e.v2) expect(s2.has(e.v2)&&!s1.has(e.v2),`écart périmé (v2) : ${e.v2}`).toBe(true); }
  // même ordre des sections
  const sections=t=>t.filter(x=>x.startsWith('réglages · section')).filter(x=>!justifie('v1',x)&&!justifie('v2',x));
  expect(sections(v2.textes)).toEqual(sections(v1.textes));
  // aides : toute aide statique est repliée derrière un « ? », comme la v1
  expect(v2.aides.pastilles).toBe(v2.aides.lignes); expect(v2.aides.visibles).toBe(0);
  expect(v1.aides.pastilles).toBe(v1.aides.lignes);
  await p1.close(); await p2.close();
});

test('aides : le « ? » déplie l’aide de sa ligne et ne coche pas la case',async({page})=>{
  await page.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort());
  await page.goto('/v2/ar.html?mode=photo');
  await page.evaluate(()=>{ document.getElementById('start').style.display='none'; document.getElementById('btnSet').click(); }); await page.click('details[data-grp=rel] summary');
  const ligne=page.locator('#sheet .row').filter({has:page.locator('#rel')});
  const aide=ligne.locator(':scope>.hint.help');
  await expect(aide).toBeHidden();
  const avant=await page.locator('#rel').isChecked();
  await ligne.locator('.qbtn').click();
  await expect(aide).toBeVisible();
  expect(await page.locator('#rel').isChecked()).toBe(avant);
  // les 6 options d'essai sont rangées dans la section « Essais », repliée par défaut
  const essais=page.locator('details[data-grp=ess]');
  await expect(essais).not.toHaveAttribute('open','');
  for(const id of ['btnXr','capRel','calCont','posToits','stepLen','oeilGps']) await expect(essais.locator('#'+id)).toHaveCount(1);
  await expect(page.locator('#sum_ess')).toHaveText('aucun essai actif');
});

test('page d’accueil : à chaque entrée de la v1 sa jumelle en v2, mêmes descriptions, liens valides',async({page,request})=>{
  await page.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort());
  await page.goto('/index.html');
  const desc=sel=>page.locator(sel+' small').innerText();
  expect(await desc('#v2ar')).toBe('Caméra, position et boussole, en direct');
  expect(await desc('#v2photo')).toBe(await desc('#photo'));
  for(const href of await page.locator('a').evaluateAll(a=>a.map(x=>x.getAttribute('href')))) expect((await request.get('/'+href)).status(),href).toBe(200);
  // l'écran d'accueil de chaque mode : mêmes rubriques que la v1 (ACCÈS, DONNÉES, CALAGE pour le direct)
  const p1=await page.context().newPage(); await p1.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort()); await p1.goto('/v1/villes-horizon.html?nohook=1');
  const rub=(p)=>p.locator('#start ul:visible li span').allInnerTexts();
  await page.goto('/v2/ar.html');
  expect(await rub(page)).toEqual(await rub(p1));
});
