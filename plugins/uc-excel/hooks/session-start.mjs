#!/usr/bin/env node
// SessionStart hook: records when this session started, so workbook-guard can tell fresh backups from old ones.
// Keeps the first value: a resumed or compacted session still counts from its real start.
import { isMain, runHook } from './lib/hook-io.mjs';
import { readSession, updateSession } from './lib/state.mjs';

export function handle(input) {
  if (input !== null && !readSession(input.session_id).startedAt) {
    updateSession(input.session_id, { startedAt: new Date().toISOString() });
  }
  return { exit: 0 };
}

if (isMain(import.meta.url)) await runHook(handle);
