#!/usr/bin/env node
// PreToolUse hook (Write|Edit|NotebookEdit|Bash|PowerShell): a write to an Excel workbook needs a backup in
// backups/ made during this session. STRICT blocks; MINIMAL and STANDARD tell Claude without blocking.
// Backup name: backups/<base>.<YYYYMMDD-HHMMSS><ext>. lib/ is a byte-identical copy of uc-core's hooks/lib.
import fs from 'node:fs';
import path from 'node:path';
import { isMain, runHook } from './lib/hook-io.mjs';
import { readSession, resolveProfile } from './lib/state.mjs';

const WORKBOOK = /\.(xlsm|xlsb|xlam)$/i;
const EMBEDDED = /[^\s'"(),=;]+\.(?:xlsm|xlsb|xlam)\b/gi;
const SEPARATORS = new Set([';', '&&', '||', '|', '&', '\n']);
const REDIRECTS = new Set(['>', '>>', '>|', '&>']);
// Commands that only read the workbooks they name (unzip extracts elsewhere and never changes the archive).
const READ_ONLY = new Set(['ls', 'zipinfo', 'unzip', 'shasum', 'md5', 'md5sum', 'sha1sum', 'sha256sum', 'cmp', 'diff',
  'file', 'stat', 'cat', 'head', 'tail', 'xxd', 'hexdump', 'strings', 'wc', 'olevba', 'oleid', 'olemeta']);
// git subcommands that do not change files in the working tree (checkout, restore, reset, mv, rm do).
const GIT_READ_ONLY = new Set(['add', 'diff', 'log', 'show', 'status', 'ls-files', 'blame', 'commit']);
const BASH_DQ_ESCAPES = new Set(['"', '\\', '$', '`', '\n']);
const NO_SESSION_START_MS = 12 * 60 * 60 * 1000;

/**
 * Splits a shell command into words and operators, keeping quoted text (spaces included) inside one word.
 * Bash: a backslash escapes the next character outside quotes, and only " \ $ ` newline inside double quotes.
 * PowerShell: a backslash is a path separator and is always kept.
 */
export function tokenize(command, { powershell = false } = {}) {
  const tokens = [];
  let word = null;
  let quote = null;
  const push = () => { if (word !== null) tokens.push(word); word = null; };
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    const next = command[i + 1];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === '\\' && quote === '"' && !powershell && BASH_DQ_ESCAPES.has(next)) word += command[++i];
      else word += c;
    } else if (c === '"' || c === "'") {
      quote = c; word = word ?? '';
    } else if (c === '\\' && !powershell && next !== undefined) {
      word = (word ?? '') + command[++i];
    } else if (c === '\n' || c === ';') {
      push(); tokens.push(c);
    } else if (c === '&' || c === '|' || c === '>') {
      push();
      const two = c + (next ?? '');
      if (['&&', '||', '>>', '>|', '&>', '>&'].includes(two)) { tokens.push(two); i++; } else tokens.push(c);
    } else if (/\s/.test(c)) {
      push();
    } else {
      word = (word ?? '') + c;
    }
  }
  push();
  return tokens;
}

function segments(tokens) {
  const out = [[]];
  for (const t of tokens) (SEPARATORS.has(t) ? out.push([]) : out.at(-1).push(t));
  return out.filter((s) => s.length);
}

const isAbsolutePath = (p) => path.isAbsolute(p) || /^[A-Za-z]:[\\/]|^\\\\/.test(p);
const workbooks = (list) => list.filter((w) => WORKBOOK.test(w));

/** Returns {cd} for a `cd` segment, otherwise {targets} written by the segment (paths as written). */
function segmentTargets(seg) {
  const redirects = [];
  const words = [];
  for (let i = 0; i < seg.length; i++) {
    if (REDIRECTS.has(seg[i]) && i + 1 < seg.length) redirects.push(seg[++i]);
    else if (seg[i] === '>&') i++; // fd duplication such as 2>&1: no file
    else words.push(seg[i]);
  }
  let start = 0;
  while (start < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[start])) start++;
  if (words[start] === 'sudo') start++;
  const cmd = path.basename(words[start] ?? '');
  const args = words.slice(start + 1);
  if (cmd === 'cd') return { cd: args.find((a) => !a.startsWith('-')) ?? '' };
  const redirected = workbooks(redirects);
  if (READ_ONLY.has(cmd)) return { targets: redirected };
  if (cmd === 'git' && GIT_READ_ONLY.has(args.find((a) => !a.startsWith('-')))) return { targets: redirected };
  if (cmd === 'cp' || cmd === 'rsync') {
    const operands = args.filter((a) => !a.startsWith('-'));
    const dest = operands.at(-1) ?? '';
    if (WORKBOOK.test(dest)) return { targets: [dest, ...redirected] };
    // Destination is a directory: each workbook source lands there under its own name.
    const into = workbooks(operands.slice(0, -1)).map((src) => path.join(dest, path.basename(src.replace(/\\/g, '/'))));
    return { targets: [...into, ...redirected] };
  }
  const embedded = args.filter((a) => !WORKBOOK.test(a)).flatMap((a) => a.match(EMBEDDED) ?? []);
  return { targets: [...workbooks(args), ...embedded, ...redirected] };
}

