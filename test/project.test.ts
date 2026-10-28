import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/pages.yml', 'utf8');
const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as Record<string, Record<string, string>>;

// The YAML block of one job, from its name to the next top-level job.
function job(name: string): string {
  const start = workflow.indexOf('\n  ' + name + ':\n');
  assert.ok(start >= 0, 'job ' + name);
  const next = workflow.slice(start + 1).search(/\n {2}[a-z-]+:\n/);
  return next < 0 ? workflow.slice(start) : workflow.slice(start, start + 1 + next);
}

test('DATA-3: the board is built hourly 06:00–17:00 UTC on weekdays, on pushes to main, and on demand', () => {
  assert.match(workflow, /cron: '0 6-17 \* \* 1-5'/);
  assert.match(workflow, /push:\n\s+branches: \[main\]/);
  assert.match(workflow, /workflow_dispatch:/);
});

test('SEC-5: the build reads contents only, and only the fetch step sees the token', () => {
  // The top-level block holds this one line; jobs that need more ask for it themselves.
  assert.match(workflow, /^permissions:\n {2}contents: read\n\n/m);
  const steps = job('build').split('\n      - ');
  const withToken = steps.filter((step) => step.includes('GITHUB_TOKEN'));
  assert.equal(withToken.length, 1);
  assert.match(withToken[0], /node scripts\/build-site\.ts/);
});

test('SEC-6: only the deploy job may write to Pages, and a running deploy is never cancelled', () => {
  assert.match(job('deploy'), /pages: write\n\s+id-token: write/);
  assert.doesNotMatch(job('build'), /pages: write|id-token: write/);
  assert.match(workflow, /cancel-in-progress: false/);
});

test('SEC-7: packages that touch untrusted content and DOM test tooling are pinned to exact versions', () => {
  const versions = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const name of ['marked', 'dompurify', 'jsdom', '@playwright/test']) {
    assert.match(versions[name], /^\d+\.\d+\.\d+$/, name + ' ' + versions[name]);
  }
});

test('QUAL-6: colors in the stylesheets come only from the theme tokens', () => {
  const RAW_COLOR = /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i;
  for (const file of readdirSync('src/styles').filter((f) => f.endsWith('.css') && f !== 'tokens.css')) {
    const raw = readFileSync('src/styles/' + file, 'utf8').split('\n').filter((line) => RAW_COLOR.test(line));
    assert.deepEqual(raw, [], file);
  }
  const tokens = readFileSync('src/styles/tokens.css', 'utf8');
  assert.equal(tokens.match(/--surface:/g)?.length, 3, 'light, system dark, and chosen dark');
});
