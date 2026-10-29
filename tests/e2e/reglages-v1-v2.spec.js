// v2 : les réglages d'affichage de la v1 (ligne de relief, rayon…) sont repris une fois, en lecture seule ; la v1 n'est pas modifiée.
const {test,expect}=require('@playwright/test');

test('la v2 reprend la ligne de relief et le rayon de la v1, une seule fois, sans écrire sous vh_',async({page})=>{
  const erreurs=[]; page.on('pageerror',e=>erreurs.push(String(e)));
  await page.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort());
  const v1={skyline:true,radius:180,headOff:55,camFov:90};
  await page.addInitScript(s=>{ if(!localStorage.getItem('vh_settings_v2')) localStorage.setItem('vh_settings_v2',s); },JSON.stringify(v1));
  await page.goto('/v2/photo.html');
  const S=await page.evaluate(()=>({skyline:window.__vh2.S.skyline,radius:window.__vh2.S.radius,headOff:window.__vh2.S.headOff,camFov:window.__vh2.S.camFov}));
  expect(S).toEqual({skyline:true,radius:180,headOff:0,camFov:67});
  await page.evaluate(()=>document.getElementById('btnDbg').click());
  await expect(page.locator('#dbgBody')).toContainText('repris de la v1');
  // le choix fait ensuite dans la v2 est gardé au rechargement
  await page.evaluate(()=>{ const s=JSON.parse(localStorage.getItem('vh2:reglages')); s.d.radius=25; localStorage.setItem('vh2:reglages',JSON.stringify(s)); });
  await page.reload();
  expect(await page.evaluate(()=>window.__vh2.S.radius)).toBe(25);
  expect(await page.evaluate(()=>localStorage.getItem('vh_settings_v2'))).toBe(JSON.stringify(v1));
  expect(erreurs).toEqual([]);
});

test('relief : le calcul (ligne d’horizon, crêtes, calage) est séparé du masquage ; éteindre le calcul éteint aussi le masquage, cocher le masquage rallume le calcul',async({page})=>{
  const erreurs=[]; page.on('pageerror',e=>erreurs.push(String(e)));
  await page.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort());
  await page.goto('/v2/photo.html');
  const lire=()=>page.evaluate(()=>({calcul:window.__vh2.S.calculRelief,masquage:window.__vh2.S.relief,ligne:window.__vh2.S.skyline}));
  expect(await lire()).toEqual({calcul:true,masquage:true,ligne:true}); // la ligne de relief est affichée par défaut
  await page.evaluate(()=>document.getElementById('rel').click());     // masquage éteint : le calcul reste
  expect(await lire()).toEqual({calcul:true,masquage:false,ligne:true});
  await page.evaluate(()=>document.getElementById('relc').click());    // calcul éteint
  expect(await lire()).toEqual({calcul:false,masquage:false,ligne:true});
  await page.evaluate(()=>document.getElementById('btnDbg').click());
  await expect(page.locator('#dbgBody')).toContainText('relief : désactivé');
  await page.evaluate(()=>{ document.getElementById('dbgClose').click(); document.getElementById('rel').click(); }); // cocher le masquage rallume le calcul
  expect(await lire()).toEqual({calcul:true,masquage:true,ligne:true});
  expect(erreurs).toEqual([]);
});
