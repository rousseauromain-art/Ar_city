// Pages v2 : bandeau d'erreur de chargement (séparé de v3/tests/chargement.spec.js au rangement).
const {test,expect}=require('@playwright/test');

test('pages v2 : pas de bandeau d’erreur quand tout se charge ; un bandeau explicite quand le script principal est introuvable',async({page})=>{
  await page.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort());
  await page.goto('/v2/ar.html?mode=photo'); await page.waitForTimeout(6500);
  await expect(page.locator('#chargementKo')).toHaveCount(0);
  await page.route('**/src/outils/version.js',r=>r.fulfill({status:200,contentType:'text/javascript',body:'export const VERSION_V2 = 1; export const VERSION_V2 = 2;'}));
  await page.goto('/v2/ar.html'); await page.waitForTimeout(6500);
  await expect(page.locator('#chargementKo')).toContainText('ne s’est pas chargée correctement');
});
