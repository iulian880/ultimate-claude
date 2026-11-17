import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { workbookTargets, hasFreshBackup } from '../plugins/uc-excel/hooks/workbook-guard.mjs';
import { readSession, updateSession } from '../plugins/uc-excel/hooks/lib/state.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const hooks = path.join(root, 'plugins', 'uc-excel', 'hooks');
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const bash = (command) => workbookTargets('Bash', { command });

test('lib copies are byte-identical to uc-core', () => {
  for (const f of ['hook-io.mjs', 'state.mjs']) {
    const ours = fs.readFileSync(path.join(hooks, 'lib', f));
    const core = fs.readFileSync(path.join(root, 'plugins', 'uc-core', 'hooks', 'lib', f));
    assert.ok(ours.equals(core), f);
  }
});

test('Write to a .xlsm is a target; Write to a .bas is not', () => {
  assert.deepEqual(workbookTargets('Write', { file_path: '/p/Robot.XLSM' }), ['/p/Robot.XLSM']);
  assert.deepEqual(workbookTargets('Edit', { file_path: '/p/vba/Flux.bas' }), []);
  assert.deepEqual(workbookTargets('NotebookEdit', { notebook_path: '/p/a.xlam' }), ['/p/a.xlam']);
});

test('quoted path with spaces is one target: cp a.xlsm "livrabile/Robot SAP v3.xlsm"', () => {
  assert.deepEqual(bash('cp a.xlsm "livrabile/Robot SAP v3.xlsm"'), ['livrabile/Robot SAP v3.xlsm']);
  assert.deepEqual(bash("cp -p 'x y.xlsb' backups/"), ['backups/x y.xlsb']); // exempted later as the backup itself
});

test('read-only commands are not targets', () => {
  for (const c of ['unzip -l "Robot SAP v3.10.xlsm"', 'unzip -p a.xlsm xl/vbaProject.bin > /tmp/v.bin',
    'zipinfo -1 a.xlsm', 'shasum "Robot SAP v3.10.xlsm"', 'cmp a.xlsm b.xlsm', 'ls -la *.xlsm', 'diff a.xlsm b.xlsm']) {
    assert.deepEqual(bash(c), [], c);
  }
});

test('mv, rm, redirect and python script arguments are targets', () => {
  assert.deepEqual(bash('mv old.xlsm new.xlsm'), ['old.xlsm', 'new.xlsm']);
  assert.deepEqual(bash('rm -f "Robot SAP v3.xlsm"'), ['Robot SAP v3.xlsm']);
  assert.deepEqual(bash('cat x > out.xlsm'), ['out.xlsm']);
  assert.deepEqual(bash('cd tools && python3 -I build_v3.py original_v2.xlsm v.bin "../livrabile/Robot SAP v3.xlsm"'),
    ['tools/original_v2.xlsm', 'livrabile/Robot SAP v3.xlsm']);
  assert.deepEqual(bash('npm test; git status'), []);
});

test('backup made before the session start does not count; one made after does; wrong name does not', () => {
  const proj = tmp('uc wb proj ');
  const dir = path.join(proj, 'backups');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'Robot SAP v3.20261117-090000.xlsm'), 'x');
  fs.writeFileSync(path.join(dir, 'Robot SAP v3 copy.xlsm'), 'x');
  const future = new Date(Date.now() + 60_000).toISOString();
  const past = new Date(Date.now() - 60_000).toISOString();
  assert.equal(hasFreshBackup('livrabile/Robot SAP v3.xlsm', proj, future), false);
  assert.equal(hasFreshBackup('livrabile/Robot SAP v3.xlsm', proj, past), true);
  fs.rmSync(path.join(dir, 'Robot SAP v3.20261117-090000.xlsm'));
  assert.equal(hasFreshBackup('livrabile/Robot SAP v3.xlsm', proj, past), false, 'wrong name must not count');
  assert.equal(hasFreshBackup('missing.xlsm', tmp('uc wb empty '), past), false);
});

test('a backup copied with cp -p (old modification time) after the session start counts', () => {
  const proj = tmp('uc wb cp-p ');
  fs.mkdirSync(path.join(proj, 'backups'));
  const f = path.join(proj, 'backups', 'Book 1.20261117-150000.xlsm');
  fs.writeFileSync(f, 'x');
  const old = new Date('2020-01-01T00:00:00Z');
  fs.utimesSync(f, old, old);
  assert.equal(hasFreshBackup('Book 1.xlsm', proj, new Date(Date.now() - 60_000).toISOString()), true);
});

