#!/usr/bin/env node
// UserPromptSubmit hook: a prompt that starts with "profil strict" / "uc profile minimal" sets the
// profile for this session. Stdout is added to Claude's context. Never blocks.
import { isMain, runHook } from './lib/hook-io.mjs';
import { projectDir, updateSession } from './lib/state.mjs';
import { recordStartTree } from './session-start.mjs';

const PATTERN = /^\s*(?:uc\s+)?profile?\s+(minimal|standard|strict)\b(.?)/i;

/**
 * Reads "profil <name>" at the start of the prompt. A first line that ends with "?" is a question about a profile
 * ("Profile standard is slow, why?"), not a command, unless the name is followed by . : ; , ! or the end of the line.
 */
function readProfile(prompt) {
  if (typeof prompt !== 'string') return null;
  const m = PATTERN.exec(prompt);
  if (!m) return null;
  const explicit = m[2] === '' || /[.:;,!\n\r]/.test(m[2]);
  const question = !explicit && prompt.split('\n', 1)[0].trim().endsWith('?');
  return { name: m[1].toLowerCase(), question };
}

/** Returns the profile named at the start of the prompt, or null. */
export function detectProfile(prompt) {
  const r = readProfile(prompt);
  return r && !r.question ? r.name : null;
}

export function handle(input) {
  const read = readProfile(input?.prompt);
  if (read?.question) {
    return { exit: 0, stdout: `UC profile not switched: the prompt reads as a question. To switch, start with "profil ${read.name}." (a period after the name).` };
  }
  const profile = read?.name;
  if (!profile) return { exit: 0 };
  updateSession(input.session_id, { profile });
  const dir = projectDir(input);
  if (profile === 'strict' && dir) recordStartTree(input.session_id, dir);
  return { exit: 0, stdout: `UC profile for this session is now ${profile.toUpperCase()}.` };
}

if (isMain(import.meta.url)) await runHook(handle);
