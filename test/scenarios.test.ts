import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mockClock } from '../dev/clock.ts';
import { REFRESH_SCENARIOS } from '../dev/scenarios/refresh.ts';
import { REPORT_SCENARIOS } from '../dev/scenarios/report.ts';
import { restComments } from '../dev/scenarios/rest.ts';

const FIXED = '2026-10-28T12:00:00Z';

test('PR_BOARD_MOCK_NOW pins the mock clock', () => {
  const now = mockClock({ PR_BOARD_MOCK_NOW: FIXED });
  assert.equal(now(), Date.parse(FIXED));
  assert.equal(now(), Date.parse(FIXED));
});

test('without PR_BOARD_MOCK_NOW the mock clock follows the real one', () => {
  const before = Date.now();
  const now = mockClock({})();
  assert.ok(now >= before && now <= Date.now());
});

test('an unreadable PR_BOARD_MOCK_NOW stops the server with the variable named', () => {
  for (const value of ['yesterday', '2026', 'Oct 28 2026']) assert.throws(() => mockClock({ PR_BOARD_MOCK_NOW: value }), /PR_BOARD_MOCK_NOW/);
});

test('every scenario answers the same at the same moment', () => {
  const at = Date.parse(FIXED);
  for (const scenario of REPORT_SCENARIOS) {
    assert.deepEqual(scenario.respond(at), scenario.respond(at), scenario.id);
  }
  const variables = { first: 50, after: null };
  for (const scenario of REFRESH_SCENARIOS) {
    assert.deepEqual(scenario.respond(variables, at), scenario.respond(variables, at), scenario.id);
  }
  const corner = JSON.parse((REPORT_SCENARIOS.find((s) => s.id === 'corner')!.respond(at) as { body: string }).body);
  const number = corner.prs[0].number;
  assert.deepEqual(restComments(number, at), restComments(number, at));
});
