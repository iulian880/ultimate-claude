import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lintPlugin, parseFrontmatter } from '../scripts/lint-plugin.mjs';

const pluginDir = fileURLToPath(new URL('../plugins/uc-core', import.meta.url));
const SKILLS = ['complexity-check', 'product-discovery', 'delivery-report', 'uc-profile'];
const read = (name) => fs.readFileSync(path.join(pluginDir, 'skills', name, 'SKILL.md'), 'utf8');

test('exactly the four skills exist', () => {
  assert.deepEqual(fs.readdirSync(path.join(pluginDir, 'skills')).sort(), [...SKILLS].sort());
});

for (const name of SKILLS) {
  test(`skill ${name}: name equals directory, listing within 1536 chars, at most 120 lines`, () => {
    const text = read(name);
    const data = parseFrontmatter(text);
    assert.equal(data.name, name);
    assert.ok(data.description.length > 20);
    assert.ok(data.description.length + (data.when_to_use ?? '').length <= 1536);
    assert.equal(data['disable-model-invocation'], undefined);
    assert.ok(text.split('\n').length <= 120, `${name} is too long`);
  });
}

test('complexity-check names all eight criteria and the guiding sentence', () => {
  const text = read('complexity-check').toLowerCase();
  for (const word of ['scalability', 'maintainability', 'reliability', 'security', 'performance',
    'extensibility', 'ux', 'testability']) {
    assert.ok(text.includes(word), word);
  }
  assert.ok(text.includes('simplicity and yagni are decision tools, not prohibitions'));
});

test('product-discovery hands off to superpowers:brainstorming', () => {
  assert.ok(read('product-discovery').includes('superpowers:brainstorming'));
});

test('delivery-report has the five sections and cites the verification proof', () => {
  const text = read('delivery-report');
  for (const word of ['Done', 'Verified', 'Not verified', 'Decisions made', 'Follow-ups', '.uc/verification/']) {
    assert.ok(text.includes(word), word);
  }
});

test('uc-profile owns execution routing and distinct review obligations', () => {
  const rows = read('uc-profile').split('\n');
  assert.ok(rows.find((r) => r.startsWith('| Process')).includes('chosen per plan'));
  assert.ok(rows.find((r) => r.startsWith('| Review')).includes('Superpowers reviews'));
  assert.ok(rows.find((r) => r.startsWith('| Review')).includes('before finishing the branch'));
  assert.ok(rows.find((r) => r.startsWith('| Process')).includes('between brainstorming and writing-plans'));
});

test('delivery-report carries the Superpowers rulings and deferred minors', () => {
  const text = read('delivery-report');
  assert.ok(text.includes('Rulings I made'));
  assert.ok(text.includes('Deferred minors'));
});

test('uc-profile explains the three profiles and how to switch', () => {
  const text = read('uc-profile');
  for (const word of ['MINIMAL', 'STANDARD', 'STRICT', 'profil strict', 'UC_PROFILE', 'release-gate']) {
    assert.ok(text.includes(word), word);
  }
});

test('lintPlugin reports no problems for uc-core', () => {
  assert.deepEqual(lintPlugin(pluginDir), []);
});
