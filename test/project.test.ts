import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/pages.yml', 'utf8');
const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as Record<string, Record<string, string>>;

// The YAML block of one job, from its name to the next top-level job.
function job(name: string): string {
  const start = workflow.indexOf('\n  ' + name + ':\n');
  assert.ok(start >= 0, 'job ' + name);
  const next = workflow.slice(start + 1).search(/\n {2}[a-z-]+:\n/);
  return next < 0 ? workflow.slice(start) : workflow.slice(start, start + 1 + next);
}

test('DATA-3: the page is built on pushes to main and on demand, without a schedule and without data', () => {
  assert.doesNotMatch(workflow, /schedule:|cron:/);
  assert.match(workflow, /push:\n\s+branches: \[main\]/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /build-site|PR_BOARD_REPO/);
});

test('SEC-5: the workflow reads contents only, and no step reads the token', () => {
  // The top-level block holds this one line; jobs that need more ask for it themselves.
  assert.match(workflow, /^permissions:\n {2}contents: read\n\n/m);
  assert.doesNotMatch(workflow, /GITHUB_TOKEN|secrets\./);
  // A checkout that keeps its credentials would leave the token in the git config for every later step.
  const checkouts = workflow.split('\n      - ').filter((step) => step.startsWith('uses: actions/checkout@'));
  assert.equal(checkouts.length, 3);
  for (const step of checkouts) assert.match(step, /persist-credentials: false/);
});

test('SEC-6: only the deploy job may write to Pages, and a running deploy is never cancelled', () => {
  assert.match(job('deploy'), /pages: write\n\s+id-token: write/);
  assert.doesNotMatch(job('build'), /pages: write|id-token: write/);
  assert.match(workflow, /cancel-in-progress: false/);
});

test('a failed unit or browser test blocks the deploy, and screenshots stay local', () => {
  const unit = job('test');
  assert.match(unit, /npm run typecheck/);
  assert.match(unit, /npm run test:coverage/);
  assert.match(unit, /npm run test:requirements/);
  const browser = job('e2e');
  assert.match(browser, /npm run test:e2e/);
  assert.doesNotMatch(workflow, /test:screenshots|--project=screenshots/);
  assert.match(pkg.scripts['test:e2e'], /--project=e2e$/);
  const build = job('build');
  assert.match(build, /needs: \[test, e2e\]/);
  // A condition such as always() would let the deploy run after a failed test.
  assert.doesNotMatch(build, /\n {4}if:/);
});

test('SEC-7: packages that touch untrusted content and DOM test tooling are pinned to exact versions', () => {
  const versions = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const name of ['marked', 'dompurify', 'jsdom', '@playwright/test', '@fontsource/ibm-plex-sans', '@fontsource/ibm-plex-mono']) {
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
  // The dark theme is written twice, for the system setting and for the chosen theme; the two copies must not drift.
  const declarations = (block: string) => [...block.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map((m) => m[1] + ':' + m[2].trim()).sort();
  const blocks = [...tokens.matchAll(/\{([^{}]*--surface:[^{}]*)\}/g)].map((m) => declarations(m[1]));
  assert.equal(blocks.length, 3);
  assert.deepEqual(blocks[1], blocks[2], 'the system dark and the chosen dark tokens are the same');
  // Every token that differs by theme is set in the dark theme too; fonts, label ink, and issue type colors are shared.
  const THEMED = /^--(bg|surface|fg|muted|line|accent|bad|warn|running|good|idle|example-ink|shadow|backdrop|group)/;
  const dark = new Set(blocks[1].map((d) => d.split(':')[0]));
  const missing = blocks[0].map((d) => d.split(':')[0]).filter((name) => THEMED.test(name) && !dark.has(name));
  assert.deepEqual(missing, [], 'light tokens without a dark value');
});

test('the README shows only screenshots that exist, so a renamed baseline cannot leave a broken picture', () => {
  const readme = readFileSync('README.md', 'utf8');
  const images = [...readme.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]);
  assert.ok(images.length >= 5);
  assert.deepEqual(images.filter((file) => !existsSync(file)), []);
});
