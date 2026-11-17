import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lintPlugin } from '../scripts/lint-plugin.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const json = (...parts) => JSON.parse(fs.readFileSync(path.join(root, ...parts), 'utf8'));

test('marketplace lists uc-excel at ./plugins/uc-excel', () => {
  const entry = json('.claude-plugin', 'marketplace.json').plugins.find((p) => p.name === 'uc-excel');
  assert.equal(entry?.source, './plugins/uc-excel');
  assert.ok(entry.description.length > 20);
});

test('uc-excel depends on uc-core', () => {
  assert.deepEqual(json('plugins', 'uc-excel', '.claude-plugin', 'plugin.json').dependencies, ['uc-core']);
});

test('lintPlugin reports no problems for uc-excel', () => {
  assert.deepEqual(lintPlugin(path.join(root, 'plugins', 'uc-excel')), []);
});
