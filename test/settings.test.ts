import { test } from 'node:test';
import assert from 'node:assert/strict';
import { areasOf } from '../src/model/areas.ts';
import { attentionReasons, DEFAULT_RULES, isBot } from '../src/model/rules.ts';
import { DEFAULT_SETTINGS, parseList, parseSettings, rulesAreDefault } from '../src/settings.ts';
import type { PullRequest } from '../src/types.ts';

test('SET-11: missing or invalid stored settings fall back to the defaults', () => {
  for (const stored of [null, 'text', 42, [], {}, { rules: 'x', theme: 'neon', density: 1, hiddenColumns: 'title' }]) {
    assert.deepEqual(parseSettings(stored), DEFAULT_SETTINGS, JSON.stringify(stored));
  }
});

test('SET-11: valid stored settings survive, and bad fields are replaced one by one', () => {
  const settings = parseSettings({
    rules: { staleDays: 3, checkTitle: false, requireIssue: 'no', extraBots: ['ci-user', 7, 'ci-user'], areaModules: { be: ['backend'], fe: 'ui' } },
    theme: 'dark',
    density: 'compact',
    hiddenColumns: ['assignee', 3],
  });
  assert.equal(settings.rules.staleDays, 3);
  assert.equal(settings.rules.checkTitle, false);
  assert.equal(settings.rules.requireIssue, true);
  assert.deepEqual(settings.rules.extraBots, ['ci-user']);
  assert.deepEqual(settings.rules.areaModules, { be: ['backend'], fe: DEFAULT_RULES.areaModules.fe });
  assert.deepEqual([settings.theme, settings.density, settings.hiddenColumns], ['dark', 'compact', ['assignee']]);
  assert.equal(rulesAreDefault(settings.rules), false);
});

test('SET-2: stale limits outside 1–365 or fractional are rejected', () => {
  for (const staleDays of [0, 366, 2.5, '5']) {
    assert.equal(parseSettings({ rules: { staleDays } }).rules.staleDays, DEFAULT_RULES.staleDays, String(staleDays));
  }
});

test('SET-5: lists split on commas and spaces and drop duplicates', () => {
  assert.deepEqual(parseList(' a, b  c,,a '), ['a', 'b', 'c']);
});

const pr = (fields: Record<string, unknown>) =>
  ({ title: 'feat: x', labels: [], issues: [], projects: [], ...fields }) as unknown as PullRequest;

test('RULE-9: turned-off rules raise no attention', () => {
  const rules = { ...DEFAULT_RULES, checkTitle: false, requireIssue: false, staleDays: 30 };
  assert.deepEqual(attentionReasons(pr({ title: 'WIP' }), 20, rules), []);
  assert.equal(attentionReasons(pr({ title: 'WIP' }), 20).length, 3);
});

test('RULE-10: extra bot logins match case-insensitively', () => {
  assert.equal(isBot({ login: 'CI-User', avatarUrl: null, bot: false }, ['ci-user']), true);
  assert.equal(isBot({ login: 'acme-release-bot', avatarUrl: null, bot: false }, []), false);
});

test('RULE-11: area lists match plain labels, module: labels, and title scopes', () => {
  const modules = { be: ['backend', 'module:portal-backend'], fe: ['ui'] };
  assert.deepEqual(areasOf(pr({ labels: [{ name: 'Backend' }] }), modules), ['be']);
  assert.deepEqual(areasOf(pr({ labels: [{ name: 'module:portal-backend' }] }), modules), ['be']);
  assert.deepEqual(areasOf(pr({ labels: [{ name: 'module:ui' }] }), modules), ['fe']);
  assert.deepEqual(areasOf(pr({ title: 'fix(ui): x' }), modules), ['fe']);
  assert.deepEqual(areasOf(pr({ labels: [{ name: 'module:agent' }] }), modules), []);
});
