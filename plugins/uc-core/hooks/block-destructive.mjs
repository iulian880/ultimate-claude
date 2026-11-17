#!/usr/bin/env node
// PreToolUse hook (Bash, PowerShell): blocks destructive commands that a text deny rule can miss.
// Exit 2 blocks the tool call; stderr goes back to Claude. Fails closed on unreadable input.
import { isMain, runHook } from './lib/hook-io.mjs';

const tokens = (text) => text.split(/\s+/).map((t) => t.replace(/^["']+|["']+$/g, '')).filter(Boolean);

function isRmRf(segment) {
  const m = /(?:^|[^\w.-])rm\s+(.*)$/s.exec(segment);
  if (!m) return false;
  const args = tokens(m[1]);
  const recursive = args.some((a) => a === '--recursive' || /^-[A-Za-z]*[rR][A-Za-z]*$/.test(a));
  const force = args.some((a) => a === '--force' || /^-[A-Za-z]*f[A-Za-z]*$/.test(a));
  return recursive && force;
}

function isGitResetHard(segment) {
  return /(?:^|[^\w-])git\s.*\breset\b.*--hard\b/s.test(segment);
}

function isGitForcePush(segment) {
  const m = /(?:^|[^\w-])git\s.*?\bpush\b(.*)$/s.exec(segment);
  if (!m) return false;
  // --force-with-lease is allowed: only the exact long flag, a short group with "f", or a +refspec count.
  return tokens(m[1]).some((a) => a === '--force' || /^-[A-Za-z]*f[A-Za-z]*$/.test(a) || /^\+[\w.\/-]/.test(a));
}

function isRemoveItemRecurseForce(segment) {
  return /(?:^|[^\w-])remove-item\b/i.test(segment) && /\s-recurse\b/i.test(segment) && /\s-force\b/i.test(segment);
}

function isRdSQ(segment) {
  return /(?:^|[^\w.-])(?:rd|rmdir)\s/i.test(segment) && /\s\/s\b/i.test(segment) && /\s\/q\b/i.test(segment);
}

const RULES = [
  ['rm -rf', isRmRf],
  ['git reset --hard', isGitResetHard],
  ['git push --force', isGitForcePush],
  ['Remove-Item -Recurse -Force', isRemoveItemRecurseForce],
  ['rd /s /q', isRdSQ],
];

/** Returns the label of the first destructive rule the command matches, or null. */
export function findDestructive(command) {
  if (typeof command !== 'string') return null;
  // Flags only count inside the same simple command, so split on shell separators first.
  for (const segment of command.split(/[;&|\r\n]+/)) {
    for (const [label, matches] of RULES) {
      if (matches(segment)) return label;
    }
  }
  return null;
}

export function handle(input) {
  if (input === null) {
    return { exit: 2, stderr: 'Blocked by uc-core block-destructive: hook input was empty or not JSON, so the command could not be checked.' };
  }
  const command = input.tool_input?.command;
  const label = findDestructive(typeof command === 'string' ? command : JSON.stringify(input.tool_input ?? {}));
  if (label) {
    return { exit: 2, stderr: `Blocked by uc-core block-destructive: ${label}. Ask the user to run it manually if it is really intended.` };
  }
  return { exit: 0 };
}

if (isMain(import.meta.url)) await runHook(handle, { failClosed: true });
