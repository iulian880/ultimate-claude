import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findDestructive } from '../plugins/uc-core/hooks/block-destructive.mjs';

const hook = fileURLToPath(new URL('../plugins/uc-core/hooks/block-destructive.mjs', import.meta.url));
const run = (input) => spawnSync(process.execPath, [hook], { input, encoding: 'utf8' });

const blocked = ['rm -rf build', 'rm -fr x', 'rm -r -f x', 'rm --recursive --force x', 'sudo rm -Rf /tmp/x',
  'git reset --hard HEAD~1', 'git -C repo reset --hard', 'git push --force', 'git push -f origin main',
  'git push origin +main', 'Remove-Item -Recurse -Force .\\out', 'Remove-Item out -Force -Recurse',
  'rd /s /q out', 'rmdir /S /Q out'];
const allowed = ['rm -r dir', 'rm -f file.txt', 'git push --force-with-lease', 'git reset --soft HEAD~1',
  'git push origin main', 'Remove-Item file.txt', 'Remove-Item -Recurse out', 'npm run format'];

test('each blocked command returns a label', () => {
  for (const command of blocked) assert.equal(typeof findDestructive(command), 'string', command);
});

test('each allowed command returns null', () => {
  for (const command of allowed) assert.equal(findDestructive(command), null, command);
});

test('labels match the rule that fired', () => {
  assert.equal(findDestructive('rm -rf build'), 'rm -rf');
  assert.equal(findDestructive('git -C repo reset --hard'), 'git reset --hard');
  assert.equal(findDestructive('git push -f origin main'), 'git push --force');
  assert.equal(findDestructive('remove-item out -force -recurse'), 'Remove-Item -Recurse -Force');
  assert.equal(findDestructive('rmdir /S /Q out'), 'rd /s /q');
});

test('destructive command inside a chain is found; flags of another segment do not count', () => {
  assert.equal(findDestructive('cd build && rm -rf dist'), 'rm -rf');
  assert.equal(findDestructive('npm test; git push --force'), 'git push --force');
  assert.equal(findDestructive('rm -r dir && cp -f a b'), null);
  assert.equal(findDestructive('git push origin main && git commit -m "fix"'), null);
  assert.equal(findDestructive('git push --force-with-lease && echo done'), null);
});

test('CLI: empty stdin exits 2', () => {
  assert.equal(run('').status, 2);
  assert.equal(run('{not json').status, 2);
});

test('CLI: allowed command exits 0, blocked exits 2 with label in stderr', () => {
  const ok = run(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git push origin main' } }));
  assert.equal(ok.status, 0);
  assert.equal(ok.stderr, '');
  const bad = run(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'rm -rf build' } }));
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /Blocked by uc-core block-destructive: rm -rf\. Ask the user to run it manually/);
});

test('CLI: input without a command string is scanned as a whole', () => {
  assert.equal(run(JSON.stringify({ tool_name: 'Bash', tool_input: {} })).status, 0);
  assert.equal(run(JSON.stringify({ tool_name: 'X', tool_input: { script: 'git reset --hard' } })).status, 2);
});
