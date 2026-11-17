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
  'git push origin main', 'Remove-Item file.txt', 'npm run format'];

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

// Audit 2026-11-18: git commands that throw away work, PowerShell short forms, text that only mentions a command.
const RF = 'r' + 'm -rf';
const HARD = 'git reset --' + 'hard';

test('git commands that throw away uncommitted work or branches are blocked', () => {
  for (const c of ['git clean -fdx', 'git clean -f', 'git clean --force -d', 'git clean -xdf', 'git -C repo clean -fX',
    'git checkout -- .', 'git checkout .', 'git checkout -f main', 'git restore .', 'git restore :/',
    'git restore --staged --worktree .', 'git stash drop', 'git stash clear', 'git branch -D feat',
    'git branch --delete --force feat', 'git branch -df feat', 'git push --delete origin feat', 'git push origin -d feat',
    'git push origin :main', 'git push --mirror backup', 'git push --prune origin']) {
    assert.equal(typeof findDestructive(c), 'string', c);
  }
});

test('the safe forms of the same git commands still run', () => {
  for (const c of ['git clean -n', 'git clean -fn', 'git clean -f --dry-run', 'git checkout -- src/a.js', 'git checkout main',
    'git checkout -b feat', 'git restore --staged .', 'git restore src/a.js', 'git stash', 'git stash pop',
    'git branch -d feat', 'git push -u origin feat', 'git status']) {
    assert.equal(findDestructive(c), null, c);
  }
});

test('PowerShell recursive deletes are blocked in their short and aliased forms', () => {
  for (const c of ['Remove-Item -r -fo x', 'Remove-Item -Recurse x', 'Remove-Item x -rec', 'Remove-Item -R:$true x',
    'ri -Recurse -Force x', 'del -Recurse -Force x', 'erase -r x', 'rm -Recurse -Force C:\\x', 'rd x -Recurse',
    'powershell -c "del -r x"', 'del /s /q out', 'erase /S out']) {
    assert.equal(typeof findDestructive(c), 'string', c);
  }
  for (const c of ['rm -r x', 'rd -r x', 'rmdir -r x']) {
    assert.equal(typeof findDestructive(c, { powershell: true }), 'string', `PowerShell: ${c}`);
  }
});

test('Bash rm -r, single-file deletes and -WhatIf previews are not PowerShell deletes', () => {
  for (const c of ['rm -r dir', 'del file.txt', 'Remove-Item file.txt', 'Remove-Item x -Recurse -WhatIf']) {
    assert.equal(findDestructive(c), null, c);
  }
});

test('text that only mentions a destructive command is not blocked', () => {
  for (const c of [`git commit -m "docs: never ${HARD}"`, `git commit -m 'fix: push -f no longer'`, `git log --grep="${RF}"`,
    `grep -n "${RF}" file.js`, `rg "${HARD}" docs`, `echo "git push -f"`, `printf '${RF} x\\n'`,
    `git commit -m "a; ${RF} x"`]) {
    assert.equal(findDestructive(c), null, c);
  }
});

test('commands hidden in quotes that run are still blocked', () => {
  for (const c of [`git commit -m "$(${RF} x)"`, `bash -c "${RF} x"`, `echo ok; ${RF} x`, `echo "\`${RF} x\`"`,
    `sh -c '${HARD}'`]) {
    assert.equal(typeof findDestructive(c), 'string', c);
  }
});

test('the PowerShell tool turns on PowerShell aliases', () => {
  const r = spawnSync(process.execPath, [hook], {
    input: JSON.stringify({ tool_name: 'PowerShell', tool_input: { command: 'rm -r C:\\work\\out' } }), encoding: 'utf8',
  });
  assert.equal(r.status, 2);
});

// Final review 2026-11-18: quoting must follow bash (escapes, pipes into a shell), every git call counts.
test('text piped into a shell, or escaped quotes, do not hide a command that runs', () => {
  for (const c of [`echo "${RF} ~/proj" | sh`, `echo '${HARD}' | bash`, `echo it\\'s; ${RF} build; echo \\'ok`,
    `echo \\"; ${RF} build; echo \\"`, `echo don\\'t; git clean -fdx; echo \\'done`, `printf '%s' "git clean -fdx" | sudo bash`]) {
    assert.equal(typeof findDestructive(c), 'string', c);
  }
});

test('git commands inside a quoted script and the other forms that discard work are blocked', () => {
  for (const c of ['bash -c "git status; git clean -fdx"', "sh -c 'git fetch && git checkout -- .'", 'eval "git clean -fdx"',
    'git switch -f main', 'git switch --discard-changes main', 'git worktree remove --force .worktrees/x',
    'git --work-tree x clean -fdx']) {
    assert.equal(typeof findDestructive(c), 'string', c);
  }
  for (const c of ['git switch main', 'git switch -c feat', 'git worktree remove .worktrees/x', `git log --grep="${RF}" | head`,
    'Remove-Item -Recurse -Force C:\\x -WhatIf']) {
    assert.equal(findDestructive(c), null, c);
  }
});
