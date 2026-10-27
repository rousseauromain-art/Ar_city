// Photo rejouée : le plein écran masque les bandeaux et informations techniques (vue épurée) ; les quitter les rétablit.
const {test,expect}=require('@playwright/test');
const {openApp}=require('../helpers/app');

const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==','base64');

test('photo rejouée + plein écran : bandeaux masqués, puis rétablis en quittant',async({page})=>{
  const app=await openApp(page,{settings:{simOn:true,simPos:'48.6497, -2.0265'}});
  await page.setInputFiles('#photoFile',{name:'photo.png',mimeType:'image/png',buffer:PNG});
  await app.waitFor('photoMode&&pos');
  await expect(page.locator('#photoChip')).toBeVisible();
  await page.click('#btnFs');
  await page.waitForFunction(()=>!!document.fullscreenElement);
  await expect(page.locator('#photoChip')).toBeHidden();
  await expect(page.locator('#radChip')).toBeHidden();
  await page.click('#btnFs');
  await page.waitForFunction(()=>!document.fullscreenElement);
  await expect(page.locator('#photoChip')).toBeVisible();
  expect(app.errors).toEqual([]);
});

test('plein écran en direct (hors photo) : les informations restent affichées',async({page})=>{
  const app=await openApp(page,{pos:{lat:48.6497,lon:-2.0265}});
  await page.click('#btnFs');
  await page.waitForFunction(()=>!!document.fullscreenElement);
  await expect(page.locator('#radChip')).toBeVisible();
});
