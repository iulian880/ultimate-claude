import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shouldBlockTree } from '../plugins/uc-core/hooks/profile-gate.mjs';
import { passingTrees } from '../plugins/uc-core/hooks/lib/verification.mjs';
import { treeFingerprint } from '../plugins/uc-core/hooks/lib/fingerprint.mjs';
import { readSession } from '../plugins/uc-core/hooks/lib/state.mjs';

const hooks = fileURLToPath(new URL('../plugins/uc-core/hooks/', import.meta.url));
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));

function repo() {
  const dir = tmp('uc gate repo ');
  const git = (...a) => execFileSync('git', ['-C', dir, ...a], { stdio: 'pipe' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'test');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'one\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'init');
  return dir;
}

const proof = (dir, name, body) => {
  fs.mkdirSync(path.join(dir, '.uc', 'verification'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.uc', 'verification', name), JSON.stringify(body));
};
const goodChecks = [{ command: 'npm test', exitCode: 0, summary: 'ok' }];

test('shouldBlockTree: only STRICT, only when the tree changed, unless a PASS matches or it already blocked once', () => {
  const base = { profile: 'strict', stopHookActive: false, startTree: 'A', currentTree: 'B', passTrees: new Set(), blockedTree: undefined };
  assert.equal(shouldBlockTree(base), true);
  assert.equal(shouldBlockTree({ ...base, profile: 'standard' }), false);
  assert.equal(shouldBlockTree({ ...base, currentTree: 'A' }), false);
  assert.equal(shouldBlockTree({ ...base, passTrees: new Set(['B']) }), false);
  assert.equal(shouldBlockTree({ ...base, passTrees: new Set(['A']) }), true);
  assert.equal(shouldBlockTree({ ...base, blockedTree: 'B' }), false);
  assert.equal(shouldBlockTree({ ...base, blockedTree: 'X' }), true);
  assert.equal(shouldBlockTree({ ...base, stopHookActive: true }), false);
});

test('passingTrees: a proof counts only with a tree, passing checks and every criterion VERIFIED', () => {
  const dir = tmp('uc proofs ');
  proof(dir, 'ok.json', { verdict: 'PASS', at: 'x', treeBefore: 'T1', tree: 'T1', checks: goodChecks, criteria: [{ criterion: 'c', status: 'VERIFIED', checks: [0] }], unverified: [] });
  proof(dir, 'notree.json', { verdict: 'PASS', at: '2099-01-01T00:00:00Z', checks: goodChecks });
  proof(dir, 'nochecks.json', { verdict: 'PASS', tree: 'T2', checks: [] });
  proof(dir, 'failedcheck.json', { verdict: 'PASS', tree: 'T3', checks: [{ command: 'x', exitCode: 1, summary: '' }] });
  proof(dir, 'notperformed.json', { verdict: 'PASS', tree: 'T4', checks: goodChecks, criteria: [{ criterion: 'c', status: 'NOT PERFORMED', checks: [] }] });
  proof(dir, 'fail.json', { verdict: 'FAIL', tree: 'T5', checks: goodChecks });
  assert.deepEqual([...passingTrees(dir)], ['T1']);
});

function hook(name, input, env) {
  return spawnSync(process.execPath, [path.join(hooks, name)], { input: JSON.stringify(input), encoding: 'utf8', env });
}

test('CLI: a Bash-style edit in STRICT is caught; one block per state; a matching PASS lets it stop', () => {
  const dir = repo();
  const cfg = tmp('uc gate cfg ');
  const env = { ...process.env, CLAUDE_CONFIG_DIR: cfg, UC_PROFILE: 'strict' };
  delete env.CLAUDE_PROJECT_DIR;
  const stop = { session_id: 's1', cwd: dir, stop_hook_active: false };
  assert.equal(hook('session-start.mjs', { session_id: 's1', cwd: dir, hook_event_name: 'SessionStart' }, env).status, 0);
  assert.ok(readSession('s1', { CLAUDE_CONFIG_DIR: cfg }).startTree);
  assert.equal(hook('profile-gate.mjs', stop, env).status, 0, 'nothing changed');

  fs.writeFileSync(path.join(dir, 'a.txt'), 'changed by a shell command\n');
  const first = hook('profile-gate.mjs', stop, env);
  assert.equal(first.status, 2);
  assert.match(first.stderr, /STRICT profile: the code changed in this session and no PASS verification matches it/);
  assert.equal(hook('profile-gate.mjs', stop, env).status, 0, 'second stop on the same state passes');

  proof(dir, 'forged.json', { verdict: 'PASS', at: '2099-01-01T00:00:00Z', checks: goodChecks });
  fs.writeFileSync(path.join(dir, 'a.txt'), 'changed again\n');
  assert.equal(hook('profile-gate.mjs', stop, env).status, 2, 'a proof without the tree does not count');

  proof(dir, 'real.json', { verdict: 'PASS', at: new Date().toISOString(), tree: treeFingerprint(dir), checks: goodChecks, criteria: [], unverified: [] });
  fs.writeFileSync(path.join(dir, 'b.txt'), 'later edit\n');
  assert.equal(hook('profile-gate.mjs', stop, env).status, 2, 'the PASS was for an older state');
  const now = treeFingerprint(dir);
  proof(dir, 'real2.json', { verdict: 'PASS', at: new Date().toISOString(), treeBefore: now, tree: now, checks: goodChecks,
    criteria: [{ criterion: '1. c', status: 'VERIFIED', checks: [0] }], unverified: [] });
  assert.equal(hook('profile-gate.mjs', stop, env).status, 0, 'PASS for the current state');
});

test('CLI: switching to STRICT mid-session records the start state then', () => {
  const dir = repo();
  const cfg = tmp('uc gate cfg ');
  const env = { ...process.env, CLAUDE_CONFIG_DIR: cfg };
  delete env.UC_PROFILE;
  delete env.CLAUDE_PROJECT_DIR;
  assert.equal(hook('session-start.mjs', { session_id: 's2', cwd: dir }, env).status, 0);
  assert.equal(readSession('s2', { CLAUDE_CONFIG_DIR: cfg }).startTree, undefined, 'not strict: no fingerprint');
  assert.equal(hook('set-profile.mjs', { session_id: 's2', cwd: dir, prompt: 'profil strict' }, env).status, 0);
  assert.equal(readSession('s2', { CLAUDE_CONFIG_DIR: cfg }).startTree, treeFingerprint(dir));
});
