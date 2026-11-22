#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { atomicJson, contract, passes, passError } from './lib/verification.mjs';
import { repoRoot, treeFingerprint } from './lib/fingerprint.mjs';
import { configBase, PROFILES, readSession } from './lib/state.mjs';

const dir = process.cwd();
const [command, action, ...args] = process.argv.slice(2);
const json = value => console.log(JSON.stringify(value, null, 2));
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));

function currentTree() {
  const tree = treeFingerprint(dir);
  if (!tree && repoRoot(dir)) throw Error('Could not fingerprint this Git worktree');
  return tree ?? 'none';
}

function status(sessionId) {
  const inventory = spawnSync('claude', ['plugin', 'list', '--json'], { encoding: 'utf8', timeout: 8000 });
  let plugins;
  try { if (inventory.status === 0) plugins = JSON.parse(inventory.stdout); } catch { /* unknown */ }
  function availability(name) {
    if (!Array.isArray(plugins)) return 'unknown';
    const matches = plugins.filter(p => p.id?.split('@')[0] === name);
    if (matches.some(p => p.enabled === true)) return 'enabled';
    if (matches.length && matches.every(p => p.enabled === false)) return 'disabled';
    return matches.length ? 'installed; activation unconfirmed' : 'not listed';
  }
  const layers = [
    ['local project settings', path.join(dir, '.claude/settings.local.json')],
    ['project settings', path.join(dir, '.claude/settings.json')],
    ['user settings', path.join(configBase(), 'settings.json')],
  ].map(([name, file]) => [name, fs.existsSync(file) ? read(file).env ?? {} : {}]);
  const candidates = [
    ['session', sessionId && readSession(sessionId).profile],
    ['environment', process.env.UC_PROFILE],
    ...layers.map(([name, env]) => [name, env.UC_PROFILE]),
    ['default', 'standard'],
  ];
  const [profileSource, profile] = candidates.map(([s,v]) => [s,typeof v === 'string' ? v.trim().toLowerCase() : null]).find(([,v]) => PROFILES.includes(v));
  const security = process.env.ENABLE_CODE_SECURITY_REVIEW ?? layers.map(([,env]) => env.ENABLE_CODE_SECURITY_REVIEW).find(v => v !== undefined);
  const tree = treeFingerprint(dir);
  json({ profile, profileSource, sessionId: sessionId ?? null, superpowers: availability('superpowers'),
    securityGuidance: availability('security-guidance'), ucCore: availability('uc-core'),
    securityReviewSetting: security ?? 'plugin default if enabled',
    platform: process.platform, currentPass: tree ? passes(dir).find(p => p.tree === tree)?.file ?? null : null });
}

try {
  if (command === 'status' && ((!action && !args.length) || (action === '--session' && args.length === 1))) {
    status(args[0] ?? process.env.CLAUDE_CODE_SESSION_ID);
  } else if (command !== 'verify') {
    throw Error('Usage: uc status [--session ID] | uc verify --bind|--snapshot|--capture|--record|--check');
  } else if (action === '--bind' && args.length === 1) {
    const active = contract(dir, path.relative(dir, path.resolve(args[0])));
    atomicJson(path.join(dir, '.uc/contract.json'), { source: active.source });
    json(active);
  } else if (action === '--snapshot' && !args.length) {
    json({ treeBefore: currentTree(), criteriaDigest: contract(dir).digest, platform: process.platform });
  } else if (action === '--capture' && args.length >= 2) {
    const [file, executable, ...parameters] = args;
    const result = spawnSync(executable, parameters, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    if (result.error) throw result.error;
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    process.stderr.write(output + '\n');
    const exitCode = result.status ?? 1;
    atomicJson(file, { type: 'command', command: JSON.stringify([executable, ...parameters]), exitCode,
      summary: output.split('\n').slice(-5).join('\n') || 'Process exited with code ' + exitCode });
    process.exitCode = exitCode;
  } else if (action === '--record' && args.length === 2) {
    const [before, report] = args.map(read);
    const active = contract(dir);
    const proof = { ...report, schemaVersion: 2, at: new Date().toISOString(), platform: process.platform,
      criteriaDigest: before.criteriaDigest, treeBefore: before.treeBefore, tree: currentTree() };
    if (before.platform !== proof.platform) throw Error('Verification platform changed');
    if (!['PASS','FAIL'].includes(proof.verdict)) throw Error('Expected PASS or FAIL');
    if (proof.verdict === 'PASS') {
      const error = passError(proof, active);
      if (error) throw Error(error);
    }
    const file = path.join(dir, '.uc/verification', randomUUID() + '.json');
    atomicJson(file, proof);
    console.log(proof.verdict, file);
    process.exitCode = proof.verdict === 'PASS' ? 0 : 1;
  } else if (action === '--check' && (args.length === 0 || (args[0] === '--platform' && args.length === 2))) {
    const tree = treeFingerprint(dir);
    if (!tree) throw Error('Release check requires a Git worktree');
    contract(dir);
    const platform = args[1] ?? process.platform;
    const proof = passes(dir, platform).find(p => p.tree === tree);
    if (!proof) throw Error('No matching PASS for current code, criteria and platform ' + platform);
    console.log('PASS', proof.file);
  } else throw Error('Invalid verify arguments; see docs/verification-v2.md');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
