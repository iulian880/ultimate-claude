import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter } from '../scripts/lint-plugin.mjs';

const plugin = fileURLToPath(new URL('../plugins/uc-excel', import.meta.url));
const read = (...p) => fs.readFileSync(path.join(plugin, ...p), 'utf8');
const body = (text) => text.split(/^---\s*$/m).slice(2).join('---').trim();

test('excel-vba-reviewer: frontmatter, session model, read-only tools', () => {
  const data = parseFrontmatter(read('agents', 'excel-vba-reviewer.md'));
  assert.equal(data.name, 'excel-vba-reviewer');
  assert.ok(data.description.length > 40);
  assert.equal(data.model, 'inherit');
  assert.equal(data.tools, 'Read, Grep, Glob, Bash');
  assert.equal(data.effort, 'medium', 'runs on every VBA change, so it stays cheap');
});

test('excel-vba-reviewer: VBA checks only, uc-core report shape, no 32/64-bit checks', () => {
  const text = read('agents', 'excel-vba-reviewer.md');
  assert.ok(body(text).split('\n').length <= 80);
  for (const w of ['ScreenUpdating', 'On Error', 'ActiveSheet', 'confidence', '80', 'APPROVE', 'BLOCK',
    '`rtk bypass <command>`', 'conformance']) {
    assert.ok(text.includes(w), w);
  }
  assert.doesNotMatch(text, /PtrSafe|LongPtr|Win64|VBA7/);
  assert.ok(text.includes('no findings about 32-bit or 64-bit compatibility'));
});

test('vba-workflow: name, listing size, length', () => {
  const text = read('skills', 'vba-workflow', 'SKILL.md');
  const data = parseFrontmatter(text);
  assert.equal(data.name, 'vba-workflow');
  assert.ok(data.description.length + (data.when_to_use ?? '').length <= 1536);
  assert.ok(text.split('\n').length <= 120);
});

test('vba-workflow: the seven steps in order, commands from CLAUDE.md, Windows is the user check', () => {
  const text = read('skills', 'vba-workflow', 'SKILL.md');
  let at = 0;
  for (const step of ['backups/', 'never directly', 'Lint', 'Build', 'Compile', 'Tests', 'user documentation']) {
    const i = text.indexOf(step, at);
    assert.ok(i > at - 1 && i !== -1, `step out of order or missing: ${step}`);
    at = i;
  }
  for (const w of ['CLAUDE.md', 'excel-vba-reviewer', 'YYYYMMDD-HHMMSS', 'MINIMAL', 'not an acceptance criterion']) {
    assert.ok(text.includes(w), w);
  }
});

test('excel-vba template: settings enable uc-core and uc-excel with STANDARD', () => {
  const s = JSON.parse(read('templates', 'excel-vba', '.claude', 'settings.json'));
  assert.equal(s.enabledPlugins['uc-core@ultimate-claude'], true);
  assert.equal(s.enabledPlugins['uc-excel@ultimate-claude'], true);
  assert.equal(s.env.UC_PROFILE, 'standard');
  assert.equal(s.env.ENABLE_CODE_SECURITY_REVIEW, '0', 'security-guidance reviews off on every machine, not only here');
  assert.equal(typeof s.env.UC_EXCEL_READ_ONLY, 'string');
});

test('excel-vba template: .gitignore and CLAUDE.md sections', () => {
  assert.match(read('templates', 'excel-vba', '.gitignore'), /^backups\/$/m);
  assert.match(read('templates', 'excel-vba', '.gitignore'), /^\.uc\/$/m, 'verification proofs are never committed');
  const md = read('templates', 'excel-vba', 'CLAUDE.md');
  for (const h of ['## What this is', '## Commands', '## User documentation', '## Rules']) {
    assert.ok(md.includes(h), h);
  }
  for (const c of ['Lint', 'Build', 'Compile check', 'Tests', 'Full check']) assert.ok(md.includes(c), c);
});

test('excel-vba-reviewer keeps project memory, limited to its memory folder', () => {
  const text = read('agents', 'excel-vba-reviewer.md');
  assert.equal(parseFrontmatter(text).memory, 'project');
  assert.ok(text.includes('## Project memory'));
  assert.ok(text.includes('only inside your memory folder'));
  assert.ok(text.includes('no secrets'));
});
