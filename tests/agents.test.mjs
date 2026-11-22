import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lintPlugin, parseFrontmatter } from '../scripts/lint-plugin.mjs';

const pluginDir = fileURLToPath(new URL('../plugins/uc-core', import.meta.url));
const read = (name) => fs.readFileSync(path.join(pluginDir, 'agents', `${name}.md`), 'utf8');
const EXPECTED = {
  architect: { model: 'inherit', effort: 'high' },
  'code-reviewer': { model: 'inherit', effort: 'high' },
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
  const block = /```json\r?\n([\s\S]*?)```/.exec(read('release-gate'));
  assert.ok(block, 'json example missing');
  const proof = JSON.parse(block[1]);
  assert.deepEqual(Object.keys(proof).sort(), ['checks', 'criteria', 'unverified', 'verdict']);
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

test('qa-engineer owns test strategy and leaves test-writing technique to Superpowers TDD', () => {
  const text = read('qa-engineer').toLowerCase();
  for (const word of ['superpowers:test-driven-development', 'three times', 'criticality', 'baseline', 'end-to-end']) {
    assert.ok(text.includes(word), word);
  }
  for (const copied of ['wrong constant', 'expected values by hand', 'never assert on the mock']) {
    assert.ok(!text.includes(copied), `restates Superpowers TDD: ${copied}`);
  }
});

test('qa-engineer can load the TDD skill and proves tests without breaking product code', () => {
  const text = read('qa-engineer');
  assert.match(parseFrontmatter(text).tools, /\bSkill\b/);
  assert.ok(text.includes('writing-good-tests.md'));
  assert.ok(text.includes('watch a test go red'));
});

test('code-reviewer accepts Superpowers findings re-graded to deferred minors', () => {
  assert.ok(read('code-reviewer').includes('re-graded'));
});

test('architect runs after brainstorming and does not redo the user-facing choice', () => {
  const text = read('architect');
  assert.ok(text.includes('after brainstorming'));
  assert.ok(text.includes('does not redo'));
});

test('agents that read diffs or test output bypass RTK filtering', () => {
  for (const name of ['code-reviewer', 'qa-engineer', 'release-gate']) {
    assert.match(read(name), /`rtk bypass <command>`/, name);
  }
});

test('lintPlugin reports no problems for uc-core', () => {
  assert.deepEqual(lintPlugin(pluginDir), []);
});

test('release-gate records the working-tree fingerprint with the hook script', () => {
  const text = read('release-gate');
  assert.ok(text.includes('node "${CLAUDE_PLUGIN_ROOT}/hooks/cli.mjs" verify'));
  assert.ok(text.includes('"tree"'));
});

test('architect, code-reviewer and qa-engineer keep project memory, limited to their memory folder', () => {
  for (const name of ['architect', 'code-reviewer', 'qa-engineer']) {
    const text = read(name);
    assert.equal(parseFrontmatter(text).memory, 'project', name);
    assert.ok(text.includes('## Project memory'), name);
    assert.ok(text.includes('only inside your memory folder'), name);
    assert.ok(text.includes('no secrets'), name);
  }
  assert.equal(parseFrontmatter(read('release-gate')).memory, undefined);
});
