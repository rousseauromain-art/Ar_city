// Construit le site publié dans dist/ (GitHub Pages, workflow pages.yml) :
// - la page v2 (v2/ar.html) contient son code regroupé et minifié (carte de sources b/ui/page-ar.js.map) au lieu de ~165 modules : une seule réponse, comme la v1 ;
// - les 3 workers sont regroupés dans b/workers/*.js : `new URL('../workers/x.js', import.meta.url)` part de l'ancienne adresse du code (b/ui/page-ar.js) et tombe dessus ;
// - ?modules=1 recharge les modules bruts (src/, publiés tels quels) pour le débogage ;
// - un service worker (v2/sw.js), versionné par l'empreinte des fichiers, garde la page et les fichiers regroupés : l'appli s'ouvre sans réseau ;
// - le reste du site (v1, debug, outils, lanceur) est copié tel quel.
// Usage : node construction/construire.mjs [dossier de sortie, défaut dist]
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SORTIE = resolve(RACINE, process.argv[2] || 'dist');
/** Copié tel quel. */
const A_COPIER = ['index.html', 'villes-horizon.html', 'config.js', 'v1', 'v2', 'debug', 'src'];
/** Points d'entrée regroupés (chemins relatifs à src/). */
const ENTREES = ['workers/masque-relief.js', 'workers/silhouette-batiments.js', 'workers/position-toits.js'];
/** Pages v2 qui chargent le fichier regroupé. */
const PAGES = ['v2/ar.html'];

/** Garde du fichier regroupé : ?modules=1 charge à la place les modules bruts (débogage). Le fichier regroupé (ESM sans import ni export, dans un bloc : pas de fonction englobante, que V8 compilerait d'un coup) ; `import.meta.url` y devient `__vhBase` (son ancienne adresse, b/ui/page-ar.js), d'où les workers sont trouvés. */
const GARDE_DEBUT = 'if(/[?&]modules=1(&|$)/.test(location.search)){import(\'../src/ui/page-ar.js\')}else{const __vhBase=new URL(\'../b/ui/page-ar.js\',location.href).href;';
const GARDE_FIN = '}';

/**
 * Page v2 publiée : comme la v1, une seule réponse contient le code et le style (aucun aller-retour de plus sur un réseau lent).
 * La feuille de style et le module sont remplacés par leur version regroupée, écrite dans la page ; ?modules=1 charge les modules bruts.
 * @param {string} html @param {{js: string, css: string}} regroupe
 */
export function reecrirePage(html, { js, css }) {
  const style = '<link rel="stylesheet" href="../src/ui/style.css">';
  const module = '<script type="module" src="../src/ui/page-ar.js"></script>';
  if (!html.includes(style) || !html.includes(module)) throw new Error('page v2 : feuille de style ou module introuvable');
  if (/<\/script/i.test(js) || /<\/style/i.test(css)) throw new Error('fichier regroupé : balise fermante dans le code');
  const enregistrer = '<script>if(!/[?&]modules=1(&|$)/.test(location.search)&&\'serviceWorker\' in navigator)addEventListener(\'load\',function(){navigator.serviceWorker.register(\'sw.js\').catch(function(){})});</script>';
  return html.replace(style, () => `<style>${css}</style>`).replace(module, () => `<script type="module">${js}</script>\n${enregistrer}`);
}

/** Service worker : précharge `fichiers` (relatifs à v2/) dans le cache `site-v2-<version>`, les sert d'abord depuis le cache, efface les anciennes versions.
 * Les navigations vers ar.html?… et photo.html?… se servent sans tenir compte de la requête. Tout le reste passe au réseau (les données ont leur propre cache, `vh2-…`).
 * @param {string} version @param {string[]} fichiers */
