import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const json = (...parts) => JSON.parse(fs.readFileSync(path.join(root, ...parts), 'utf8'));
const KEYS = ['name', 'source', 'version', 'license', 'scope', 'default', 'install', 'uninstall', 'verify',
  'bringsHooks', 'bringsMcp', 'alwaysOnTokens'];
const OPT_IN = ['planning-with-files', 'graphify', 'ponytail'];

test('each profile file sets the matching UC_PROFILE and nothing else', () => {
  for (const name of ['minimal', 'standard', 'strict']) {
    assert.deepEqual(json('plugins', 'uc-core', 'profiles', `${name}.json`), { env: { UC_PROFILE: name } });
  }
});

test('lockfile: schema 1, every entry has exactly the twelve keys, names are unique', () => {
  const lock = json('components.lock.json');
  assert.equal(lock.schema, 1);
  assert.ok(lock.components.length >= 10);
  for (const c of lock.components) {
    assert.deepEqual(Object.keys(c).sort(), [...KEYS].sort(), c.name);
    assert.ok(['global', 'project'].includes(c.scope), c.name);
    assert.equal(typeof c.default, 'boolean', c.name);
    assert.equal(typeof c.bringsHooks, 'boolean', c.name);
    assert.equal(typeof c.bringsMcp, 'boolean', c.name);
    assert.equal(c.alwaysOnTokens, null, c.name);
    for (const key of ['source', 'version', 'license', 'install', 'uninstall', 'verify']) {
      assert.ok(typeof c[key] === 'string' && c[key].length > 0, `${c.name}.${key}`);
    }
  }
  const names = lock.components.map((c) => c.name);
  assert.equal(new Set(names).size, names.length);
});

test('lockfile: the opt-in components have default === false', () => {
  const byName = new Map(json('components.lock.json').components.map((c) => [c.name, c]));
  for (const name of OPT_IN) assert.equal(byName.get(name)?.default, false, name);
});

test('lockfile: no install string contains @latest or a download piped to a shell', () => {
  for (const c of json('components.lock.json').components) {
    assert.doesNotMatch(c.install, /@latest/, c.name);
    assert.doesNotMatch(c.install, /\b(curl|wget|irm|iwr|Invoke-WebRequest|Invoke-RestMethod)\b[^|]*\|\s*(sudo\s+)?(sh|bash|zsh|iex|Invoke-Expression)\b/i, c.name);
  }
});

test('bin/uc: unknown profile prints usage and exits 1; a known one starts claude with the profile file',
  { skip: process.platform === 'win32' && 'POSIX launcher' }, () => {
    const uc = path.join(root, 'bin', 'uc');
    const bogus = spawnSync('sh', [uc, 'bogus'], { encoding: 'utf8' });
    assert.equal(bogus.status, 1);
    assert.match(bogus.stderr, /Usage: uc <minimal\|standard\|strict>/);
    assert.equal(spawnSync('sh', [uc], { encoding: 'utf8' }).status, 1);

    const fakeBin = fs.mkdtempSync(path.join(os.tmpdir(), 'uc fake bin '));
    fs.writeFileSync(path.join(fakeBin, 'claude'), '#!/bin/sh\nfor a in "$@"; do echo "$a"; done\n', { mode: 0o755 });
    const ok = spawnSync('sh', [uc, 'strict', '--version'], {
      encoding: 'utf8', env: { ...process.env, PATH: `${fakeBin}${path.delimiter}${process.env.PATH}` },
    });
    assert.equal(ok.status, 0, ok.stderr);
    const expected = fs.realpathSync(path.join(root, 'plugins', 'uc-core', 'profiles', 'strict.json'));
    assert.deepEqual(ok.stdout.trim().split('\n'), ['--settings', expected, '--version']);
  });

test('lockfile: Excel tooling is the Mac toolchain, not the Windows-only tools', () => {
  const byName = new Map(json('components.lock.json').components.map((c) => [c.name, c]));
  for (const gone of ['xlflow', 'xlwings', 'pester', 'psscriptanalyzer', 'mcp-server-excel']) {
    assert.equal(byName.has(gone), false, gone);
  }
  for (const name of ['libreoffice', 'openpyxl', 'olefile', 'oletools']) {
    assert.equal(byName.get(name)?.scope, 'project', name);
  }
  for (const name of ['openpyxl', 'olefile', 'oletools']) {
    assert.match(byName.get(name).install, new RegExp(`pip install ${name}==${byName.get(name).version.replace(/\./g, '\\.')}`));
  }
});
