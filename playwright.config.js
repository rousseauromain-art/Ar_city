// Tests de bout en bout : la page est servie en http local (tests/commun/server.js, crochet de test injecte) et
// ouverte dans Chromium avec une camera factice. Aucun acces reseau reel (voir tests/commun/app.js).
// Deux projets : v2 (gelée, v2/tests/e2e) et v3 (v3/tests, avec les tests de la v1 de référence). Un seul : --project=v3.
const {defineConfig}=require('@playwright/test');
const PORT=+(process.env.PORT||4173);
module.exports=defineConfig({
  projects:[{name:'v2',testDir:'v2/tests/e2e'},{name:'v3',testDir:'v3/tests',testMatch:'**/*.spec.js'}],
  timeout:90000,
  expect:{timeout:15000},
  fullyParallel:true,
  forbidOnly:!!process.env.CI,
  retries:0,
  reporter:process.env.CI?[['list'],['html',{open:'never'}]]:'list',
  use:{
    baseURL:`http://127.0.0.1:${PORT}`,
    viewport:{width:412,height:915}, // Pixel en portrait
    deviceScaleFactor:2,
    hasTouch:true,
    locale:'fr-FR',
    timezoneId:'Europe/Paris',
    launchOptions:{args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']},
  },
  webServer:{command:'node tests/commun/server.js',url:`http://127.0.0.1:${PORT}/index.html`,env:{PORT:String(PORT),...(process.env.SITE_DIR?{SITE_DIR:process.env.SITE_DIR}:{})},reuseExistingServer:!process.env.CI},
});
