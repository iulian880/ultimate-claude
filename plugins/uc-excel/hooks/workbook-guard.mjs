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
// A quoted path inside an inline script can contain spaces: "livrabile/Robot SAP v3.xlsm".
const QUOTED = /["']([^"'\n]*\.(?:xlsm|xlsb|xlam))["']/gi;
const INTERPRETER = /^(?:python[\d.]*|node|bash|sh|zsh|pwsh|powershell|ruby|perl)(?:\.exe)?$/i;
const SEPARATORS = new Set([';', '&&', '||', '|', '&', '\n']);
const REDIRECTS = new Set(['>', '>>', '>|', '&>']);
// Commands that only read the workbooks they name (unzip extracts elsewhere and never changes the archive).
const READ_ONLY = new Set(['ls', 'zipinfo', 'unzip', 'shasum', 'md5', 'md5sum', 'sha1sum', 'sha256sum', 'cmp', 'diff',
  'file', 'stat', 'cat', 'head', 'tail', 'xxd', 'hexdump', 'strings', 'wc', 'olevba', 'oleid', 'olemeta']);
// git subcommands that do not change files in the working tree (checkout, restore, reset, mv, rm do).
const GIT_READ_ONLY = new Set(['add', 'diff', 'log', 'show', 'status', 'ls-files', 'blame', 'commit']);
const BASH_DQ_ESCAPES = new Set(['"', '\\', '$', '`', '\n']);
const NO_SESSION_START_MS = 12 * 60 * 60 * 1000;

/** Project tools that only read the workbooks they name, from env UC_EXCEL_READ_ONLY ("unocheck.py, mytool"). */
export function readOnlyTools(env = process.env) {
  return (env.UC_EXCEL_READ_ONLY ?? '').split(/[,;]/).map((t) => t.trim()).filter(Boolean);
}

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

const COPY_ITEM = new Set(['copy-item', 'copy', 'cpi']);

/** A copy writes only its destination: the file itself, or each workbook source's name inside a destination folder. */
function copyTargets(sources, dest) {
  if (WORKBOOK.test(dest)) return [dest];
  return workbooks(sources).map((src) => {
    const base = path.basename(src.replace(/\\/g, '/'));
    if (/[\\/]$/.test(dest)) return dest + base;
    return dest.includes('\\') ? `${dest}\\${base}` : path.join(dest, base);
  });
}

const isAbsolutePath = (p) => path.isAbsolute(p) || /^[A-Za-z]:[\\/]|^\\\\/.test(p);
const workbooks = (list) => list.filter((w) => WORKBOOK.test(w));

// under(dir, pattern) builds a recursive target: every file below dir whose name matches (see expand).
const under = (dir, pattern = '*') => {
  const trimmed = dir.replace(/[\\/]+$/, '');
  return `${trimmed || (dir ? dir[0] : '.')}/**/${pattern}`;
};
// A -name pattern can match a workbook only if it ends in a wildcard or in a workbook extension.
const canBeWorkbook = (pattern) => /[*?\]]$/.test(pattern) || WORKBOOK.test(pattern);

/** find writes only with -delete or -exec/-execdir: then every match under its start folders is a target. */
function findTargets(args) {
  if (!args.some((a) => ['-delete', '-exec', '-execdir', '-ok', '-okdir'].includes(a))) return [];
  const first = args.findIndex((a) => a.startsWith('-') || a === '(' || a === '!');
  const roots = (first === -1 ? args : args.slice(0, first));
  const patterns = args.flatMap((a, i) => (['-name', '-iname'].includes(a) && args[i + 1] ? [args[i + 1]] : []));
  const reachable = patterns.length ? patterns.filter(canBeWorkbook) : ['*'];
  return (roots.length ? roots : ['.']).flatMap((r) => reachable.map((p) => under(r, p)));
}

/** Returns {cd} for a `cd` segment, otherwise {targets} written by the segment (paths as written). */
function segmentTargets(seg, readOnly = []) {
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
  if (READ_ONLY.has(cmd) || readOnly.includes(cmd)) return { targets: redirected };
  if (INTERPRETER.test(cmd) && !args.some((a) => /^-(c|e|command)$/i.test(a))) {
    const script = args.find((a) => !a.startsWith('-'));
    if (script && readOnly.includes(path.basename(script.replace(/\\/g, '/')))) return { targets: redirected };
  }
  if (cmd === 'find') return { targets: [...findTargets(args), ...redirected] };
  const gitSub = cmd === 'git' ? args.find((a) => !a.startsWith('-')) : null;
  if (cmd === 'git' && GIT_READ_ONLY.has(gitSub)) return { targets: redirected };
  if (gitSub === 'checkout' || gitSub === 'restore') {
    // A path that is not a workbook may be a folder: the workbooks inside it are restored too.
    const paths = args.slice(args.indexOf(gitSub) + 1).filter((a) => !a.startsWith('-'));
    return { targets: [...workbooks(paths), ...paths.filter((a) => !WORKBOOK.test(a)).map((a) => under(a)), ...redirected] };
  }
  if (cmd === 'cp' || cmd === 'rsync') {
    const operands = args.filter((a) => !a.startsWith('-'));
    return { targets: [...copyTargets(operands.slice(0, -1), operands.at(-1) ?? ''), ...redirected] };
  }
  if (COPY_ITEM.has(cmd.toLowerCase())) {
    // PowerShell Copy-Item: the source is only read; -Destination (or the second positional argument) is written.
    const sources = [];
    const positional = [];
    let dest = null;
    for (let i = 0; i < args.length; i++) {
      if (/^-(destination|dest)$/i.test(args[i])) dest = args[++i] ?? '';
      else if (/^-(path|literalpath|lp|pspath)$/i.test(args[i])) sources.push(...(args[++i] ?? '').split(','));
      else if (!args[i].startsWith('-')) positional.push(args[i]);
    }
    if (sources.length === 0 && positional.length) sources.push(positional.shift());
    if (dest === null) dest = positional.shift() ?? '';
    return { targets: [...copyTargets(sources, dest), ...redirected] };
  }
  const embedded = args.filter((a) => !WORKBOOK.test(a))
    .flatMap((a) => [...(a.match(EMBEDDED) ?? []), ...[...a.matchAll(QUOTED)].map((m) => m[1])]);
  return { targets: [...workbooks(args), ...embedded, ...redirected] };
}

