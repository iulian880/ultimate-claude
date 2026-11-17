import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shouldBlock } from '../plugins/uc-core/hooks/profile-gate.mjs';
import { latestPassAt } from '../plugins/uc-core/hooks/lib/verification.mjs';

const hookPath = (name) => fileURLToPath(new URL(`../plugins/uc-core/hooks/${name}`, import.meta.url));
const tempDir = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

function projectWith(files) {
  const dir = tempDir('uc project ');
  const vdir = path.join(dir, '.uc', 'verification');
  fs.mkdirSync(vdir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(vdir, name), typeof content === 'string' ? content : JSON.stringify(content));
  }
  return dir;
}

const EDIT = '2026-11-17T10:00:00.000Z';
const BEFORE = '2026-11-17T09:00:00.000Z';
const AFTER = '2026-11-17T11:00:00.000Z';
const strict = { profile: 'strict', lastEditAt: EDIT, latestPassAt: null, stopHookActive: false, gateBlockedAt: undefined };

test('standard and minimal never block', () => {
  assert.equal(shouldBlock({ ...strict, profile: 'standard' }), false);
  assert.equal(shouldBlock({ ...strict, profile: 'minimal' }), false);
});

test('strict without any edit → no block', () => {
  assert.equal(shouldBlock({ ...strict, lastEditAt: undefined }), false);
});

test('strict + edit + no verification → block', () => {
  assert.equal(shouldBlock(strict), true);
});

test('strict + PASS newer than edit → no block', () => {
  assert.equal(shouldBlock({ ...strict, latestPassAt: AFTER }), false);
  assert.equal(shouldBlock({ ...strict, latestPassAt: '2026-11-17T13:00:00+02:00' }), false);
});

test('strict + PASS older than edit → block', () => {
  assert.equal(shouldBlock({ ...strict, latestPassAt: BEFORE }), true);
});

test('stopHookActive true → no block', () => {
  assert.equal(shouldBlock({ ...strict, stopHookActive: true }), false);
});

test('already blocked once since the last edit → no block', () => {
  assert.equal(shouldBlock({ ...strict, gateBlockedAt: AFTER }), false);
  assert.equal(shouldBlock({ ...strict, gateBlockedAt: EDIT }), false);
  assert.equal(shouldBlock({ ...strict, gateBlockedAt: BEFORE }), true);
});

test('latestPassAt ignores malformed JSON and verdict FAIL', () => {
  const dir = projectWith({
    'a.json': '{broken',
    'b.json': { verdict: 'FAIL', at: AFTER, checks: [], unverified: [] },
    'c.json': { verdict: 'PASS', at: 'not a date' },
    'd.json': { verdict: 'PASS' },
    'e.txt': { verdict: 'PASS', at: AFTER },
  });
  assert.equal(latestPassAt(dir), null);
});

test('latestPassAt returns the newest PASS', () => {
  const dir = projectWith({
    'old.json': { verdict: 'PASS', at: BEFORE, checks: [], unverified: [] },
    'new.json': { verdict: 'PASS', at: EDIT, checks: [], unverified: [] },
    'fail.json': { verdict: 'FAIL', at: AFTER, checks: [], unverified: [] },
  });
  assert.equal(latestPassAt(dir), EDIT);
});

test('latestPassAt returns null when .uc/verification is missing', () => {
  assert.equal(latestPassAt(tempDir('uc empty ')), null);
});

test('CLI flow: track-edit then profile-gate exits 2 once, then 0', () => {
  const base = tempDir('uc gate cfg ');
  const cwd = tempDir('uc gate project ');
  const env = { ...process.env, CLAUDE_CONFIG_DIR: base, UC_PROFILE: 'strict' };
  delete env.CLAUDE_PROJECT_DIR;
  const run = (name, input) => spawnSync(process.execPath, [hookPath(name)], {
    input: JSON.stringify(input), encoding: 'utf8', env,
  });
  const stop = { session_id: 'flow', cwd, stop_hook_active: false };

  assert.equal(run('profile-gate.mjs', stop).status, 0, 'no edit yet');
  assert.equal(run('track-edit.mjs', { session_id: 'flow', cwd, tool_name: 'Edit' }).status, 0);

  const first = run('profile-gate.mjs', stop);
  assert.equal(first.status, 2);
  assert.match(first.stderr, /STRICT profile: files changed after the last PASS verification\. Run the release-gate agent/);
  assert.equal(run('profile-gate.mjs', stop).status, 0, 'second stop passes');
});

test('CLI: standard profile and empty stdin exit 0', () => {
  const base = tempDir('uc gate cfg ');
  const cwd = tempDir('uc gate project ');
  const env = { ...process.env, CLAUDE_CONFIG_DIR: base };
  delete env.CLAUDE_PROJECT_DIR;
  delete env.UC_PROFILE;
  const run = (name, input) => spawnSync(process.execPath, [hookPath(name)], { input, encoding: 'utf8', env });
  assert.equal(run('track-edit.mjs', JSON.stringify({ session_id: 's', cwd })).status, 0);
  assert.equal(run('profile-gate.mjs', JSON.stringify({ session_id: 's', cwd })).status, 0);
  assert.equal(run('profile-gate.mjs', '').status, 0);
  assert.equal(run('track-edit.mjs', '').status, 0);
});
