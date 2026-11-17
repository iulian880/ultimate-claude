import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectProfile } from '../plugins/uc-core/hooks/set-profile.mjs';
import { readSession } from '../plugins/uc-core/hooks/lib/state.mjs';

const hook = fileURLToPath(new URL('../plugins/uc-core/hooks/set-profile.mjs', import.meta.url));
const tempBase = () => fs.mkdtempSync(path.join(os.tmpdir(), 'uc profile '));
const run = (input, base) => spawnSync(process.execPath, [hook], {
  input, encoding: 'utf8', env: { ...process.env, CLAUDE_CONFIG_DIR: base },
});

test('detectProfile("profil STRICT") === "strict"', () => {
  assert.equal(detectProfile('profil STRICT'), 'strict');
});

test('detectProfile("  UC profile minimal pentru typo") === "minimal"', () => {
  assert.equal(detectProfile('  UC profile minimal pentru typo'), 'minimal');
});

test('detectProfile("explain the strict profile") === null', () => {
  assert.equal(detectProfile('explain the strict profile'), null);
  assert.equal(detectProfile('profile strictly speaking'), null);
  assert.equal(detectProfile(undefined), null);
});

test('CLI writes profile into the session file and prints the confirmation', () => {
  const base = tempBase();
  const result = run(JSON.stringify({ session_id: 'sess-1', prompt: 'profil strict' }), base);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), 'UC profile for this session is now STRICT.');
  assert.deepEqual(readSession('sess-1', { CLAUDE_CONFIG_DIR: base }), { profile: 'strict' });
});

test('CLI with an ordinary prompt exits 0, prints nothing and writes nothing', () => {
  const base = tempBase();
  const result = run(JSON.stringify({ session_id: 'sess-1', prompt: 'fix the typo' }), base);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.deepEqual(fs.readdirSync(base), []);
});

test('CLI with empty stdin exits 0 and writes nothing', () => {
  const base = tempBase();
  const result = run('', base);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.deepEqual(fs.readdirSync(base), []);
});
