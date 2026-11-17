#!/usr/bin/env node
// UserPromptSubmit hook: a prompt that starts with "profil strict" / "uc profile minimal" sets the
// profile for this session. Stdout is added to Claude's context. Never blocks.
import { isMain, runHook } from './lib/hook-io.mjs';
import { projectDir, updateSession } from './lib/state.mjs';
import { recordStartTree } from './session-start.mjs';

const PATTERN = /^\s*(?:uc\s+)?profile?\s+(minimal|standard|strict)\b/i;

/** Returns the profile named at the start of the prompt, or null. */
export function detectProfile(prompt) {
  if (typeof prompt !== 'string') return null;
  const m = PATTERN.exec(prompt);
  return m ? m[1].toLowerCase() : null;
}

export function handle(input) {
  const profile = detectProfile(input?.prompt);
  if (!profile) return { exit: 0 };
  updateSession(input.session_id, { profile });
  const dir = projectDir(input);
  if (profile === 'strict' && dir) recordStartTree(input.session_id, dir);
  return { exit: 0, stdout: `UC profile for this session is now ${profile.toUpperCase()}.` };
}

if (isMain(import.meta.url)) await runHook(handle);
