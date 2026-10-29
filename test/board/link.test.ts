import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  boardRepos, cleanBots, linkSettingsQuery, MAX_BOTS, missingReposMessage, moveStoredBots, parseLinkSettings,
} from '../../src/board/link.ts';
import { DEFAULT_SETTINGS } from '../../src/settings.ts';

test('FILTER-14: repos and bots come from the address, and invalid entries are dropped', () => {
  assert.deepEqual(parseLinkSettings(''), { repos: [], bots: [] });
  assert.deepEqual(parseLinkSettings('?repos=acme/widgets,../x,ACME/Widgets,,acme/gadgets,gadgets&bots=ci-bot,,release-bot,ci-bot'), {
    repos: ['acme/widgets', 'acme/gadgets'],
    bots: ['ci-bot', 'release-bot'],
  });
  const eleven = Array.from({ length: 11 }, (_, i) => 'acme/r' + i).join(',');
  assert.equal(parseLinkSettings('?repos=' + eleven).repos.length, 10);
});

test('FILTER-14: bots in the address must be GitHub logins, and their number is capped', () => {
  const bots = parseLinkSettings('?bots=' + encodeURIComponent('ci-bot renovate[bot] -lead trail- a--b <x> ' + 'x'.repeat(40))).bots;
  assert.deepEqual(bots, ['ci-bot', 'renovate[bot]', 'a--b']);
  assert.deepEqual(cleanBots(['ci-bot', 'bad login', 'ok']), ['ci-bot', 'ok']);
  const many = Array.from({ length: 60 }, (_, i) => 'bot-' + i).join(',');
  assert.equal(parseLinkSettings('?bots=' + many).bots.length, MAX_BOTS);
});

test('FILTER-14: the address keeps repos and bots readable, leaves them out when empty, and survives the round trip', () => {
  assert.equal(linkSettingsQuery({ repos: [], bots: [] }), '');
  const link = { repos: ['acme/widgets', 'acme/gadgets'], bots: ['ci-bot', 'odd login&x'] };
  assert.equal(linkSettingsQuery(link), 'repos=acme/widgets,acme/gadgets&bots=ci-bot,odd%20login%26x');
  assert.deepEqual(parseLinkSettings('?' + linkSettingsQuery(link)), { repos: link.repos, bots: ['ci-bot', 'odd'] });
  const ten = Array.from({ length: 10 }, (_, i) => 'acme-labs/repository-number-' + i);
  assert.ok(linkSettingsQuery({ repos: ten, bots: [] }).length < 400, 'ten repositories still make a usable link');
});

test('FILTER-14 DATA-22: requested repositories narrow the board, and the ones the data lacks are missing', () => {
  const data = ['acme/widgets', 'acme/gadgets'];
  assert.deepEqual(boardRepos(data, []), { shown: data, missing: [] });
  assert.deepEqual(boardRepos(data, ['ACME/Gadgets']), { shown: ['acme/gadgets'], missing: [] });
  assert.deepEqual(boardRepos(data, ['acme/gizmos', 'acme/widgets']), { shown: ['acme/widgets'], missing: ['acme/gizmos'] });
});

test('SET-17: extra bots saved in this browser move into the address once', () => {
  const stored = { ...DEFAULT_SETTINGS, rules: { ...DEFAULT_SETTINGS.rules, extraBots: ['acme-release-bot'] } };
  const moved = moveStoredBots(stored, { repos: ['acme/widgets'], bots: [] });
  assert.deepEqual(moved.link, { repos: ['acme/widgets'], bots: ['acme-release-bot'] });
  assert.deepEqual(moved.settings.rules.extraBots, []);
  assert.equal(moved.moved, true);
  const linkWins = moveStoredBots(stored, { repos: [], bots: ['ci-bot'] });
  assert.deepEqual(linkWins.link.bots, ['ci-bot'], 'a link with bots keeps its own');
  assert.deepEqual(linkWins.settings.rules.extraBots, []);
  const nothing = moveStoredBots(DEFAULT_SETTINGS, { repos: [], bots: [] });
  assert.equal(nothing.moved, false);
  assert.equal(nothing.settings, DEFAULT_SETTINGS);
});

test('DATA-22: the banner names the missing repositories and says how to load them', () => {
  assert.equal(missingReposMessage(['acme/gizmos'], true, false), 'acme/gizmos is not in the hourly snapshot. Refresh loads it.');
  assert.equal(missingReposMessage(['acme/gizmos', 'acme/tools'], false, false),
    'acme/gizmos, acme/tools are not in the hourly snapshot. Add a GitHub token in Settings, then Refresh loads them.');
  assert.equal(missingReposMessage(['acme/gizmos'], true, true), 'acme/gizmos is not in the live data. Refresh loads it.');
});
