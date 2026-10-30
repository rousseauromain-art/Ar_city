// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { testsIgnores } from '../helpers/verifier-sauts.mjs';

test('repère les tests ignorés, à tous les niveaux de suites', () => {
  const rapport = { suites: [{ title: 'a.spec.js', specs: [{ title: 'ok', tests: [{ status: 'expected', results: [{ status: 'passed' }] }] }, { title: 'sauté', tests: [{ status: 'skipped', results: [{ status: 'skipped' }] }] }],
    suites: [{ title: 'groupe', specs: [{ title: 'sauté aussi', tests: [{ status: 'skipped', results: [] }] }] }] }] };
  assert.deepEqual(testsIgnores(rapport), ['a.spec.js › sauté', 'a.spec.js › groupe › sauté aussi']);
  assert.deepEqual(testsIgnores({ suites: [] }), []);
});
