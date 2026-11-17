// STRICT gate: follows the worktrees the session works in, ignores planning documents (audit 2026-11-18).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { treeFingerprint } from '../plugins/uc-core/hooks/lib/fingerprint.mjs';

const hooks = fileURLToPath(new URL('../plugins/uc-core/hooks/', import.meta.url));
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));

function repo() {
  const dir = tmp('uc wt repo ');
  const git = (...a) => execFileSync('git', ['-C', dir, ...a], { stdio: 'pipe' }).toString();
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'test');
  fs.writeFileSync(path.join(dir, '.gitignore'), '.worktrees/\n');
  fs.writeFileSync(path.join(dir, 'code.js'), 'one\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'init');
  return { dir, git };
}
function setup() {
  const { dir, git } = repo();
  const env = { ...process.env, CLAUDE_CONFIG_DIR: tmp('uc wt cfg '), CLAUDE_PROJECT_DIR: dir, UC_PROFILE: 'strict' };
  run('session-start.mjs', { session_id: 's', cwd: dir }, env);
  return { dir, git, env };
}
function worktree(git, dir, name) {
  git('worktree', 'add', '-q', `.worktrees/${name}`, '-b', name);
  return path.join(dir, '.worktrees', name);
}
const run = (name, input, env) =>
  spawnSync(process.execPath, [path.join(hooks, name)], { input: JSON.stringify(input), encoding: 'utf8', env }).status;
const stop = (cwd, env) => run('profile-gate.mjs', { session_id: 's', cwd, stop_hook_active: false }, env);
function pass(root, tree) {
  fs.mkdirSync(path.join(root, '.uc', 'verification'), { recursive: true });
  fs.writeFileSync(path.join(root, '.uc', 'verification', 'p.json'), JSON.stringify({
    verdict: 'PASS', at: new Date().toISOString(), checks: [{ command: 'npm test', exitCode: 0, summary: 'ok' }],
    criteria: [{ criterion: '1. c', status: 'VERIFIED', checks: [0] }], unverified: [], treeBefore: tree, tree,
  }));
}

test('an edit in the worktree Claude works in blocks the stop; a PASS written there lets it stop', () => {
  const { dir, git, env } = setup();
  const wt = worktree(git, dir, 'feat');
  fs.writeFileSync(path.join(wt, 'code.js'), 'changed in the worktree\n');
  assert.equal(stop(wt, env), 2);
  fs.writeFileSync(path.join(wt, 'code.js'), 'changed again\n');
  pass(wt, treeFingerprint(wt));
  assert.equal(stop(wt, env), 0);
});

test('a worktree the session stopped in stays watched after Claude goes back to the main folder', () => {
  const { dir, git, env } = setup();
  const wt = worktree(git, dir, 'feat');
  assert.equal(stop(wt, env), 0, 'untouched worktree');
  fs.writeFileSync(path.join(wt, 'code.js'), 'changed\n');
  git('-C', wt, 'commit', '-q', '-am', 'work in worktree');
  assert.equal(stop(dir, env), 2);
});

test('a worktree the session edited through Edit/Write is watched even if no stop happened there', () => {
  const { dir, git, env } = setup();
  const wt = worktree(git, dir, 'feat');
  fs.writeFileSync(path.join(wt, 'code.js'), 'edited\n');
  run('track-edit.mjs', { session_id: 's', cwd: dir, tool_name: 'Edit', tool_input: { file_path: path.join(wt, 'code.js') } }, env);
  assert.equal(stop(dir, env), 2);
});

test('worktrees this session never touched are not its business', () => {
  const { dir, git, env } = setup();
  const other = worktree(git, dir, 'other-session');
  fs.writeFileSync(path.join(other, 'code.js'), 'another session works here\n');
  assert.equal(stop(dir, env), 0);
});

test('specs, plans, ADRs and the glossary are not code: changing only them does not block', () => {
  const { dir, git, env } = setup();
  for (const f of ['docs/superpowers/specs/x-design.md', 'docs/superpowers/plans/x.md', 'docs/adr/0001-x.md',
    'docs/specs/y.md', 'docs/plans/z.md', 'GLOSSARY.md', 'GLOSSARY-MAP.md']) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), '# doc\n');
  }
  git('add', '-A');
  git('commit', '-q', '-m', 'design docs');
  assert.equal(stop(dir, env), 0);
  fs.writeFileSync(path.join(dir, 'code.js'), 'now code\n');
  assert.equal(stop(dir, env), 2);
});