/** Workbook paths that this tool call may write, relative to the call's cwd (after any `cd`). */
export function workbookTargets(toolName, toolInput = {}, { readOnly = readOnlyTools() } = {}) {
  if (['Write', 'Edit', 'NotebookEdit', 'MultiEdit'].includes(toolName)) {
    const p = toolInput.file_path ?? toolInput.notebook_path;
    return typeof p === 'string' && WORKBOOK.test(p) ? [p] : [];
  }
  const command = toolInput.command;
  if (typeof command !== 'string') return [];
  let dir = '';
  const out = [];
  for (const seg of segments(tokenize(command, { powershell: toolName === 'PowerShell' }))) {
    const r = segmentTargets(seg, readOnly);
    if ('cd' in r) {
      dir = isAbsolutePath(r.cd) ? r.cd : path.join(dir, r.cd);
      continue;
    }
    for (const t of r.targets) out.push(isAbsolutePath(t) || dir === '' ? t : path.join(dir, t));
  }
  return [...new Set(out)];
}

const globRe = (pattern) =>
  new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i');

const WALK_LIMIT = 100000;

/**
 * Files under dir whose name matches re, skipping git and dependency folders. Symlinks are not followed. Past
 * WALK_LIMIT entries it throws: the hook then blocks in STRICT and warns elsewhere instead of guessing.
 */
function walk(dir, re, seen = { n: 0 }, depth = 0) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  seen.n += entries.length;
  if (seen.n > WALK_LIMIT) throw new Error(`more than ${WALK_LIMIT} files under the search folder`);
  return entries.flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      return depth < 20 && !['.git', 'node_modules', '.venv'].includes(e.name) ? walk(full, re, seen, depth + 1) : [];
    }
    return re.test(e.name) && WORKBOOK.test(e.name) ? [full] : [];
  });
}

/**
 * Expands a target against the disk: `<dir>/**\/<pattern>` to every matching file under dir, a `*` or `?` in the
 * file name to the matching files in that folder; other paths are returned as they are.
 */
function expand(target, cwd) {
  const recursive = target.split(/[\\/]\*\*[\\/]/);
  if (recursive.length === 2) {
    return walk(path.resolve(cwd, recursive[0]), globRe(recursive[1]));
  }
  if (!/[*?]/.test(path.basename(target))) return [path.resolve(cwd, target)];
  const dir = path.resolve(cwd, path.dirname(target));
  const re = globRe(path.basename(target));
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
  try {
    return evaluate(input);
  } catch (err) {
    // Fail closed in STRICT: an error here must not let a workbook write through unchecked.
    let strict = false;
    try {
      strict = resolveProfile({ sessionId: input?.session_id }) === 'strict';
    } catch {
      strict = process.env.UC_PROFILE?.trim().toLowerCase() === 'strict';
    }
    const reason = `uc-excel workbook-guard could not check this call (${err?.message ?? err}).`;
    if (strict) return { exit: 2, stderr: `${reason} Back up the workbook to backups/ and retry, or ask the user.` };
    return { exit: 0, stdout: JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: reason } }) };
  }
}

function evaluate(input) {
  if (input === null) return { exit: 0 };
  const targets = workbookTargets(input.tool_name, input.tool_input);
  if (targets.length === 0) return { exit: 0 };
  const cwd = typeof input.cwd === 'string' ? input.cwd : process.cwd();
  const projectDir = process.env.CLAUDE_PROJECT_DIR || cwd;
  const { startedAt } = readSession(input.session_id);
  const backupDirs = [path.join(projectDir, 'backups') + path.sep, path.join(cwd, 'backups') + path.sep];
  // Nothing to lose: the backup copy itself, and a workbook that does not exist yet.
  const atRisk = targets.flatMap((t) => expand(t, cwd))
    .filter((full) => WORKBOOK.test(full) && !backupDirs.some((b) => full.startsWith(b)) && fs.existsSync(full));
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
