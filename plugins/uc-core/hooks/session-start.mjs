#!/usr/bin/env node
// SessionStart hook: when the session runs in the STRICT profile, records the working-tree fingerprint it started
// from, so profile-gate can tell whether this session changed the code by any means. Keeps the first value.
import { isMain, runHook } from './lib/hook-io.mjs';
import { readSession, resolveProfile, updateSession } from './lib/state.mjs';
import { treeFingerprint } from './lib/fingerprint.mjs';

/** Records startTree for a STRICT session that has none yet. Shared with set-profile. */
export function recordStartTree(sessionId, cwd) {
  if (readSession(sessionId).startTree) return;
  const tree = treeFingerprint(cwd);
  if (tree) updateSession(sessionId, { startTree: tree });
}

export function handle(input) {
  if (input === null || typeof input.cwd !== 'string') return { exit: 0 };
  if (resolveProfile({ sessionId: input.session_id }) === 'strict') recordStartTree(input.session_id, input.cwd);
  return { exit: 0 };
}

if (isMain(import.meta.url)) await runHook(handle);
