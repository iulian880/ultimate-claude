// Reproductions of the final-review findings on the STRICT gate (2026-11-18).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { passingTrees } from '../plugins/uc-core/hooks/lib/verification.mjs';
import { treeFingerprint } from '../plugins/uc-core/hooks/lib/fingerprint.mjs';

const hooks = fileURLToPath(new URL('../plugins/uc-core/hooks/', import.meta.url));
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));

function repo() {
  const dir = tmp('uc review repo ');
  const git = (...a) => execFileSync('git', ['-C', dir, ...a], { stdio: 'pipe' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'test');
  fs.mkdirSync(path.join(dir, 'packages', 'app', 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'packages', 'app', 'src', 'a.txt'), 'one\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'init');
  return dir;
}

const checks = [{ command: 'npm test', exitCode: 0, summary: 'ok' }];
const criteria = [{ criterion: '1. it works', status: 'VERIFIED', checks: [0] }];
const fullProof = (tree) => ({ verdict: 'PASS', at: new Date().toISOString(), checks, criteria, unverified: [], treeBefore: tree, tree });
function writeProof(projectDir, name, body) {
  fs.mkdirSync(path.join(projectDir, '.uc', 'verification'), { recursive: true });
  fs.writeFileSync(path.join(projectDir, '.uc', 'verification', name), JSON.stringify(body));
}

function envFor(projectDir, extra = {}) {
  const env = { ...process.env, CLAUDE_CONFIG_DIR: tmp('uc review cfg '), ...extra };
  if (projectDir) env.CLAUDE_PROJECT_DIR = projectDir; else delete env.CLAUDE_PROJECT_DIR;
  return env;
}
const run = (name, input, env) =>
  spawnSync(process.execPath, [path.join(hooks, name)], { input: JSON.stringify(input), encoding: 'utf8', env }).status;

test('finding 1: a PASS written in a monorepo package counts (the proof file does not change the tree)', () => {
  const root = repo();
  const app = path.join(root, 'packages', 'app');
  const env = envFor(app, { UC_PROFILE: 'strict' });
  run('session-start.mjs', { session_id: 'm', cwd: app }, env);
  fs.writeFileSync(path.join(app, 'src', 'a.txt'), 'two\n');
  writeProof(app, 'p.json', fullProof(treeFingerprint(app)));
  assert.equal(run('profile-gate.mjs', { session_id: 'm', cwd: app, stop_hook_active: false }, env), 0);
});

test('finding 1: after Claude cd-ed into a subfolder the proof is still read from the project root', () => {
  const root = repo();
  const env = envFor(root, { UC_PROFILE: 'strict' });
  run('session-start.mjs', { session_id: 'c', cwd: root }, env);
  fs.writeFileSync(path.join(root, 'packages', 'app', 'src', 'a.txt'), 'two\n');
  writeProof(root, 'p.json', fullProof(treeFingerprint(root)));
  const sub = path.join(root, 'packages', 'app', 'src');
  assert.equal(run('profile-gate.mjs', { session_id: 'c', cwd: sub, stop_hook_active: false }, env), 0);
});

test('finding 2: agent memory notes written after a PASS do not invalidate it', () => {
  const root = repo();
  const env = envFor(root, { UC_PROFILE: 'strict' });
  run('session-start.mjs', { session_id: 'g', cwd: root }, env);
  fs.writeFileSync(path.join(root, 'packages', 'app', 'src', 'a.txt'), 'two\n');
  writeProof(root, 'p.json', fullProof(treeFingerprint(root)));
  const mem = path.join(root, '.claude', 'agent-memory', 'code-reviewer');
  fs.mkdirSync(mem, { recursive: true });
  fs.writeFileSync(path.join(mem, 'MEMORY.md'), '- the project tests with node --test\n');
  assert.equal(run('profile-gate.mjs', { session_id: 'g', cwd: root, stop_hook_active: false }, env), 0);
});

test('finding 3: a PASS without criteria, with empty criteria or with unverified items does not count', () => {
  const dir = tmp('uc review proofs ');
  const base = fullProof('OK');
  writeProof(dir, 'ok.json', base);
  writeProof(dir, 'nocriteria.json', { ...base, tree: 'T1', treeBefore: 'T1', criteria: undefined });
  writeProof(dir, 'emptycriteria.json', { ...base, tree: 'T2', treeBefore: 'T2', criteria: [] });
  writeProof(dir, 'unverified.json', { ...base, tree: 'T3', treeBefore: 'T3', unverified: ['criterion 2 on Windows'] });
  writeProof(dir, 'nounverified.json', { ...base, tree: 'T4', treeBefore: 'T4', unverified: undefined });
  assert.deepEqual([...passingTrees(dir)], ['OK']);
});

test('finding 4: a PASS whose checks changed the code (tree before differs from after) does not count', () => {
  const dir = tmp('uc review proofs ');
  writeProof(dir, 'changed.json', { ...fullProof('AFTER'), treeBefore: 'BEFORE' });
  writeProof(dir, 'nobefore.json', { ...fullProof('T5'), treeBefore: undefined });
  assert.deepEqual([...passingTrees(dir)], []);
});

test('finding 5: edits made before switching to STRICT still need a verification', () => {
  const root = repo();
  const env = envFor(root);
  delete env.UC_PROFILE;
  run('session-start.mjs', { session_id: 'e', cwd: root }, env);
  fs.writeFileSync(path.join(root, 'packages', 'app', 'src', 'a.txt'), 'edited in STANDARD\n');
  run('track-edit.mjs', { session_id: 'e', cwd: root }, env);
  run('set-profile.mjs', { session_id: 'e', cwd: root, prompt: 'profil strict' }, env);
  assert.equal(run('profile-gate.mjs', { session_id: 'e', cwd: root, stop_hook_active: false }, env), 2);
});

test('finding 5: a session from before the tree gate, resumed with unverified edits, is still blocked', () => {
  const root = repo();
  const env = envFor(root, { UC_PROFILE: 'strict' });
  fs.mkdirSync(path.join(env.CLAUDE_CONFIG_DIR, 'uc', 'sessions'), { recursive: true });
  fs.writeFileSync(path.join(env.CLAUDE_CONFIG_DIR, 'uc', 'sessions', 'old.json'),
    JSON.stringify({ profile: 'strict', lastEditAt: new Date().toISOString() }));
  fs.writeFileSync(path.join(root, 'packages', 'app', 'src', 'a.txt'), 'edited before the update\n');
  run('session-start.mjs', { session_id: 'old', cwd: root, source: 'resume' }, env);
  assert.equal(run('profile-gate.mjs', { session_id: 'old', cwd: root, stop_hook_active: false }, env), 2);
});
