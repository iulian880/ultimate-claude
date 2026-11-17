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
  for (const word of ['.uc/verification/', 'verdict', '"at"', 'checks', 'unverified', '"criteria"']) {
    assert.ok(text.includes(word), word);
  }
});

test('release-gate example proof is valid JSON with per-criterion statuses', () => {
  const block = /```json\n([\s\S]*?)```/.exec(read('release-gate'));
  assert.ok(block, 'json example missing');
  const proof = JSON.parse(block[1]);
  assert.deepEqual(Object.keys(proof).sort(), ['at', 'checks', 'criteria', 'unverified', 'verdict']);
  for (const c of proof.criteria) {
    assert.ok(['VERIFIED', 'FAILED', 'NOT PERFORMED'].includes(c.status), c.status);
    for (const i of c.checks) assert.ok(proof.checks[i], `criterion points to missing check ${i}`);
  }
});

test('release-gate runs baseline checks, bans hedging words and gives a next step for gaps', () => {
  const text = read('release-gate').toLowerCase();
  for (const word of ['baseline', 'build', 'type check', 'lint', 'not performed', 'next step', 'probably']) {
    assert.ok(text.includes(word), word);
  }
});

test('code-reviewer reviews conformance and builds on the Superpowers review', () => {
  const text = read('code-reviewer');
  for (const word of ['conformance', 'docs/adr/', 'CLAUDE.md', '.claude/rules', 'Superpowers', 'does not repeat',
    'requesting-code-review', 'APPROVE', 'BLOCK', 'confidence', '80', 'Set aside']) {
    assert.ok(text.includes(word), word);
  }
  assert.match(parseFrontmatter(text).description, /conformance/);
});

test('architect uses distinct design constraints, file:line evidence, an ADR test and a blueprint', () => {
  const text = read('architect');
  for (const word of ['file:line', 'deletion test', 'hard to reverse', 'GLOSSARY.md', 'blueprint',
    'ports and adapters']) {
    assert.ok(text.toLowerCase().includes(word.toLowerCase()), word);
  }
});

test('qa-engineer names the break, checks mutations, reruns new tests and scores criticality', () => {
  const text = read('qa-engineer').toLowerCase();
  for (const word of ['name the production change', 'by hand', 'mutation check', 'three times', 'criticality',
    'never assert on the mock', 'baseline', 'end-to-end']) {
    assert.ok(text.includes(word), word);
  }
});

test('agents that read diffs or test output bypass RTK filtering', () => {
  for (const name of ['code-reviewer', 'qa-engineer', 'release-gate']) {
    assert.match(read(name), /`rtk bypass <command>`/, name);
  }
});

test('lintPlugin reports no problems for uc-core', () => {
  assert.deepEqual(lintPlugin(pluginDir), []);
});
