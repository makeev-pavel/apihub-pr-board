import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_RULES } from '../src/model.ts';
import { parseRepository, repositoryName } from '../src/repository.ts';

test('DATA-1: PR_BOARD_REPO names the repository as owner/name', () => {
  assert.deepEqual(parseRepository('acme/widgets'), { owner: 'acme', name: 'widgets' });
  assert.deepEqual(parseRepository('acme-labs/widgets.js'), { owner: 'acme-labs', name: 'widgets.js' });
  assert.equal(repositoryName(parseRepository('acme/widgets')), 'acme/widgets');
});

test('DATA-1: a missing or malformed PR_BOARD_REPO stops with the variable named', () => {
  // CI passes an unset repository variable as an empty string.
  for (const value of [undefined, '']) assert.throws(() => parseRepository(value), /PR_BOARD_REPO is not set/);
  for (const value of ['acme', 'acme/..', 'acme/.', 'acme/', '/widgets', 'acme/widgets/extra', 'acme/ widgets']) {
    assert.throws(() => parseRepository(value), /PR_BOARD_REPO must be "owner\/name"/, value);
  }
});

test('RULE-10: no service account counts as a bot by default', () => {
  assert.deepEqual(DEFAULT_RULES.extraBots, []);
});
