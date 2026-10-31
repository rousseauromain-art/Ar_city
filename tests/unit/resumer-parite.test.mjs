// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { resultats, resumer, sceneDuTitre } from '../helpers/resumer-parite.mjs';

const spec = (file, title, status, message) => ({ file, title, tests: [{ status, results: [{ status: status === 'expected' ? 'passed' : status === 'skipped' ? 'skipped' : 'failed', ...(message ? { error: { message } } : {}) }] }] });
const rapport = (...specs) => ({ suites: [{ title: 'a.spec.js', specs }] });

test('extrait la scène réelle du titre', () => {
  assert.equal(sceneDuTitre('bande v2 = v1 sur la scène réelle saint-malo-rempart'), 'saint-malo-rempart');
  assert.equal(sceneDuTitre('sans scène'), null);
});

test('tout réussi : verdict OK et scènes listées', () => {
  const t = resultats(rapport(spec('a.spec.js', 'x sur la scène réelle turin-san-carlo', 'expected'), spec('a.spec.js', 'y sur la scène réelle ibiza', 'expected')));
  const r = resumer(t, { manquants: [], total: 4, branche: 'main', commit: 'abcdef1234' });
  assert.equal(r.ok, true); assert.match(r.markdown, /Parité avec la v1 : OK/); assert.match(r.markdown, /ibiza, turin-san-carlo/);
});

test('un écart : échec avec le message de l\'assertion', () => {
  const t = resultats(rapport(spec('a.spec.js', 'x', 'unexpected', 'Expected 3\nReceived 4')));
  const r = resumer(t, { manquants: [], total: 4 });
  assert.equal(r.ok, false); assert.match(r.markdown, /1 écart/); assert.match(r.markdown, /Received 4/);
});

test('un test ignoré ou un rapport manquant : échec', () => {
  assert.equal(resumer(resultats(rapport(spec('a.spec.js', 'x', 'skipped'))), { manquants: [], total: 4 }).ok, false);
  const m = resumer(resultats(rapport(spec('a.spec.js', 'x', 'expected'))), { manquants: [3], total: 4 });
  assert.equal(m.ok, false); assert.match(m.markdown, /partie\(s\) 3 sur 4/);
  assert.equal(resumer([], { manquants: [], total: 4 }).ok, false, 'aucun test : jamais OK');
});
