import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  configBase, safeSessionId, readSession, updateSession, resolveProfile,
} from '../plugins/uc-core/hooks/lib/state.mjs';

const tempEnv = (extra = {}) => ({
  CLAUDE_CONFIG_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'uc state dir ')),
  ...extra,
});

test('configBase prefers CLAUDE_CONFIG_DIR and falls back to ~/.claude', () => {
  assert.equal(configBase({ CLAUDE_CONFIG_DIR: '/x y/cfg' }), '/x y/cfg');
  assert.equal(configBase({}), path.join(os.homedir(), '.claude'));
});

test('safeSessionId("../x") === "x" and safeSessionId("a\\b/c") === "abc"', () => {
  assert.equal(safeSessionId('../x'), 'x');
  assert.equal(safeSessionId('a\\b/c'), 'abc');
});

test('safeSessionId("") === "unknown"', () => {
  assert.equal(safeSessionId(''), 'unknown');
  assert.equal(safeSessionId(undefined), 'unknown');
  assert.equal(safeSessionId('../..'), 'unknown');
});

test('updateSession then readSession round-trips in a base dir containing a space', () => {
  const env = tempEnv();
  assert.ok(env.CLAUDE_CONFIG_DIR.includes(' '));
  updateSession('s-1', { profile: 'strict' }, env);
  updateSession('s-1', { lastEditAt: '2026-11-17T10:00:00.000Z' }, env);
  assert.deepEqual(readSession('s-1', env), { profile: 'strict', lastEditAt: '2026-11-17T10:00:00.000Z' });
});

test('a session id with path characters never escapes the sessions dir', () => {
  const env = tempEnv();
  updateSession('../../evil', { profile: 'strict' }, env);
  const sessions = path.join(env.CLAUDE_CONFIG_DIR, 'uc', 'sessions');
  assert.deepEqual(fs.readdirSync(sessions), ['evil.json']);
  assert.deepEqual(fs.readdirSync(env.CLAUDE_CONFIG_DIR), ['uc']);
});

test('readSession returns {} for a missing or malformed JSON file', () => {
  const env = tempEnv();
  assert.deepEqual(readSession('nope', env), {});
  const dir = path.join(env.CLAUDE_CONFIG_DIR, 'uc', 'sessions');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'bad.json'), '{oops');
  assert.deepEqual(readSession('bad', env), {});
  fs.writeFileSync(path.join(dir, 'arr.json'), '[1,2]');
  assert.deepEqual(readSession('arr', env), {});
});

test('resolveProfile: session file beats env; env beats default', () => {
  const env = tempEnv({ UC_PROFILE: 'minimal' });
  assert.equal(resolveProfile({ sessionId: 's', env }), 'minimal');
  updateSession('s', { profile: 'strict' }, env);
  assert.equal(resolveProfile({ sessionId: 's', env }), 'strict');
  assert.equal(resolveProfile({ sessionId: 'other', env: tempEnv() }), 'standard');
});

test('resolveProfile ignores UC_PROFILE="turbo" and returns "standard"', () => {
  assert.equal(resolveProfile({ sessionId: 's', env: tempEnv({ UC_PROFILE: 'turbo' }) }), 'standard');
});

test('resolveProfile ignores an invalid session profile and uses env', () => {
  const env = tempEnv({ UC_PROFILE: 'STRICT' });
  updateSession('s', { profile: 'turbo' }, env);
  assert.equal(resolveProfile({ sessionId: 's', env }), 'strict');
});
