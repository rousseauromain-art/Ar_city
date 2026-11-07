// Téléphone tenu en paysage alors que l'écran reste en portrait : le bandeau apparaît après 1,5 s, puis disparaît quand le téléphone revient en portrait.
const {test,expect}=require('@playwright/test');

test('écran en portrait, téléphone en paysage : bandeau puis disparition',async({browser})=>{
  const ctx=await browser.newContext({viewport:{width:412,height:915},deviceScaleFactor:2,hasTouch:true,baseURL:`http://127.0.0.1:${+(process.env.PORT||4173)}`,permissions:['geolocation','camera'],geolocation:{latitude:48.6459,longitude:-2.0281}});
  const page=await ctx.newPage(), erreurs=[]; page.on('pageerror',e=>erreurs.push(String(e)));
  await page.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort());
  await page.addInitScript(()=>{ Object.defineProperty(screen.orientation,'type',{get:()=>'portrait-primary'}); }); // Chromium sans écran physique répond toujours « landscape » : on simule un Android en portrait
  await page.goto('/v2/ar.html'); await page.click('#go');
  await expect.poll(()=>page.evaluate(()=>!!window.__vh2.app.donnees().pos),{timeout:15000}).toBe(true);
  const orienter=(beta,gamma)=>page.evaluate(({beta,gamma})=>{ for(let i=0;i<200;i++) window.dispatchEvent(new DeviceOrientationEvent('deviceorientationabsolute',{alpha:0,beta,gamma,absolute:true})); },{beta,gamma});
  await orienter(90,0); // debout, écran portrait : rien
  await page.waitForTimeout(2000); await expect(page.locator('#rotMsg')).toBeHidden();
  await orienter(0,90); // tenu en paysage (couché sur le côté), écran toujours en portrait
  const roulis=await page.evaluate(()=>Math.abs(window.__vh2.pose().roulisDeg)); expect(roulis).toBeGreaterThan(50);
  await expect(page.locator('#rotMsg')).toBeVisible({timeout:6000});
  await expect(page.locator('#rotMsg')).toContainText('rotation automatique');
  await orienter(90,0); await expect(page.locator('#rotMsg')).toBeHidden({timeout:4000});
  expect(erreurs).toEqual([]); await ctx.close();
});
