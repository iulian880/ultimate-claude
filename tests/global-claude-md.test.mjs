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

test('execution is chosen by uc-core rules and the user choice wins', () => {
  for (const phrase of ['## Execution (uc-core decides, Superpowers runs it)', "The user's explicit choice wins",
    '4+ mostly independent tasks', 'ties go to inline', 'never use a pricier model']) {
    assert.ok(text().includes(phrase), phrase);
  }
  assert.ok(!text().includes('only when the user asks'));
});

test('the executor pick is shown at plan review and work starts after the user confirms', () => {
  assert.ok(text().includes('start after the user confirms'));
  assert.ok(!text().includes('and start:'));
});

test('conformance review and architect have a fixed place in the flow', () => {
  const standard = lines().find((l) => l.startsWith('| STANDARD'));
  const strict = lines().find((l) => l.startsWith('| STRICT'));
  assert.ok(standard.includes('before finishing the branch'), standard);
  assert.ok(strict.includes('between brainstorming and writing-plans'), strict);
});

test('reviews are split between Superpowers and uc-core conformance', () => {
  const standard = lines().find((l) => l.startsWith('| STANDARD'));
  assert.ok(standard.includes('Superpowers reviews'), standard);
  assert.ok(standard.includes('`code-reviewer` (conformance)'), standard);
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
