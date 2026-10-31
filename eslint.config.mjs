// Qualité du code de la v2 : src/, tests/unit/ et tests/integration/. La v1 figée, debug/ et les tests Playwright (CommonJS) sont hors périmètre.
import fs from 'node:fs';
import js from '@eslint/js';
import globals from 'globals';

// Sens des dépendances : docs/dependances.json (dossier → dossiers qu'il peut importer). Une règle par dossier de src/, générée d'après ce fichier.
const MATRICE = JSON.parse(fs.readFileSync(new URL('./docs/dependances.json', import.meta.url), 'utf8'));
const DOSSIERS = Object.keys(MATRICE).filter((k) => !k.startsWith('_'));
const reglesDependances = DOSSIERS.map((dossier) => ({
  files: [`src/${dossier}/**/*.js`],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: DOSSIERS.filter((cible) => cible !== dossier && !MATRICE[dossier].includes(cible)).map((cible) => ({
        group: [`**/${cible}/*`, `**/${cible}/**`],
        message: `${dossier}/ n'a pas le droit d'importer ${cible}/ (sens des dépendances : docs/dependances.json). Descendre ce qui est partagé dans noyau/ ou scene/.`,
      })),
    }],
  },
}));

export default [
  { ignores: ['v1/**', 'debug/**', 'relais/**', 'node_modules/**', 'tests/e2e/**', 'tests/helpers/**', 'tests/a-reprendre/**', 'tests/caracterisation/**', 'test-results/**', 'playwright-report/**', '*.config.js', '*.config.mjs'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js', 'tests/unit/**/*.mjs', 'tests/integration/**/*.mjs'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.browser, ...globals.node } },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: false }], // règle 6 : jamais de catch vide
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
  {
    // Garde-fous de taille (avertissements : le nombre ne doit jamais augmenter, voir `npm run lint` et --max-warnings) ; l'historique à découper est listé par ces avertissements.
    files: ['src/**/*.js'],
    rules: {
      'max-lines-per-function': ['warn', { max: 40, skipBlankLines: true, skipComments: true }],
      complexity: ['warn', 15],
      'max-lines': ['warn', { max: 300, skipBlankLines: true, skipComments: true }],
    },
  },
  ...reglesDependances,
];
