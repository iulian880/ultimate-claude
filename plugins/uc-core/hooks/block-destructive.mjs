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
  const m = /(?:^|[^\w-])git((?:\s+-[Cc]\s+\S+|\s+--(?:work-tree|git-dir|namespace)\s+\S+|\s+--?[\w-]+(?:=\S+)?)*)\s+([a-z][\w-]*)\b(.*)$/s.exec(segment);
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

// PowerShell accepts any unambiguous prefix of a parameter name: -r, -rec, -Recurse, -Recurse:$true.
const PS_RECURSE = /^-r(?:e(?:c(?:u(?:r(?:s(?:e)?)?)?)?)?)?(?::\$?true)?$/i;
const PS_WHATIF = /^-wh?(?:a(?:t(?:i(?:f)?)?)?)?$/i;

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
  if (sub === 'switch') return has('-f', '--force', '--discard-changes');
  if (sub === 'worktree') return args[0] === 'remove' && has('-f', '--force');
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
  return /(?:^|[^\w-])remove-item\b/i.test(segment) && /\s-recurse\b/i.test(segment) && /\s-force\b/i.test(segment)
    && !tokens(segment).some((a) => PS_WHATIF.test(a));
}


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

/**
 * Reads a command the way bash quotes it: a backslash escapes the next character outside single quotes (PowerShell
 * keeps it, it is a path separator there), and separators inside quotes do not split. Returns the segments, each as
 * its text and the quoted strings in it.
 */
function scan(command, powershell) {
  const segments = [];
  let text = '';
  let quoted = [];
  let quote = null;
  let inner = '';
  const close = () => { segments.push({ text, quoted }); text = ''; quoted = []; };
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (quote === "'") {
      text += ch;
      if (ch === "'") { quote = null; quoted.push(inner); } else inner += ch;
    } else if (ch === '\\' && !powershell && i + 1 < command.length) {
      const next = command[++i];
      text += ch + next;
      if (quote === '"') inner += next;
    } else if (quote === '"') {
      text += ch;
      if (ch === '"') { quote = null; quoted.push(inner); } else inner += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      inner = '';
      text += ch;
    } else if (/[;&|\r\n]/.test(ch)) {
      close();
    } else {
      text += ch;
    }
  }
  close();
  return segments;
}

// Commands whose quoted arguments are text (a message, a search pattern), not code that runs.
const TEXT_COMMANDS = /^\s*(?:(?:echo|printf|grep|egrep|fgrep|rg|ag)\b|git\s+(?:-C\s+\S+\s+)?(?:commit|log|tag|notes|grep|show)\b)/;
// Output piped into a shell or eval runs as code, so text commands in such a line are not harmless.
const PIPE_TO_SHELL = /\|\s*(?:sudo\s+)?(?:\S*[\\/])?(?:sh|bash|zsh|dash|ksh|fish|pwsh|powershell|eval|source|xargs|iex|invoke-expression)\b/i;

/** Empties the quoted text of a command that only prints or searches it, unless it runs something. */
function withoutQuotedText(segment) {
  if (!TEXT_COMMANDS.test(segment.text)) return segment.text;
  let out = segment.text;
  for (const q of segment.quoted) {
    if (!/\$\(|`/.test(q)) out = out.replace(q, '');
  }
  return out;
}

/** Returns the label of the first destructive rule the command matches, or null. */
export function findDestructive(command, { powershell = false } = {}, depth = 0) {
  if (typeof command !== 'string') return null;
  const runsText = PIPE_TO_SHELL.test(command);
  // Flags only count inside the same simple command, so split on shell separators first.
  for (const segment of scan(command, powershell)) {
    const text = runsText ? segment.text : withoutQuotedText(segment);
    for (const [label, matches] of RULES) {
      if (matches(text, powershell)) return label;
    }
    // A quoted string may be a script that runs (bash -c "...", eval '...', ssh host "..."): check it on its own.
    if (depth < 3 && (runsText || !TEXT_COMMANDS.test(segment.text))) {
      for (const q of segment.quoted) {
        const label = findDestructive(q, { powershell }, depth + 1);
        if (label) return label;
      }
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
