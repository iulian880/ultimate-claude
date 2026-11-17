#!/usr/bin/env node
// Prints the working-tree fingerprint of the current directory for the release-gate proof ("tree"), or "none"
// outside a git repository. Usage: node "${CLAUDE_PLUGIN_ROOT}/hooks/fingerprint.mjs"
import { isMain } from './lib/hook-io.mjs';
import { treeFingerprint } from './lib/fingerprint.mjs';

if (isMain(import.meta.url)) process.stdout.write(`${treeFingerprint(process.cwd()) ?? 'none'}\n`);