function runGuard(input, { profile, base }) {
  const env = { ...process.env, CLAUDE_CONFIG_DIR: base };
  if (profile) env.UC_PROFILE = profile; else delete env.UC_PROFILE;
  delete env.CLAUDE_PROJECT_DIR;
  return spawnSync(process.execPath, [path.join(hooks, 'workbook-guard.mjs')], {
    input: JSON.stringify(input), encoding: 'utf8', env,
  });
}

test('CLI: strict blocks without backup, passes with fresh backup; standard warns and exits 0', () => {
  const base = tmp('uc wb cfg ');
  const proj = tmp('uc wb cli ');
  fs.writeFileSync(path.join(proj, 'Robot SAP v3.xlsm'), 'x');
  const started = new Date(Date.now() - 60_000).toISOString();
  updateSession('wb', { startedAt: started }, { CLAUDE_CONFIG_DIR: base });
  const input = { session_id: 'wb', cwd: proj, tool_name: 'Bash', tool_input: { command: 'cp a.xlsm "Robot SAP v3.xlsm"' } };

  const blocked = runGuard(input, { profile: 'strict', base });
  assert.equal(blocked.status, 2);
  assert.match(blocked.stderr, /uc-excel workbook-guard: back up Robot SAP v3\.xlsm to backups\/ first/);

  const warned = runGuard(input, { profile: undefined, base });
  assert.equal(warned.status, 0);
  const out = JSON.parse(warned.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.match(out.hookSpecificOutput.additionalContext, /no backup of Robot SAP v3\.xlsm/);
  assert.equal(out.hookSpecificOutput.permissionDecision, undefined);

  fs.mkdirSync(path.join(proj, 'backups'));
  fs.writeFileSync(path.join(proj, 'backups', 'Robot SAP v3.20261117-120000.xlsm'), 'x');
  assert.equal(runGuard(input, { profile: 'strict', base }).status, 0);
  assert.equal(runGuard(input, { profile: 'strict', base }).stdout, '');
});

test('CLI: empty stdin and non-workbook calls exit 0 silently', () => {
  const base = tmp('uc wb cfg ');
  const r = spawnSync(process.execPath, [path.join(hooks, 'workbook-guard.mjs')], { input: '', encoding: 'utf8' });
  assert.equal(r.status, 0);
  const plain = runGuard({ session_id: 's', cwd: base, tool_name: 'Bash', tool_input: { command: 'npm test' } },
    { profile: 'strict', base });
  assert.equal(plain.status, 0);
  assert.equal(plain.stdout + plain.stderr, '');
});

test('session-start keeps the first startedAt', () => {
  const base = tmp('uc wb cfg ');
  const env = { ...process.env, CLAUDE_CONFIG_DIR: base };
  const run = () => spawnSync(process.execPath, [path.join(hooks, 'session-start.mjs')], {
    input: JSON.stringify({ session_id: 'ss', hook_event_name: 'SessionStart' }), encoding: 'utf8', env,
  });
  assert.equal(run().status, 0);
  const first = readSession('ss', { CLAUDE_CONFIG_DIR: base }).startedAt;
  assert.ok(first);
  assert.equal(run().status, 0);
  assert.equal(readSession('ss', { CLAUDE_CONFIG_DIR: base }).startedAt, first);
});

test('hooks.json wires SessionStart and the PreToolUse guard to existing scripts', () => {
  const { hooks: h } = JSON.parse(fs.readFileSync(path.join(hooks, 'hooks.json'), 'utf8'));
  assert.deepEqual(Object.keys(h).sort(), ['PreToolUse', 'SessionStart']);
  assert.equal(h.PreToolUse[0].matcher, 'Write|Edit|NotebookEdit|Bash|PowerShell');
  for (const groups of Object.values(h)) {
    const m = /\$\{CLAUDE_PLUGIN_ROOT\}\/(hooks\/[\w-]+\.mjs)/.exec(groups[0].hooks[0].command);
    assert.ok(m && fs.existsSync(path.join(root, 'plugins', 'uc-excel', m[1])));
  }
});

test('CLI strict: writing the backup itself and creating a new workbook need no backup', () => {
  const base = tmp('uc wb cfg ');
  const proj = tmp('uc wb new ');
  updateSession('nb', { startedAt: new Date(Date.now() - 60_000).toISOString() }, { CLAUDE_CONFIG_DIR: base });
  fs.writeFileSync(path.join(proj, 'Book 1.xlsm'), 'x');
  const call = (command) => runGuard({ session_id: 'nb', cwd: proj, tool_name: 'Bash', tool_input: { command } },
    { profile: 'strict', base });
  assert.equal(call('mkdir -p backups && cp -p "Book 1.xlsm" "backups/Book 1.20261117-150000.xlsm"').status, 0);
  assert.equal(call('cp template.xlsm "Brand New.xlsm"').status, 0);
  assert.equal(call('cp template.xlsm "Book 1.xlsm"').status, 2);
  const write = runGuard({ session_id: 'nb', cwd: proj, tool_name: 'Write', tool_input: { file_path: path.join(proj, 'Book 1.xlsm') } },
    { profile: 'strict', base });
  assert.equal(write.status, 2);
});

test('PowerShell keeps backslashes; bash keeps them inside double quotes', () => {
  assert.deepEqual(workbookTargets('PowerShell', { command: 'Copy-Item a.txt -Destination "livrabile\\Robot SAP v3.10.xlsm"' }),
    ['livrabile\\Robot SAP v3.10.xlsm']);
  assert.deepEqual(bash('rm "livrabile\\a.xlsm"'), ['livrabile\\a.xlsm']);
  assert.deepEqual(bash('rm "say \\"hi\\".xlsm"'), ['say "hi".xlsm']);
});

test('cd changes where later paths point; >| is a redirect', () => {
  assert.deepEqual(bash('cd livrabile && rm a.xlsm'), ['livrabile/a.xlsm']);
  assert.deepEqual(bash('cd livrabile; cd ..; rm b.xlsm'), ['b.xlsm']);
  assert.deepEqual(bash('echo x >| out.xlsm'), ['out.xlsm']);
});

test('copy into a directory and paths inside inline scripts are targets', () => {
  assert.deepEqual(bash('cp new.xlsm livrabile/'), ['livrabile/new.xlsm']);
  assert.deepEqual(bash("python3 -c \"import openpyxl; wb = openpyxl.load_workbook('x.xlsm'); wb.save('x.xlsm')\""), ['x.xlsm']);
});

test('CLI strict: globs and cd are caught; backups are found at the project root from a subfolder', () => {
  const base = tmp('uc wb cfg ');
  const proj = tmp('uc wb glob ');
  updateSession('gl', { startedAt: new Date(Date.now() - 60_000).toISOString() }, { CLAUDE_CONFIG_DIR: base });
  fs.mkdirSync(path.join(proj, 'livrabile'));
  fs.mkdirSync(path.join(proj, 'tools'));
  fs.writeFileSync(path.join(proj, 'livrabile', 'a.xlsm'), 'x');
  const run = (command, cwd, projectDir) => {
    const env = { ...process.env, CLAUDE_CONFIG_DIR: base, UC_PROFILE: 'strict' };
    if (projectDir) env.CLAUDE_PROJECT_DIR = projectDir; else delete env.CLAUDE_PROJECT_DIR;
    return spawnSync(process.execPath, [path.join(hooks, 'workbook-guard.mjs')], {
      input: JSON.stringify({ session_id: 'gl', cwd, tool_name: 'Bash', tool_input: { command } }), encoding: 'utf8', env,
    });
  };
  assert.equal(run('rm livrabile/*.xlsm', proj).status, 2);
  assert.equal(run('cd livrabile && rm a.xlsm', proj).status, 2);
  fs.mkdirSync(path.join(proj, 'backups'));
  fs.writeFileSync(path.join(proj, 'backups', 'a.20261117-150000.xlsm'), 'x');
  assert.equal(run('rm ../livrabile/a.xlsm', path.join(proj, 'tools'), proj).status, 0);
  assert.equal(run('rm livrabile/*.xlsm', proj).status, 0);
});

test('more read-only commands are not targets; git commands that overwrite still are', () => {
  for (const c of ['unzip -o "Robot SAP v3.xlsm" -d /tmp/x', 'unzip a.xlsm', 'olevba "Robot SAP v3.xlsm"',
    'cat a.xlsm | wc -c', 'xxd a.xlsm | head', 'strings a.xlsm', 'git add "livrabile/Robot SAP v3.10.xlsm"',
    'git diff --stat a.xlsm', 'git log -- a.xlsm', 'git status a.xlsm']) {
    assert.deepEqual(bash(c), [], c);
  }
  assert.deepEqual(bash('git checkout -- a.xlsm'), ['a.xlsm']);
  assert.deepEqual(bash('git restore a.xlsm'), ['a.xlsm']);
});
