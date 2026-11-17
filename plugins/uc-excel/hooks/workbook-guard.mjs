#!/usr/bin/env node
// PreToolUse hook (Write|Edit|NotebookEdit|Bash|PowerShell): a write to an Excel workbook needs a backup in
// backups/ made during this session. STRICT blocks; MINIMAL and STANDARD tell Claude without blocking.
// Backup name: backups/<base>.<YYYYMMDD-HHMMSS><ext>. lib/ is a byte-identical copy of uc-core's hooks/lib.
import fs from 'node:fs';
import path from 'node:path';
import { isMain, runHook } from './lib/hook-io.mjs';
import { readSession, resolveProfile } from './lib/state.mjs';

const WORKBOOK = /\.(xlsm|xlsb|xlam)$/i;
const SEPARATORS = new Set([';', '&&', '||', '|', '\n']);
const READ_ONLY = new Set(['ls', 'zipinfo', 'shasum', 'md5', 'md5sum', 'sha1sum', 'sha256sum', 'cmp', 'diff', 'file', 'stat']);
const UNZIP_READ = /^-[a-zA-Z]*[lpvtZ]/;
const NO_SESSION_START_MS = 12 * 60 * 60 * 1000;

/** Splits a shell command into words and operators, keeping quoted text (spaces included) inside one word. */
export function tokenize(command) {
  const tokens = [];
  let word = null;
  let quote = null;
  const push = () => { if (word !== null) tokens.push(word); word = null; };
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === '\\' && quote === '"' && i + 1 < command.length) word += command[++i];
      else word += c;
    } else if (c === '"' || c === "'") {
      quote = c; word = word ?? '';
    } else if (c === '\\' && i + 1 < command.length) {
      word = (word ?? '') + command[++i];
    } else if (c === '\n' || c === ';') {
      push(); tokens.push(c);
    } else if (c === '&' || c === '|' || c === '>') {
      push();
      const two = command.slice(i, i + 2);
      if (two === '&&' || two === '||' || two === '>>') { tokens.push(two); i++; } else tokens.push(c);
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

function segmentTargets(seg) {
  const redirects = [];
  const words = [];
  for (let i = 0; i < seg.length; i++) {
    if ((seg[i] === '>' || seg[i] === '>>') && i + 1 < seg.length) redirects.push(seg[++i]);
    else if (seg[i] !== '&' && seg[i] !== '>' && seg[i] !== '>>') words.push(seg[i]);
  }
  let start = 0;
  while (start < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[start])) start++;
  if (words[start] === 'sudo') start++;
  const cmd = path.basename(words[start] ?? '');
  const args = words.slice(start + 1);
  const workbooks = (list) => list.filter((w) => WORKBOOK.test(w));
  const redirected = workbooks(redirects);
  if (READ_ONLY.has(cmd)) return redirected;
  if (cmd === 'unzip' && args.some((a) => UNZIP_READ.test(a))) return redirected;
  if (cmd === 'cp' || cmd === 'rsync') {
    const operands = args.filter((a) => !a.startsWith('-'));
    return [...workbooks(operands.slice(-1)), ...redirected];
  }
  return [...workbooks(args), ...redirected];
}

/** Workbook paths that this tool call may write. */
export function workbookTargets(toolName, toolInput = {}) {
  if (['Write', 'Edit', 'NotebookEdit', 'MultiEdit'].includes(toolName)) {
    const p = toolInput.file_path ?? toolInput.notebook_path;
    return typeof p === 'string' && WORKBOOK.test(p) ? [p] : [];
  }
  const command = toolInput.command;
  if (typeof command !== 'string') return [];
  return [...new Set(segments(tokenize(command)).flatMap(segmentTargets))];
}

/** True when backups/ holds <base>.<YYYYMMDD-HHMMSS><ext> modified at or after the session start. */
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
      return fs.statSync(path.join(dir, name)).mtimeMs >= since;
    } catch {
      return false;
    }
  });
}

export function handle(input) {
  if (input === null) return { exit: 0 };
  const targets = workbookTargets(input.tool_name, input.tool_input);
  if (targets.length === 0) return { exit: 0 };
  const projectDir = typeof input.cwd === 'string' ? input.cwd : process.cwd();
  const { startedAt } = readSession(input.session_id);
  const backups = path.join(projectDir, 'backups') + path.sep;
  // Nothing to lose: the backup copy itself, and a workbook that does not exist yet.
  const atRisk = targets.filter((t) => {
    const full = path.resolve(projectDir, t);
    return !full.startsWith(backups) && fs.existsSync(full);
  });
  const missing = atRisk.filter((t) => !hasFreshBackup(t, projectDir, startedAt)).map((t) => path.basename(t));
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
