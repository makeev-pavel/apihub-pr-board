import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupLock, groupsToText, isGroupChecked, parseGroupLines, toggleGroup } from '../../src/board/groups.ts';

const GROUPS = [
  { name: 'Core', repos: ['acme/widgets', 'acme/gadgets'] },
  { name: 'Tools', repos: ['acme/gadgets', 'acme/tools'] },
];

test('SET-19: groups are lines of a name and repositories; blank lines are skipped and the text round-trips', () => {
  const parsed = parseGroupLines('Core: acme/widgets, acme/gadgets\n\n  Tools : acme/gadgets acme/tools, ACME/tools\n');
  assert.deepEqual(parsed, { groups: GROUPS });
  assert.deepEqual(parseGroupLines(groupsToText(GROUPS)), { groups: GROUPS });
  assert.deepEqual(parseGroupLines(''), { groups: [] });
});

test('SET-19: a wrong line is named with the reason', () => {
  assert.deepEqual(parseGroupLines('Core: acme/widgets\nacme/gadgets'),
    { error: 'Line 2: start with the group name and a colon, such as "Backend: acme/widgets".' });
  assert.deepEqual(parseGroupLines('Core: acme/widgets, gadgets'), { error: 'Line 1: "gadgets" is not owner/name, such as acme/widgets.' });
  assert.deepEqual(parseGroupLines('Core: acme/widgets\ncore: acme/tools'), { error: 'Line 2: the group "core" is already defined.' });
  assert.deepEqual(parseGroupLines('Empty:'), { error: 'Line 1: the group "Empty" lists no repositories.' });
  const many = Array.from({ length: 21 }, (_, i) => 'G' + i + ': acme/r' + i).join('\n');
  assert.deepEqual(parseGroupLines(many), { error: 'Up to 20 groups; this list has 21.' });
});

test('FILTER-17: checking a group adds its repositories; unchecking keeps those another checked group needs', () => {
  assert.equal(isGroupChecked(GROUPS[0], ['ACME/Widgets', 'acme/gadgets']), true);
  assert.equal(isGroupChecked(GROUPS[0], ['acme/widgets']), false);
  let repos = toggleGroup(GROUPS[0], GROUPS, []) as string[];
  assert.deepEqual(repos, ['acme/widgets', 'acme/gadgets']);
  repos = toggleGroup(GROUPS[1], GROUPS, repos) as string[];
  assert.deepEqual(repos, ['acme/widgets', 'acme/gadgets', 'acme/tools']);
  // Core goes; gadgets stays for Tools.
  assert.deepEqual(toggleGroup(GROUPS[0], GROUPS, repos), ['acme/gadgets', 'acme/tools']);
  // A repository added by hand stays when a group is unchecked.
  assert.deepEqual(toggleGroup(GROUPS[0], GROUPS, ['acme/widgets', 'acme/gadgets', 'acme/other']), ['acme/other']);
});

test('FILTER-17: a group inside another checked group cannot be unchecked alone, and a choice over 40 repositories is refused', () => {
  const inner = { name: 'Widgets', repos: ['acme/widgets'] };
  const outer = { name: 'Everything', repos: ['acme/widgets', 'acme/gadgets'] };
  const repos = ['acme/widgets', 'acme/gadgets'];
  assert.equal(groupLock(inner, [inner, outer], repos), 'Included in Everything. Uncheck Everything to remove it.');
  assert.equal(groupLock(outer, [inner, outer], repos), null);
  assert.equal(groupLock(inner, [inner, outer], ['acme/widgets']), null, 'nothing else covers it');
  const big = { name: 'Big', repos: Array.from({ length: 30 }, (_, i) => 'acme/a' + i) };
  const more = { name: 'More', repos: Array.from({ length: 20 }, (_, i) => 'acme/b' + i) };
  assert.deepEqual(toggleGroup(more, [big, more], big.repos), { error: 'Adding More would make 50 repositories; the board reads at most 40. Uncheck a group first.' });
});

test('FILTER-17: unchecking a group also unchecks the groups inside it, so two equal groups never lock each other', () => {
  const inner = { name: 'Widgets', repos: ['acme/widgets'] };
  const outer = { name: 'Everything', repos: ['acme/widgets', 'acme/gadgets'] };
  const repos = ['acme/widgets', 'acme/gadgets'];
  assert.deepEqual(toggleGroup(outer, [inner, outer], repos), [], 'Widgets goes with Everything');
  const twin = { name: 'Same', repos: ['ACME/gadgets', 'acme/widgets'] };
  assert.equal(groupLock(outer, [outer, twin], repos), null);
  assert.equal(groupLock(twin, [outer, twin], repos), null);
  assert.deepEqual(toggleGroup(twin, [outer, twin], repos), []);
  // A repository another, wider group needs stays.
  const tools = { name: 'Tools', repos: ['acme/gadgets', 'acme/tools'] };
  assert.deepEqual(toggleGroup(outer, [inner, outer, tools], [...repos, 'acme/tools']), ['acme/gadgets', 'acme/tools']);
});

test('FILTER-17: groups that overlap without nesting never lock each other, and unchecking one always unchecks it', () => {
  const a = { name: 'A', repos: ['acme/x', 'acme/y'] };
  const b = { name: 'B', repos: ['acme/y', 'acme/z'] };
  const c = { name: 'C', repos: ['acme/x', 'acme/z'] };
  const triangle = [a, b, c];
  const all = ['acme/x', 'acme/y', 'acme/z'];
  assert.deepEqual(triangle.map((g) => groupLock(g, triangle, all)), [null, null, null]);
  // Every repository of A is in B or C, so A's own go, and the groups that shared them with it too.
  assert.deepEqual(toggleGroup(a, triangle, all), ['acme/z']);
});

test('FILTER-17: a group inside two others names only the outermost one, which is the one that can be unchecked', () => {
  const p = { name: 'P', repos: ['acme/x', 'acme/y'] };
  const q = { name: 'Q', repos: ['acme/y', 'acme/z'] };
  const w = { name: 'W', repos: ['acme/x', 'acme/y', 'acme/z'] };
  const groups = [p, q, w];
  const all = ['acme/x', 'acme/y', 'acme/z'];
  assert.equal(groupLock(p, groups, all), 'Included in W. Uncheck W to remove it.');
  assert.equal(groupLock(q, groups, all), 'Included in W. Uncheck W to remove it.');
  assert.equal(groupLock(w, groups, all), null);
  assert.deepEqual(toggleGroup(w, groups, all), []);
  const outer = { name: 'Outer', repos: [...w.repos, 'acme/v'] };
  assert.equal(groupLock(p, [p, w, outer], [...all, 'acme/v']), 'Included in Outer. Uncheck Outer to remove it.');
});