export function serviceWorker(version, fichiers) {
  return `// Service worker de la v2 (construit par construction/construire.mjs). Version ${version}.
const CACHE='site-v2-${version}', FICHIERS=${JSON.stringify(fichiers)};
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FICHIERS.map(f=>new Request(f,{cache:'reload'})))).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('site-v2-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
const GARDES=new Set(FICHIERS.map(f=>new URL(f,self.registration.scope).href));
self.addEventListener('fetch',e=>{
  const r=e.request; if(r.method!=='GET') return;
  const u=new URL(r.url); if(u.origin!==location.origin) return;
  if(/[?&]modules=1(&|$)/.test(u.search)) return;
  const nu=u.origin+u.pathname, nav=r.mode==='navigate';
  if(!GARDES.has(nu)&&!(nav&&GARDES.has(nu))) return;
  e.respondWith(caches.open(CACHE).then(c=>c.match(nav?nu:r,{ignoreSearch:nav}).then(m=>m||fetch(r).then(rep=>{ if(rep.ok&&!nav) c.put(r,rep.clone()); return rep; }))));
});
`;
}

/** @param {string} d @returns {string[]} */
const lister = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? lister(join(d, e.name)) : [join(d, e.name)]));

export async function construire(sortie = SORTIE) {
  rmSync(sortie, { recursive: true, force: true }); mkdirSync(sortie, { recursive: true });
  for (const f of A_COPIER) cpSync(join(RACINE, f), join(sortie, f), { recursive: true });
  writeFileSync(join(sortie, '.nojekyll'), '');
  const commun = { bundle: true, minify: process.env.NOMS !== '1', minifyWhitespace: true, minifySyntax: true, sourcemap: true, format: /** @type {'esm'} */ ('esm'), target: ['chrome100', 'safari15'], logLevel: /** @type {'warning'} */ ('warning'), legalComments: /** @type {'none'} */ ('none') };
  const workers = ENTREES.filter((e) => e.startsWith('workers/'));
  await build({ ...commun, entryPoints: workers.map((e) => join(RACINE, 'src', e)), outbase: join(RACINE, 'src'), outdir: join(sortie, 'b') });
  const page = await build({ ...commun, write: false, entryPoints: [join(RACINE, 'src/ui/page-ar.js')], outfile: join(sortie, 'b/ui/page-ar.js'), sourcemap: 'external',
    define: { 'import.meta.url': '__vhBase' }, banner: { js: GARDE_DEBUT }, footer: { js: GARDE_FIN } });
  const style = await build({ ...commun, write: false, entryPoints: [join(RACINE, 'src/ui/style.css')], outfile: join(sortie, 'b/ui/style.css'), sourcemap: false, external: ['*.svg', '*.png', '*.woff2'] });
  mkdirSync(join(sortie, 'b/ui'), { recursive: true });
  const sortieDe = (/** @type {any} */ r, /** @type {string} */ ext) => r.outputFiles.find((/** @type {any} */ f) => f.path.endsWith(ext));
  writeFileSync(join(sortie, 'b/ui/page-ar.js.map'), sortieDe(page, '.js.map').text);
  const js = sortieDe(page, '.js').text.replace(/\/\/# sourceMappingURL=.*\s*$/, '') + '//# sourceMappingURL=../b/ui/page-ar.js.map';
  for (const p of PAGES) writeFileSync(join(sortie, p), reecrirePage(readFileSync(join(RACINE, p), 'utf8'), { js, css: sortieDe(style, '.css').text }));
  // Fichiers gardés par le service worker (relatifs à v2/) et version = empreinte de leur contenu.
  const regroupes = lister(join(sortie, 'b')).filter((f) => f.endsWith('.js')).map((f) => '../' + relative(sortie, f).split('\\').join('/'));
  const fichiers = ['ar.html', 'photo.html', '../config.js', ...regroupes.sort()];
  const h = createHash('sha256'); for (const f of fichiers) h.update(f).update(readFileSync(join(sortie, 'v2', f)));
  const version = h.digest('hex').slice(0, 12);
  writeFileSync(join(sortie, 'v2/sw.js'), serviceWorker(version, fichiers));
  const taille = fichiers.reduce((s, f) => s + readFileSync(join(sortie, 'v2', f)).length, 0);
  return { sortie, version, fichiers, taille };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = await construire();
  console.log(`Site construit dans ${relative(RACINE, r.sortie)} : ${r.fichiers.length} fichiers gardés hors ligne, ${(r.taille / 1024).toFixed(0)} Ko, version ${r.version}`);
  if (!existsSync(join(r.sortie, 'b/workers/masque-relief.js'))) process.exit(1);
}
