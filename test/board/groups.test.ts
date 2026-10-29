import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupsToText, isGroupChecked, parseGroupLines, toggleGroup } from '../../src/board/groups.ts';

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
  let repos = toggleGroup(GROUPS[0], GROUPS, []);
  assert.deepEqual(repos, ['acme/widgets', 'acme/gadgets']);
  repos = toggleGroup(GROUPS[1], GROUPS, repos);
  assert.deepEqual(repos, ['acme/widgets', 'acme/gadgets', 'acme/tools']);
  // Core goes; gadgets stays for Tools.
  assert.deepEqual(toggleGroup(GROUPS[0], GROUPS, repos), ['acme/gadgets', 'acme/tools']);
  // A repository added by hand stays when a group is unchecked.
  assert.deepEqual(toggleGroup(GROUPS[0], GROUPS, ['acme/widgets', 'acme/gadgets', 'acme/other']), ['acme/other']);
});
