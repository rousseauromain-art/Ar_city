// La hauteur de prise de vue estimee est affichee a cote du rayon ; un toucher ouvre la correction.
const {test,expect}=require('@playwright/test');
const {openApp,offset}=require('../helpers/app');

const POS={lat:48.6497,lon:-2.0265};
const terrain={features:[{lat:POS.lat,lon:POS.lon,r:40,h:12,layer:'fine'},{...offset(POS,0.4,90),r:280,h:6}]};

test('la puce « œil » donne l\'altitude de prise de vue et se corrige au toucher',async({page})=>{
  const app=await openApp(page,{pos:POS,terrain});
  await app.waitFor('terrain&&!terrain.refining&&reliefState==="ok"');
  const chip=page.locator('#eyeChip');
  await expect(chip).toBeVisible();
  await expect(chip).toHaveText('œil 14 m'); // sol fin 12 m + 1,6 m
  await chip.click();
  await expect(page.locator('#eyePop')).toBeVisible();
  await expect(page.locator('#eyePopT')).toContainText('relief fin');
  await page.locator('#eyeQ').fill('10'); // balcon : +10 m
  await expect(chip).toHaveText('œil 24 m');
  expect(await app.ev('S.obsHeight')).toBe(10);
  await app.waitFor('terrain&&!terrainBusy&&Math.round(terrain.h0)===24'); // le relief est recalcule avec cette hauteur
  expect(app.errors).toEqual([]);
});

test('hauteur d\'oeil : « ~ » quand le sol vient du modele 30 m seulement',async({page})=>{
  const app=await openApp(page,{pos:POS,terrain:{...terrain,fineMissing:true}});
  await app.waitFor('terrain&&!terrain.refining&&reliefState==="ok"');
  await expect(page.locator('#eyeChip')).toHaveText(/^œil ~\d+ m$/);
});
