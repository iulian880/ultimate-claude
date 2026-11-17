import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lintPlugin } from '../scripts/lint-plugin.mjs';

const pluginDir = fileURLToPath(new URL('../plugins/uc-core', import.meta.url));
const config = () => JSON.parse(fs.readFileSync(path.join(pluginDir, 'hooks', 'hooks.json'), 'utf8'));
const commands = (groups) => groups.flatMap((g) => g.hooks.map((h) => h.command));

test('the five events are wired to the right scripts', () => {
  const { hooks } = config();
  assert.deepEqual(Object.keys(hooks).sort(), ['PostToolUse', 'PreToolUse', 'SessionStart', 'Stop', 'UserPromptSubmit']);
  assert.match(commands(hooks.SessionStart)[0], /session-start\.mjs/);
  assert.equal(hooks.PreToolUse[0].matcher, 'Bash|PowerShell');
  assert.match(commands(hooks.PreToolUse)[0], /block-destructive\.mjs/);
  assert.match(commands(hooks.UserPromptSubmit)[0], /set-profile\.mjs/);
  assert.equal(hooks.PostToolUse[0].matcher, 'Edit|Write|NotebookEdit');
  assert.match(commands(hooks.PostToolUse)[0], /track-edit\.mjs/);
  assert.match(commands(hooks.Stop)[0], /profile-gate\.mjs/);
});

test('every command references an existing file under plugins/uc-core/hooks', () => {
  const all = Object.values(config().hooks).flatMap(commands);
  assert.equal(all.length, 5);
  for (const command of all) {
    const m = /^node "\$\{CLAUDE_PLUGIN_ROOT\}\/(hooks\/[\w-]+\.mjs)"$/.exec(command);
    assert.ok(m, command);
    assert.ok(fs.existsSync(path.join(pluginDir, m[1])), m[1]);
  }
});

test('lintPlugin reports no problems for uc-core', () => {
  assert.deepEqual(lintPlugin(pluginDir), []);
});

test('the guards block the tool call when they cannot run (node missing, crash): onFailure "block"', () => {
  const { hooks } = config();
  assert.equal(hooks.PreToolUse[0].hooks[0].onFailure, 'block');
  const excel = JSON.parse(fs.readFileSync(path.join(pluginDir, '..', 'uc-excel', 'hooks', 'hooks.json'), 'utf8'));
  assert.equal(excel.hooks.PreToolUse[0].hooks[0].onFailure, 'block');
  for (const event of ['SessionStart', 'UserPromptSubmit', 'PostToolUse', 'Stop']) {
    assert.equal(hooks[event][0].hooks[0].onFailure, undefined, `${event} must not block on its own failure`);
  }
});
