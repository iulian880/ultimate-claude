import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const file = fileURLToPath(new URL('../installer/proposals/global-claude-md.md', import.meta.url));
const text = () => fs.readFileSync(file, 'utf8');
const lines = () => text().replace(/\n+$/, '').split('\n');

test('first line is the @RTK.md import', () => {
  assert.equal(lines()[0], '@RTK.md');
});

test('block is at most 40 lines without the import', () => {
  const body = lines().slice(1);
  while (body[0] === '') body.shift();
  assert.ok(body.length <= 40, `block has ${body.length} lines`);
});

test('the global proposal delegates project routing and preserves personal preferences', () => {
  for (const phrase of ['explicit request', 'Never claim done', 'Speak Romanian', 'uc-core:uc-profile', 'explicit profile wins']) {
    assert.ok(text().includes(phrase), phrase);
  }
  assert.doesNotMatch(text(), /4\+ mostly independent tasks|whatever the session profile/);
});
