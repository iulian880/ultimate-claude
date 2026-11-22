// Per-session state and profile resolution for uc-core hooks.
// State lives in <CLAUDE_CONFIG_DIR or ~/.claude>/uc/sessions/<session_id>.json.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const PROFILES = ['minimal', 'standard', 'strict'];
export const DEFAULT_PROFILE = 'standard';

export function configBase(env = process.env) {
  return env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

/** Keeps only [A-Za-z0-9_-] so the id can never leave the sessions directory. */
export function safeSessionId(id) {
  const cleaned = (typeof id === 'string' ? id : '').replace(/[^A-Za-z0-9_-]/g, '');
  return cleaned || 'unknown';
}

function sessionFile(sessionId, env) {
  return path.join(configBase(env), 'uc', 'sessions', `${safeSessionId(sessionId)}.json`);
}

/** Returns the stored session object, or {} when the file is missing or malformed. */
export function readSession(sessionId, env = process.env) {
  try {
    const value = JSON.parse(fs.readFileSync(sessionFile(sessionId, env), 'utf8'));
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

/**
 * Merges `patch` into the session file, creating directories as needed. Writes a temporary file and renames it over
 * the old one, so a hook reading at the same moment sees either the old or the new content, never half of it.
 */
export function updateSession(sessionId, patch, env = process.env) {
  const file = sessionFile(sessionId, env);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Acquire before reading; rename alone cannot prevent two writers losing updates.
  const lock = file + '.lock';
  const pause = new Int32Array(new SharedArrayBuffer(4));
  const deadline = Date.now() + 5000;
  for (;;) {
    try {
      fs.mkdirSync(lock);
      break;
    } catch (error) {
      if (error.code !== 'EEXIST' || Date.now() >= deadline) throw error;
      Atomics.wait(pause, 0, 0, 10);
    }
  }
  const temp = file + '.' + process.pid + '.tmp';
  try {
    const current = readSession(sessionId, env);
    const next = { ...current, ...patch };
    if (patch.worktrees) next.worktrees = [...new Set([...(current.worktrees ?? []), ...patch.worktrees])];
    if (patch.startContracts) next.startContracts = { ...patch.startContracts, ...current.startContracts };
    if (patch.starts) next.starts = { ...patch.starts, ...current.starts };
    if (patch.gateBlocked) next.gateBlocked = { ...current.gateBlocked, ...patch.gateBlocked };
    for (const key of ['startedAt', 'startTree', 'startContract', 'startWorktrees']) {
      if (current[key] != null) next[key] = current[key];
    }
    for (const key of ['lastEditAt', 'gateBlockedAt']) {
      if (Date.parse(current[key]) > Date.parse(next[key])) next[key] = current[key];
    }
    fs.writeFileSync(temp, JSON.stringify(next, null, 2) + '\n');
    for (;;) {
      try {
        fs.renameSync(temp, file);
        break;
      } catch (error) {
        if (!['EBUSY', 'EPERM', 'EACCES'].includes(error.code) || Date.now() >= deadline) throw error;
        Atomics.wait(pause, 0, 0, 10);
      }
    }
  } finally {
    fs.rmSync(temp, { force: true });
    fs.rmdirSync(lock);
  }
}

function normalizeProfile(value) {
  if (typeof value !== 'string') return null;
  const name = value.trim().toLowerCase();
  return PROFILES.includes(name) ? name : null;
}

/** Order: session file `profile`, then env.UC_PROFILE, then "standard". Unknown values are ignored. */
export function resolveProfile({ sessionId, env = process.env }) {
  return normalizeProfile(readSession(sessionId, env).profile)
    ?? normalizeProfile(env.UC_PROFILE)
    ?? DEFAULT_PROFILE;
}

/** The project root: CLAUDE_PROJECT_DIR, which stays put when Claude cd-s into a subfolder, else the hook's cwd. */
export function projectDir(input, env = process.env) {
  if (env.CLAUDE_PROJECT_DIR) return env.CLAUDE_PROJECT_DIR;
  return typeof input?.cwd === 'string' ? input.cwd : null;
}
