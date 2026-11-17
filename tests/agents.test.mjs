import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lintPlugin, parseFrontmatter } from '../scripts/lint-plugin.mjs';

const pluginDir = fileURLToPath(new URL('../plugins/uc-core', import.meta.url));
const read = (name) => fs.readFileSync(path.join(pluginDir, 'agents', `${name}.md`), 'utf8');
const EXPECTED = {
  architect: { model: 'opus', effort: 'high' },
  'code-reviewer': { model: 'opus', effort: 'high' },
  'qa-engineer': { model: 'inherit', effort: 'high' },
  'release-gate': { model: 'inherit', effort: 'medium' },
};

for (const [name, expected] of Object.entries(EXPECTED)) {
  test(`agent ${name} has complete frontmatter and a body of at most 80 lines`, () => {
    const text = read(name);
    const data = parseFrontmatter(text);
    assert.equal(data.name, name);
    assert.ok(data.description.length > 20);
    assert.ok(data.tools.length > 0);
    assert.equal(data.model, expected.model);
    assert.equal(data.effort, expected.effort);
    const body = text.split(/^---\s*$/m).slice(2).join('---').trim();
    assert.ok(body.split('\n').length <= 80, `${name} body is too long`);
  });
}

test('read-only agents have no Write or Edit tool', () => {
  assert.doesNotMatch(parseFrontmatter(read('code-reviewer')).tools, /Write|Edit/);
  assert.doesNotMatch(parseFrontmatter(read('release-gate')).tools, /Edit/);
});

test('architect compares on the eight Intelligent Complexity criteria and writes ADRs', () => {
  const text = read('architect').toLowerCase();
  for (const word of ['scalability', 'maintainability', 'reliability', 'security', 'performance',
    'extensibility', 'ux', 'testability', 'docs/adr/', 'codebase-design', 'domain-modeling']) {
    assert.ok(text.includes(word), word);
  }
});

test('release-gate documents the verification file and its schema keys', () => {
  const text = read('release-gate');
  for (const word of ['.uc/verification/', 'verdict', '"at"', 'checks', 'unverified']) {
    assert.ok(text.includes(word), word);
  }
});

test('lintPlugin reports no problems for uc-core', () => {
  assert.deepEqual(lintPlugin(pluginDir), []);
});