/** Workbook paths that this tool call may write, relative to the call's cwd (after any `cd`). */
export function workbookTargets(toolName, toolInput = {}) {
  if (['Write', 'Edit', 'NotebookEdit', 'MultiEdit'].includes(toolName)) {
    const p = toolInput.file_path ?? toolInput.notebook_path;
    return typeof p === 'string' && WORKBOOK.test(p) ? [p] : [];
  }
  const command = toolInput.command;
  if (typeof command !== 'string') return [];
  let dir = '';
  const out = [];
  for (const seg of segments(tokenize(command, { powershell: toolName === 'PowerShell' }))) {
    const r = segmentTargets(seg);
    if ('cd' in r) {
      dir = isAbsolutePath(r.cd) ? r.cd : path.join(dir, r.cd);
      continue;
    }
    for (const t of r.targets) out.push(isAbsolutePath(t) || dir === '' ? t : path.join(dir, t));
  }
  return [...new Set(out)];
}

/** Expands a `*` or `?` pattern in the file name part against the disk; other paths are returned as they are. */
function expand(target, cwd) {
  if (!/[*?]/.test(path.basename(target))) return [path.resolve(cwd, target)];
  const dir = path.resolve(cwd, path.dirname(target));
  const re = new RegExp(`^${path.basename(target).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`);
  try {
    return fs.readdirSync(dir).filter((n) => re.test(n)).map((n) => path.join(dir, n));
  } catch {
    return [];
  }
}

/** True when backups/ holds <base>.<YYYYMMDD-HHMMSS><ext> created or modified at or after the session start. */
export function hasFreshBackup(workbook, projectDir, startedAt) {
  const ext = path.extname(workbook);
  const base = path.basename(workbook, ext);
  const since = Number.isNaN(Date.parse(startedAt)) ? Date.now() - NO_SESSION_START_MS : Date.parse(startedAt);
  const dir = path.join(projectDir, 'backups');
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return false;
  }
  const prefix = `${base}.`;
  return names.some((name) => {
    if (!name.startsWith(prefix) || !name.toLowerCase().endsWith(ext.toLowerCase())) return false;
    if (!/^\d{8}-\d{6}$/.test(name.slice(prefix.length, name.length - ext.length))) return false;
    try {
      // ctime marks when the copy appeared; mtime alone misses `cp -p`, which keeps the source's old date.
      const st = fs.statSync(path.join(dir, name));
      return Math.max(st.mtimeMs, st.ctimeMs) >= since;
    } catch {
      return false;
    }
  });
}

export function handle(input) {
  if (input === null) return { exit: 0 };
  const targets = workbookTargets(input.tool_name, input.tool_input);
  if (targets.length === 0) return { exit: 0 };
  const cwd = typeof input.cwd === 'string' ? input.cwd : process.cwd();
  const projectDir = process.env.CLAUDE_PROJECT_DIR || cwd;
  const { startedAt } = readSession(input.session_id);
  const backupDirs = [path.join(projectDir, 'backups') + path.sep, path.join(cwd, 'backups') + path.sep];
  // Nothing to lose: the backup copy itself, and a workbook that does not exist yet.
  const atRisk = targets.flatMap((t) => expand(t, cwd))
    .filter((full) => !backupDirs.some((b) => full.startsWith(b)) && fs.existsSync(full));
  const missing = [...new Set(atRisk.filter((t) => !hasFreshBackup(t, projectDir, startedAt)).map((t) => path.basename(t)))];
  if (missing.length === 0) return { exit: 0 };
  const files = missing.join(', ');
  if (resolveProfile({ sessionId: input.session_id }) === 'strict') {
    return { exit: 2, stderr: `uc-excel workbook-guard: back up ${files} to backups/ first (vba-workflow step 1).` };
  }
  const additionalContext = `uc-excel workbook-guard: there is no backup of ${files} in backups/ made in this session. `
    + 'vba-workflow step 1 makes one before a workbook is written.';
  return { exit: 0, stdout: JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext } }) };
}

if (isMain(import.meta.url)) await runHook(handle);
