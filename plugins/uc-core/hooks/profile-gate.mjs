#!/usr/bin/env node
// Stop hook: in the STRICT profile, blocks once when files changed after the last PASS verification.
// The second stop passes, so there is never a loop. Does nothing in MINIMAL and STANDARD.
import { isMain, runHook } from './lib/hook-io.mjs';
import { readSession, resolveProfile, updateSession } from './lib/state.mjs';
import { latestPassAt as findLatestPassAt } from './lib/verification.mjs';

const time = (iso) => (typeof iso === 'string' ? Date.parse(iso) : NaN);

export function shouldBlock({ profile, lastEditAt, latestPassAt, stopHookActive, gateBlockedAt }) {
  if (profile !== 'strict' || stopHookActive) return false;
  const edit = time(lastEditAt);
  if (Number.isNaN(edit)) return false;
  if (time(gateBlockedAt) >= edit) return false;
  const pass = time(latestPassAt);
  return Number.isNaN(pass) || pass < edit;
}

export function handle(input) {
  if (input === null) return { exit: 0 };
  const session = readSession(input.session_id);
  const block = shouldBlock({
    profile: resolveProfile({ sessionId: input.session_id }),
    lastEditAt: session.lastEditAt,
    latestPassAt: typeof input.cwd === 'string' ? findLatestPassAt(input.cwd) : null,
    stopHookActive: input.stop_hook_active === true,
    gateBlockedAt: session.gateBlockedAt,
  });
  if (!block) return { exit: 0 };
  updateSession(input.session_id, { gateBlockedAt: new Date().toISOString() });
  return {
    exit: 2,
    stderr: 'STRICT profile: files changed after the last PASS verification. Run the release-gate agent, or state in the delivery report what remains unverified.',
  };
}

if (isMain(import.meta.url)) await runHook(handle);
