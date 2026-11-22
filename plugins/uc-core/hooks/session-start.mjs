#!/usr/bin/env node
// SessionStart hook: when the session runs in the STRICT profile, records the working-tree fingerprint it started
// from, so profile-gate can tell whether this session changed the code by any means. Keeps the first value.
import { isMain, runHook } from './lib/hook-io.mjs';
import { projectDir, readSession, resolveProfile, updateSession } from './lib/state.mjs';
import { contractState } from './lib/verification.mjs';
import { treeFingerprint, worktreeRoots } from './lib/fingerprint.mjs';

/** Start state of a session that edited files before it became STRICT: never equal to a real tree. */
export const UNKNOWN_START = 'unknown';

/**
 * Records startTree for a STRICT session that has none yet. Shared with set-profile.
 * If this session already edited files (it switched to STRICT later, or it was resumed from before this gate
 * existed), the state it started from is unknown, so the gate will ask for a PASS on whatever the code is now.
 */
export function recordStartTree(sessionId, dir) {
  const session = readSession(sessionId);
  if (session.startTree || session.startContract !== undefined) return;
  // Worktrees that already exist belong to other work; the gate judges them from the state this session finds them in.
  const startContract = contractState(dir);
  const startWorktrees = worktreeRoots(dir);
  if (session.lastEditAt) {
    updateSession(sessionId, { startTree: UNKNOWN_START, startWorktrees, startContract });
    return;
  }
  const tree = treeFingerprint(dir);
  updateSession(sessionId, { startTree: tree, startWorktrees, startContract });
}

export function handle(input) {
  const dir = input === null ? null : projectDir(input);
  if (!dir) return { exit: 0 };
  if (resolveProfile({ sessionId: input.session_id }) === 'strict') recordStartTree(input.session_id, dir);
  return { exit: 0 };
}

if (isMain(import.meta.url)) await runHook(handle);
