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

test('block is at most 35 lines without the import', () => {
  const body = lines().slice(1);
  while (body[0] === '') body.shift();
  assert.ok(body.length <= 35, `block has ${body.length} lines`);
});

test('keeps precedence, verification, delegation and language rules', () => {
  for (const phrase of ['explicit request', 'Never claim done', 'Send context-flooding work', 'Speak Romanian']) {
    assert.ok(text().includes(phrase), phrase);
  }
});

test('has the three-profile table and the MINIMAL override', () => {
  for (const phrase of ['| MINIMAL', '| STANDARD', '| STRICT', 'overrides the Superpowers']) {
    assert.ok(text().includes(phrase), phrase);
  }
});

test('MINIMAL-sized work is done directly whatever the session profile', () => {
  assert.ok(text().includes('whatever the session profile'));
});

test('says what to do in projects where uc-core is not enabled', () => {
  assert.ok(text().includes('Where uc-core is not enabled'));
  assert.ok(text().includes('requesting-code-review'));
});

test('drops the v3 ban on custom subagents and keeps agent teams off', () => {
  assert.ok(!text().includes('Do not create custom subagents'));
  assert.ok(text().includes('agent teams stay off'));
});
