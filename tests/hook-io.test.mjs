import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseInput } from '../plugins/uc-core/hooks/lib/hook-io.mjs';

test('parseInput returns null for "" and for "{not json"', () => {
  assert.equal(parseInput(''), null);
  assert.equal(parseInput('   \n'), null);
  assert.equal(parseInput('{not json'), null);
});

test('parseInput returns null for JSON that is not an object', () => {
  assert.equal(parseInput('42'), null);
  assert.equal(parseInput('null'), null);
  assert.equal(parseInput('[1]'), null);
});

test('parseInput returns the parsed object', () => {
  assert.deepEqual(parseInput('{"session_id":"abc"}'), { session_id: 'abc' });
});
