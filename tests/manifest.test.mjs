import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const json = (...parts) => JSON.parse(fs.readFileSync(path.join(root, ...parts), 'utf8'));

test('uc-core depends on security-guidance, so it is installed and enabled only together with uc-core', () => {
  const manifest = json('plugins', 'uc-core', '.claude-plugin', 'plugin.json');
  assert.deepEqual(manifest.dependencies, ['security-guidance@claude-plugins-official']);
});

test('the marketplace allows dependencies from claude-plugins-official and nothing else', () => {
  assert.deepEqual(json('.claude-plugin', 'marketplace.json').allowCrossMarketplaceDependenciesOn, ['claude-plugins-official']);
});

test('the lockfile records security-guidance as a project-scope dependency of uc-core', () => {
  const entry = json('components.lock.json').components.find((c) => c.name === 'security-guidance');
  assert.equal(entry.scope, 'project');
  assert.match(entry.install, /uc-core@ultimate-claude --scope project/);
});
