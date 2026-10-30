// Contrôle de la CI : le rapport JSON de Playwright ne doit contenir AUCUN test ignoré (un test de parité sauté = un faux vert).
// Usage : node tests/helpers/verifier-sauts.mjs rapport.json — code de sortie 1 s'il y a au moins un test ignoré.
import fs from 'node:fs';

/** Titres complets des tests ignorés d'un rapport JSON de Playwright. @param {any} rapport @returns {string[]} */
export function testsIgnores(rapport) {
  /** @type {string[]} */
  const ignores = [];
  const parcourir = (/** @type {any} */ suite, /** @type {string[]} */ chemin) => {
    const titre = suite.title ? [...chemin, suite.title] : chemin;
    for (const sp of suite.specs || []) for (const t of sp.tests || []) if (t.status === 'skipped' || (t.results || []).some((/** @type {any} */ r) => r.status === 'skipped')) ignores.push([...titre, sp.title].join(' › '));
    for (const s of suite.suites || []) parcourir(s, titre);
  };
  for (const s of rapport.suites || []) parcourir(s, []);
  return ignores;
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file://').href) {
  const ignores = testsIgnores(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')));
  if (ignores.length) { console.error(`${ignores.length} test(s) ignoré(s) :\n- ${ignores.join('\n- ')}`); process.exit(1); }
  console.log('aucun test ignoré');
}
