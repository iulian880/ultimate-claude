#!/usr/bin/env node
// PreToolUse hook (Bash, PowerShell): blocks destructive commands that a text deny rule can miss.
// Exit 2 blocks the tool call; stderr goes back to Claude. Fails closed on unreadable input.
import { isMain, runHook } from './lib/hook-io.mjs';

const tokens = (text) => text.split(/\s+/).map((t) => t.replace(/^["']+|["']+$/g, '')).filter(Boolean);
const shortGroup = (letter) => new RegExp(`^-[A-Za-z]*${letter}[A-Za-z]*$`);

function isRmRf(segment) {
  const m = /(?:^|[^\w.-])rm\s+(.*)$/s.exec(segment);
  if (!m) return false;
  const args = tokens(m[1]);
  const recursive = args.some((a) => a === '--recursive' || /^-[A-Za-z]*[rR][A-Za-z]*$/.test(a));
  const force = args.some((a) => a === '--force' || shortGroup('f').test(a));
  return recursive && force;
}

/** The git subcommand of a segment and its arguments, skipping options such as `-C dir` before it. */
function gitCall(segment) {
  const m = /(?:^|[^\w-])git((?:\s+-[Cc]\s+\S+|\s+--?[\w-]+(?:=\S+)?)*)\s+([a-z][\w-]*)\b(.*)$/s.exec(segment);
  return m ? { sub: m[2], args: tokens(m[3]) } : null;
}

function isGitResetHard(segment) {
  return /(?:^|[^\w-])git\s.*\breset\b.*--hard\b/s.test(segment);
}

function isGitForcePush(segment) {
  const m = /(?:^|[^\w-])git\s.*?\bpush\b(.*)$/s.exec(segment);
  if (!m) return false;
  // --force-with-lease is allowed: only the exact long flag, a short group with "f", or a +refspec count.
  return tokens(m[1]).some((a) => a === '--force' || shortGroup('f').test(a) || /^\+[\w.\/-]/.test(a));
}

const WHOLE_TREE = new Set(['.', './', ':/', '*', ':(top)', ':/*']);

/** git clean -f, checkout/restore of the whole tree, checkout -f, stash drop/clear, branch -D. */
function isGitDiscard(segment) {
  const call = gitCall(segment);
  if (!call) return false;
  const { sub, args } = call;
  const has = (...flags) => args.some((a) => flags.includes(a));
  if (sub === 'clean') {
    return args.some((a) => a === '--force' || shortGroup('f').test(a))
      && !args.some((a) => a === '--dry-run' || shortGroup('n').test(a));
  }
  if (sub === 'checkout') return has('-f', '--force') || args.some((a) => WHOLE_TREE.has(a));
  if (sub === 'restore') {
    const stagedOnly = has('--staged', '-S') && !has('--worktree', '-W');
    return !stagedOnly && args.some((a) => WHOLE_TREE.has(a));
  }
  if (sub === 'stash') return args[0] === 'drop' || args[0] === 'clear';
  if (sub === 'branch') {
    const del = args.some((a) => a === '--delete' || shortGroup('d').test(a));
    const force = args.some((a) => a === '--force' || shortGroup('f').test(a));
    return args.some((a) => shortGroup('D').test(a)) || (del && force);
  }
  return false;
}

/** git push that deletes remote branches: --delete, -d, :branch, --mirror, --prune. */
function isGitRemoteDelete(segment) {
  const call = gitCall(segment);
  if (!call || call.sub !== 'push') return false;
  return call.args.some((a) => ['--delete', '-d', '--mirror', '--prune'].includes(a) || /^:[^\s]/.test(a));
}

function isRemoveItemRecurseForce(segment) {
  return /(?:^|[^\w-])remove-item\b/i.test(segment) && /\s-recurse\b/i.test(segment) && /\s-force\b/i.test(segment);
}

// PowerShell accepts any unambiguous prefix of a parameter name: -r, -rec, -Recurse, -Recurse:$true.
const PS_RECURSE = /^-r(?:e(?:c(?:u(?:r(?:s(?:e)?)?)?)?)?)?(?::\$?true)?$/i;
const PS_WHATIF = /^-wh?(?:a(?:t(?:i(?:f)?)?)?)?$/i;

/**
 * Remove-Item and its aliases with -Recurse in any short form. Remove-Item, ri, del and erase are PowerShell only;
 * rm, rd and rmdir also exist in Bash, so their short -r counts only under the PowerShell tool.
 */
function isPsRecursiveDelete(segment, powershell) {
  const m = /(?:^|[\s"'({])(remove-item|ri|del|erase|rm|rd|rmdir)\s+(.*)$/is.exec(segment);
  if (!m) return false;
  const name = m[1].toLowerCase();
  const args = tokens(m[2]);
  if (args.some((a) => PS_WHATIF.test(a))) return false;
  const recurse = args.some((a) => PS_RECURSE.test(a));
  if (['remove-item', 'ri', 'del', 'erase'].includes(name)) return recurse;
  return args.some((a) => PS_RECURSE.test(a) && /^-rec/i.test(a)) || (powershell && recurse);
}

function isRdSQ(segment) {
  return /(?:^|[^\w.-])(?:rd|rmdir)\s/i.test(segment) && /\s\/s\b/i.test(segment) && /\s\/q\b/i.test(segment);
}

function isDelS(segment) {
  return /(?:^|[^\w.-])(?:del|erase)\s/i.test(segment) && /\s\/s\b/i.test(segment);
}

const RULES = [
  ['rm -rf', isRmRf],
  ['git reset --hard', isGitResetHard],
  ['git push --force', isGitForcePush],
  ['git command that discards uncommitted work or a branch', isGitDiscard],
  ['git push that deletes remote branches', isGitRemoteDelete],
  ['Remove-Item -Recurse -Force', isRemoveItemRecurseForce],
  ['Remove-Item -Recurse', isPsRecursiveDelete],
  ['rd /s /q', isRdSQ],
  ['del /s', isDelS],
];

/** Splits on ; & | and newlines that are outside quotes. */
function splitSegments(command) {
  const segments = [];
  let current = '';
  let quote = null;
  for (const ch of command) {
    if (quote) {
      if (ch === quote) quote = null;
      current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
    } else if (/[;&|\r\n]/.test(ch)) {
      segments.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  segments.push(current);
  return segments;
}

// Commands whose quoted arguments are text (a message, a search pattern), not code that runs.
const TEXT_COMMANDS = /^\s*(?:(?:echo|printf|grep|egrep|fgrep|rg|ag)\b|git\s+(?:-C\s+\S+\s+)?(?:commit|log|tag|notes|grep|show)\b)/;

/** Empties quoted text in commands that only print or search it, unless it runs something ($( ) or backticks). */
function withoutQuotedText(segment) {
  if (!TEXT_COMMANDS.test(segment)) return segment;
  return segment.replace(/"[^"]*"|'[^']*'/g, (q) => (/\$\(|`/.test(q) ? q : '""'));
}

/** Returns the label of the first destructive rule the command matches, or null. */
export function findDestructive(command, { powershell = false } = {}) {
  if (typeof command !== 'string') return null;
  // Flags only count inside the same simple command, so split on shell separators first.
  for (const raw of splitSegments(command)) {
    const segment = withoutQuotedText(raw);
    for (const [label, matches] of RULES) {
      if (matches(segment, powershell)) return label;
    }
  }
  return null;
}

export function handle(input) {
  if (input === null) {
    return { exit: 2, stderr: 'Blocked by uc-core block-destructive: hook input was empty or not JSON, so the command could not be checked.' };
  }
  const command = input.tool_input?.command;
  const label = findDestructive(typeof command === 'string' ? command : JSON.stringify(input.tool_input ?? {}),
    { powershell: input.tool_name === 'PowerShell' });
  if (label) {
    return { exit: 2, stderr: `Blocked by uc-core block-destructive: ${label}. Ask the user to run it manually if it is really intended.` };
  }
  return { exit: 0 };
}

if (isMain(import.meta.url)) await runHook(handle, { failClosed: true });
