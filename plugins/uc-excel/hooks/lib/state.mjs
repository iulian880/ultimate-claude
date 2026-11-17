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

/** Merges `patch` into the session file, creating directories as needed. */
export function updateSession(sessionId, patch, env = process.env) {
  const file = sessionFile(sessionId, env);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const next = { ...readSession(sessionId, env), ...patch };
  fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
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
