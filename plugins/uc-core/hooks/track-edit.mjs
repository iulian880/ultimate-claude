#!/usr/bin/env node
// PostToolUse hook (Edit|Write|NotebookEdit): records when this session last changed a file, and which worktree of
// the project it changed, so profile-gate also checks a worktree the session edited from outside. Never blocks.
import path from 'node:path';
import { isMain, runHook } from './lib/hook-io.mjs';
import { projectDir, readSession, updateSession } from './lib/state.mjs';
import { commonDir, headTree, repoRoot } from './lib/fingerprint.mjs';

/** For an edit inside another worktree of this project: the worktree list, and its baseline if it existed before. */
function worktreePatch(input, session) {
  const file = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  if (typeof file !== 'string') return {};
  const root = repoRoot(path.dirname(path.resolve(input.cwd ?? '.', file)));
  const mainRoot = repoRoot(projectDir(input));
  if (!root || !mainRoot || root === mainRoot || commonDir(root) !== commonDir(mainRoot)) return {};
  const worktrees = Array.isArray(session.worktrees) ? session.worktrees : [];
  const patch = worktrees.includes(root) ? {} : { worktrees: [...worktrees, root] };
  const starts = session.starts && typeof session.starts === 'object' ? session.starts : {};
  const existed = !Array.isArray(session.startWorktrees) || session.startWorktrees.includes(root);
  // The edit has already happened: its last commit is the closest state from before it.
  if (existed && !starts[root]) patch.starts = { ...starts, [root]: headTree(root) };
  return patch;
}

export function handle(input) {
  if (input === null) return { exit: 0 };
  const session = readSession(input.session_id);
  updateSession(input.session_id, { lastEditAt: new Date().toISOString(), ...worktreePatch(input, session) });
  return { exit: 0 };
}

if (isMain(import.meta.url)) await runHook(handle);
