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

test('a question that starts with a profile name does not switch the profile (audit 2026-11-18)', () => {
  assert.equal(detectProfile('Profile standard is slow, why?'), null);
  assert.equal(detectProfile('profil strict e mai lent?'), null);
  assert.equal(detectProfile('profil strict\nDe ce e lent testul?'), 'strict');
});

test('a period or colon after the profile name switches even when a question follows', () => {
  assert.equal(detectProfile('profil strict. Ce face gate-ul?'), 'strict');
  assert.equal(detectProfile('profil minimal: de ce?'), 'minimal');
  assert.equal(detectProfile('Profile standard is slow, why?'), null);
});

test('a question that names a profile gets a note that nothing was switched', () => {
  const base = tempBase();
  const r = run(JSON.stringify({ session_id: 'q', prompt: 'Profile standard is slow, why?' }), base);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /not switched/);
  assert.deepEqual(readSession('q', { CLAUDE_CONFIG_DIR: base }), {});
});
