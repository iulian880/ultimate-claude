#!/usr/bin/env node
// PostToolUse hook (Edit|Write|NotebookEdit): records when this session last changed a file.
// profile-gate compares it with the latest PASS verification. Never blocks.
import { isMain, runHook } from './lib/hook-io.mjs';
import { updateSession } from './lib/state.mjs';

export function handle(input) {
  if (input !== null) updateSession(input.session_id, { lastEditAt: new Date().toISOString() });
  return { exit: 0 };
}

if (isMain(import.meta.url)) await runHook(handle);
