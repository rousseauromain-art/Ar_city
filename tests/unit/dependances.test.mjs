// @ts-nocheck
// Sens des dépendances : aucun dossier de src/ n'importe un dossier que docs/dependances.json ne lui permet pas (ex. : plus aucun calque → calque, calage → calques, noyau → rien).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const racine = path.resolve(import.meta.dirname, '../../src');
const matrice = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../docs/dependances.json'), 'utf8'));
const fichiers = (/** @type {string} */ d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? fichiers(path.join(d, e.name)) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []));

/** Arêtes interdites : [fichier, dossier importé]. */
export function aretesInterdites() {
  const interdites = [];
  for (const f of fichiers(racine)) {
    const dossier = path.relative(racine, f).split(path.sep)[0];
    if (!(dossier in matrice) && path.relative(racine, f).includes(path.sep)) { interdites.push([path.relative(racine, f), '(dossier absent de docs/dependances.json)']); continue; }
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/^import[^;]*?from\s+['"](\.[^'"]+)['"]/gm)) {
      const cible = path.relative(racine, path.resolve(path.dirname(f), m[1])).split(path.sep)[0];
      if (cible && cible !== dossier && cible !== '..' && !cible.endsWith('.js') && !(matrice[dossier] || []).includes(cible)) interdites.push([path.relative(racine, f), cible]);
    }
  }
  return interdites;
}

test('aucune dépendance entre dossiers en dehors de la matrice (docs/dependances.json)', () => {
  const interdites = aretesInterdites();
  assert.deepEqual(interdites, [], `imports interdits :\n${interdites.map(([f, c]) => `  ${f} → ${c}`).join('\n')}`);
});

test('plus aucun import calque → calque, ni calage → calques', () => {
  assert.ok(!matrice.calques.includes('calques') && !matrice.calage.includes('calques'));
  assert.deepEqual(matrice.noyau, []);
});

test('un calque n\'importe jamais un autre calque (aucun import relatif « ./ » dans src/calques)', () => {
  for (const f of fichiers(path.join(racine, 'calques'))) assert.ok(!/^import[^;]*?from\s+['"]\.\//m.test(fs.readFileSync(f, 'utf8')), `${path.basename(f)} importe un fichier voisin`);
});
