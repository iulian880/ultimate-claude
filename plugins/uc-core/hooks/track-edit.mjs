#!/usr/bin/env node
// PostToolUse hook (Edit|Write|NotebookEdit): records when this session last changed a file, and the git working
// tree it changed, so profile-gate also checks a worktree the session edited from outside. Never blocks.
import path from 'node:path';
import { isMain, runHook } from './lib/hook-io.mjs';
import { readSession, updateSession } from './lib/state.mjs';
import { repoRoot } from './lib/fingerprint.mjs';

export function handle(input) {
  if (input === null) return { exit: 0 };
  const patch = { lastEditAt: new Date().toISOString() };
  const file = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  const root = typeof file === 'string' ? repoRoot(path.dirname(path.resolve(input.cwd ?? '.', file))) : null;
  const seen = readSession(input.session_id).worktrees;
  const worktrees = Array.isArray(seen) ? seen : [];
  if (root && !worktrees.includes(root)) patch.worktrees = [...worktrees, root];
  updateSession(input.session_id, patch);
  return { exit: 0 };
}

if (isMain(import.meta.url)) await runHook(handle);
