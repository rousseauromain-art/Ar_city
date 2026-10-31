// Garde-fou : chaque module de src/ doit être syntaxiquement valide (un export en double après une fusion avait cassé toutes les pages v2 sans qu'aucun test unitaire ne le voie).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const racine = new URL('../../src/', import.meta.url).pathname;
/** @param {string} d @returns {string[]} */
const fichiers = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? fichiers(p) : p.endsWith('.js') ? [p] : []; });

test('tous les modules de src/ sont valides', () => {
  const liste = fichiers(racine); assert.ok(liste.length > 50);
  const tmp = join(mkdtempSync(join(tmpdir(), 'syntaxe-')), 'module.mjs'); // copie en .mjs : `node --check` lit alors le fichier comme un module
  for (const f of liste) { writeFileSync(tmp, readFileSync(f)); try { execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' }); } catch (e) { assert.fail(`${f} : ${String(/** @type {any} */ (e).stderr).split('\n').slice(0, 4).join(' | ')}`); } }
});
