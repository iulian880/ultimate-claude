import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { contract, passError } from '../plugins/uc-core/hooks/lib/verification.mjs';
import { readSession } from '../plugins/uc-core/hooks/lib/state.mjs';

const hooks = fileURLToPath(new URL('../plugins/uc-core/hooks/', import.meta.url));
const write = (dir, file, data) => fs.writeFileSync(path.join(dir, file), typeof data === 'string' ? data : JSON.stringify(data));
function temp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uc v2 '));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('bind, record, release and conversational Stop follow code, contract and platform independently', t => {
  const dir = temp(t);
  const env = { ...process.env, CLAUDE_CONFIG_DIR: temp(t), CLAUDE_PROJECT_DIR: dir, UC_PROFILE: 'strict' };
  execFileSync('git', ['init','-q'], { cwd: dir });
  fs.mkdirSync(path.join(dir,'docs/specs'), { recursive: true });
  const spec = 'docs/specs/export.md';
  const setSpec = text => write(dir, spec, '## Acceptance criteria\n- ' + text + '\n');
  setSpec('CSV');
  const cli = (...args) => spawnSync(process.execPath, [path.join(hooks,'cli.mjs'),'verify',...args], { cwd: dir, env, encoding:'utf8' });
  const hook = script => spawnSync(process.execPath, [path.join(hooks,script)], { cwd: dir, env, input: JSON.stringify({session_id:'s',cwd:dir}) }).status;
  assert.equal(cli('--bind',spec).status,0);
  hook('session-start.mjs');
  write(dir,'.uc/before.json', cli('--snapshot').stdout);
  assert.equal(cli('--capture','.uc/c.json',process.execPath,'-e','console.log("CSV checked")').status,0);
  const checks = [JSON.parse(fs.readFileSync(path.join(dir,'.uc/c.json')))];
  const report = { verdict:'PASS',criteria:[{criterion:'CSV',status:'VERIFIED',checks:[0]}],checks,unverified:[] };
  write(dir,'.uc/report.json',report);
  assert.equal(cli('--record','.uc/before.json','.uc/report.json').status,0);
  assert.equal(cli('--check').status,0);
  assert.equal(cli('--check','--platform','other').status,1);
  write(dir,'docs/specs/unrelated.md','notes');
  assert.equal(cli('--check').status,0);
  write(dir,'.uc/report.json',{...report, verdict:'FAIL', unverified:['new run failed']});
  assert.equal(cli('--record','.uc/before.json','.uc/report.json').status,1);
  assert.equal(cli('--check').status,1);
  write(dir,'.uc/report.json',report);
  assert.equal(cli('--record','.uc/before.json','.uc/report.json').status,0);
  assert.equal(cli('--check').status,0);
  setSpec('CSV and XLSX');
  assert.equal(cli('--check').status,1);
  assert.equal(cli('--record','.uc/before.json','.uc/report.json').status,1);
  assert.equal(hook('profile-gate.mjs'),2);
  assert.equal(hook('profile-gate.mjs'),0);
  assert.equal(cli('--check').status,1);
  const active = contract(dir);
  const valid = { ...report,schemaVersion:2,at:new Date().toISOString(),tree:'abc',treeBefore:'abc',platform:process.platform,criteriaDigest:active.digest,
    criteria:[{criterion:'CSV and XLSX',status:'VERIFIED',checks:[0]}] };
  for (const patch of [{schemaVersion:1},{at:'bad'},{checks:[{exitCode:0}]},{criteria:[{...valid.criteria[0],checks:[1]}]},
    {criteria:[{...valid.criteria[0],criterion:'CSV'}]},{unverified:['Excel']},{treeBefore:'previous'}]) {
    assert.ok(passError({...valid,...patch},active));
  }
  assert.equal(passError({...valid,checks:[{type:'inspection',artifact:'export.png',summary:'Both formats visible'}]},active),null);
});

test('parallel worktree edits remain visible to the parent session Stop hook', async t => {
  const dir = temp(t);
  const env = { ...process.env, CLAUDE_CONFIG_DIR: temp(t), CLAUDE_PROJECT_DIR: dir, UC_PROFILE: 'strict' };
  const git = (...args) => execFileSync('git',args,{cwd:dir,stdio:'pipe'});
  git('init','-q'); write(dir,'a','initial'); git('add','a');
  git('-c','user.name=test','-c','user.email=t@example.invalid','commit','-qm','initial');
  const event = { session_id:'parent',cwd:dir };
  const sync = (script,data) => spawnSync(process.execPath,[path.join(hooks,script)],{env,input:JSON.stringify(data)}).status;
  assert.equal(sync('session-start.mjs',event),0);
  const roots = [temp(t),temp(t)];
  for (const [i,root] of roots.entries()) {
    git('worktree','add','-qb','branch'+i,root); write(root,'a','changed '+i);
  }
  await Promise.all(roots.map((root,i) => new Promise((resolve,reject) => {
    const child = spawn(process.execPath,[path.join(hooks,'track-edit.mjs')],{env,stdio:['pipe','ignore','pipe']});
    child.on('error',reject); child.on('close',code => code === 0 ? resolve() : reject(Error('Hook exit '+code)));
    child.stdin.end(JSON.stringify({...event,agent_id:'worker'+i,tool_input:{file_path:path.join(root,'a')}}));
  })));
  assert.deepEqual(readSession('parent',env).worktrees.sort(),roots.map(r => fs.realpathSync(r)).sort());
  assert.equal(sync('profile-gate.mjs',event),2);
});
