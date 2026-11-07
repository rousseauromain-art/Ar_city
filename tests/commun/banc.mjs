// Banc de chargement : v1, v2 en modules bruts (?modules=1) et v2 publiée (regroupée), sur un téléphone simulé (processeur 4× plus lent), sans cache,
// avec un bon réseau et un réseau faible. Chaque mesure est la médiane de N ouvertures. Les polices Google (hors du site) sont coupées partout, à égalité.
// Mesure : temps entre la navigation et l'appli prête (v1 : fin de l'évènement load, script en ligne exécuté ; v2 : `window.__vh2` posé par la page).
// Usage : npm run build && node tests/commun/banc.mjs [--n 5] [--json sortie.json]
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const N = +arg('--n', 5), SORTIE = arg('--json', null), PORT = 4199;

/** Réseaux du banc (DevTools : « bon » ≈ 4G, « faible » = préréglage Slow 4G de Chrome). */
export const RESEAUX = {
  bon: { latency: 40, downloadThroughput: (10 * 1024 * 1024) / 8, uploadThroughput: (5 * 1024 * 1024) / 8 },
  faible: { latency: 562.5, downloadThroughput: (1.6 * 1024 * 1024) / 8 * 0.9, uploadThroughput: (750 * 1024) / 8 * 0.9 },
};
export const CPU = 4;
const CIBLES = [
  { id: 'v1', url: '/v1/villes-horizon.html?nohook=1', pret: 'load' },
  { id: 'v2-modules', url: '/v2/ar.html?modules=1', pret: '__vh2' },
  { id: 'v2-publiee', url: '/v2/ar.html', pret: '__vh2' },
];

async function mesurer(navigateur, cible, reseau) {
  const ctx = await navigateur.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.route(/^(?!http:\/\/127\.0\.0\.1[:/])/, (r) => r.abort());
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, ...RESEAUX[reseau] });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  let octets = 0, fichiers = 0;
  cdp.on('Network.loadingFinished', (e) => { octets += e.encodedDataLength; fichiers++; });
  await page.addInitScript(() => { let v; Object.defineProperty(window, '__vh2', { configurable: true, get: () => v, set: (x) => { v = x; window.__vh2Pret = performance.now(); } }); });
  await page.goto(cible.url, { waitUntil: 'load', timeout: 120000 });
  const ms = cible.pret === 'load'
    ? await page.evaluate(() => performance.getEntriesByType('navigation')[0].loadEventEnd)
    : await page.waitForFunction(() => window.__vh2Pret, null, { timeout: 120000 }).then((h) => h.jsonValue());
  await page.waitForTimeout(300); // fin des transferts (workers)
  await ctx.close();
  return { ms, octets, fichiers };
}

const mediane = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

export async function banc({ n = N } = {}) {
  process.env.SITE_DIR = resolve(RACINE, 'dist');
  const { start } = require('./server.js');
  const srv = await start(PORT);
  const navigateur = await chromium.launch();
  const res = [];
  try {
    for (const c of CIBLES) {
      const ligne = { id: c.id };
      for (const r of Object.keys(RESEAUX)) {
        const m = []; for (let i = 0; i < n; i++) m.push(await mesurer(navigateur, { ...c, url: `http://127.0.0.1:${PORT}${c.url}` }, r));
        ligne[r] = Math.round(mediane(m.map((x) => x.ms)));
        ligne.fichiers = m[0].fichiers; ligne.ko = Math.round(m[0].octets / 1024);
      }
      res.push(ligne);
      console.log(`${c.id.padEnd(11)} ${String(ligne.fichiers).padStart(4)} fichiers ${String(ligne.ko).padStart(6)} Ko  bon ${(ligne.bon / 1000).toFixed(2)} s  faible ${(ligne.faible / 1000).toFixed(2)} s`);
    }
  } finally { await navigateur.close(); srv.close(); }
  return res;
}

if (resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const r = await banc();
  if (SORTIE) writeFileSync(SORTIE, JSON.stringify({ date: new Date().toISOString(), cpu: CPU, reseaux: RESEAUX, n: N, mesures: r }, null, 2));
}
