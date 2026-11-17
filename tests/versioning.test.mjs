// Plugin versions: installs from git (the Windows plan) get a cached copy that changes only when the computed
// version changes. Without a `version`, Claude Code uses the commit, so every pushed fix reaches them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => JSON.parse(fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));

test('no plugin pins a version, so git installs follow the commits', () => {
  for (const plugin of ['uc-core', 'uc-excel']) {
    assert.equal(read(`plugins/${plugin}/.claude-plugin/plugin.json`).version, undefined, plugin);
  }
  for (const entry of read('.claude-plugin/marketplace.json').plugins) {
    assert.equal(entry.version, undefined, entry.name);
  }
});
