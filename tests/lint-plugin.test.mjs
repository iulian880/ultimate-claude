import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lintPlugin } from '../scripts/lint-plugin.mjs';

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function makePlugin({ agent, skillDir = 'demo', skill, hooks, scripts = [] } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uc lint '));
  write(path.join(dir, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'demo-plugin' }));
  write(path.join(dir, 'agents', 'helper.md'),
    agent ?? '---\nname: helper\ndescription: Helps with things\n---\nBody\n');
  write(path.join(dir, 'skills', skillDir, 'SKILL.md'),
    skill ?? '---\nname: demo\ndescription: "Use when demonstrating"\n---\nBody\n');
  if (hooks !== undefined) write(path.join(dir, 'hooks', 'hooks.json'), hooks);
  for (const s of scripts) write(path.join(dir, 'hooks', s), '');
  return dir;
}

const hooksJson = (file) => JSON.stringify({
  hooks: { Stop: [{ hooks: [{ type: 'command', command: `node "\${CLAUDE_PLUGIN_ROOT}/hooks/${file}"` }] }] },
});

test('valid minimal plugin has no problems', () => {
  assert.deepEqual(lintPlugin(makePlugin()), []);
});

test('valid hooks.json pointing to an existing script has no problems', () => {
  assert.deepEqual(lintPlugin(makePlugin({ hooks: hooksJson('gate.mjs'), scripts: ['gate.mjs'] })), []);
});

test('agent without name or description is reported', () => {
  const noName = lintPlugin(makePlugin({ agent: '---\ndescription: x\n---\n' }));
  assert.ok(noName.some((p) => p.includes('helper.md') && p.includes('name')), noName.join('\n'));
  const noDesc = lintPlugin(makePlugin({ agent: '---\nname: helper\n---\n' }));
  assert.ok(noDesc.some((p) => p.includes('helper.md') && p.includes('description')), noDesc.join('\n'));
});

test('skill whose name differs from its directory is reported', () => {
  const problems = lintPlugin(makePlugin({ skillDir: 'other' }));
  assert.ok(problems.some((p) => p.includes('other') && p.includes('demo')), problems.join('\n'));
});

test('skill description + when_to_use over 1536 chars is reported', () => {
  const skill = `---\nname: demo\ndescription: ${'a'.repeat(1000)}\nwhen_to_use: ${'b'.repeat(537)}\n---\n`;
  const problems = lintPlugin(makePlugin({ skill }));
  assert.ok(problems.some((p) => p.includes('1536')), problems.join('\n'));
  const ok = `---\nname: demo\ndescription: ${'a'.repeat(1000)}\nwhen_to_use: ${'b'.repeat(536)}\n---\n`;
  assert.deepEqual(lintPlugin(makePlugin({ skill: ok })), []);
});

test('hooks.json that is not valid JSON is reported', () => {
  const problems = lintPlugin(makePlugin({ hooks: '{not json' }));
  assert.ok(problems.some((p) => p.includes('hooks.json')), problems.join('\n'));
});

test('hooks.json command pointing to a missing script is reported', () => {
  const problems = lintPlugin(makePlugin({ hooks: hooksJson('missing.mjs') }));
  assert.ok(problems.some((p) => p.includes('missing.mjs')), problems.join('\n'));
});
