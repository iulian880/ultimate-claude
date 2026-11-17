import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { treeFingerprint } from '../plugins/uc-core/hooks/lib/fingerprint.mjs';

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uc fp repo '));
  const git = (...a) => execFileSync('git', ['-C', dir, ...a], { stdio: 'pipe' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'test');
  fs.writeFileSync(path.join(dir, '.gitignore'), 'backups/\n');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'one\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'init');
  return { dir, git };
}

test('null outside a git repository', () => {
  assert.equal(treeFingerprint(fs.mkdtempSync(path.join(os.tmpdir(), 'uc fp plain '))), null);
});

test('same content gives the same fingerprint; a change made by any means changes it', () => {
  const { dir } = repo();
  const f0 = treeFingerprint(dir);
  assert.match(f0, /^[0-9a-f]{40,64}$/);
  assert.equal(treeFingerprint(dir), f0);
  fs.writeFileSync(path.join(dir, 'a.txt'), 'two\n');        // as a Bash or Python edit would
  const f1 = treeFingerprint(dir);
  assert.notEqual(f1, f0);
  fs.writeFileSync(path.join(dir, 'new.txt'), 'x\n');         // untracked file
  assert.notEqual(treeFingerprint(dir), f1);
});

test('ignored files and .uc/ do not change it; committing the same content does not either', () => {
  const { dir, git } = repo();
  fs.writeFileSync(path.join(dir, 'a.txt'), 'two\n');
  const before = treeFingerprint(dir);
  fs.mkdirSync(path.join(dir, 'backups'));
  fs.writeFileSync(path.join(dir, 'backups', 'x.bin'), 'x');
  fs.mkdirSync(path.join(dir, '.uc', 'verification'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.uc', 'verification', 'p.json'), '{}');
  assert.equal(treeFingerprint(dir), before);
  git('add', 'a.txt');
  git('commit', '-q', '-m', 'two');
  assert.equal(treeFingerprint(dir), before);
});

test('it does not touch the real index', () => {
  const { dir, git } = repo();
  fs.writeFileSync(path.join(dir, 'new.txt'), 'x\n');
  treeFingerprint(dir);
  assert.match(git('status', '--porcelain').toString(), /^\?\? new\.txt$/m);
});
