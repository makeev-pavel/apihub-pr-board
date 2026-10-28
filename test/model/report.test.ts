import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReport } from '../../src/model/report.ts';

test('DATA-5: prs.json without a PR list is rejected, and missing optional fields get defaults', () => {
  assert.throws(() => parseReport({}), /no list of pull requests/);
  assert.throws(() => parseReport(null), /no list of pull requests/);
  const report = parseReport({ repo: 'a/b', generatedAt: '2026-10-28T12:00:00Z', prs: [] });
  assert.deepEqual(report.warnings, []);
  assert.equal(report.runUrl, null);
});

test('DATA-5: optional fields of prs.json keep valid values and drop invalid ones', () => {
  const report = parseReport({ repo: 7, runUrl: 'https://example.test/run/1', warnings: ['ok', 3, null], prs: [] });
  assert.equal(report.repo, '');
  assert.equal(report.runUrl, 'https://example.test/run/1');
  assert.deepEqual(report.warnings, ['ok']);
  assert.equal(report.generatedAt, new Date(0).toISOString());
});
