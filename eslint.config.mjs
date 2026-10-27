// Qualité du code de la v2 : src/ et tests/unit/ seulement. La v1 figée, debug/ et les tests Playwright (CommonJS) sont hors périmètre.
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['v1/**', 'debug/**', 'relais/**', 'node_modules/**', 'tests/e2e/**', 'tests/helpers/**', 'tests/a-reprendre/**', 'tests/caracterisation/**', 'test-results/**', 'playwright-report/**', '*.config.js', '*.config.mjs'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js', 'tests/unit/**/*.mjs'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.browser, ...globals.node } },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: false }], // règle 6 : jamais de catch vide
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
];
