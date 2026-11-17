#!/usr/bin/env node
// Stop hook: in the STRICT profile, blocks once when the code changed without a matching PASS verification.
// Git projects: compares the working-tree fingerprint with the one recorded when STRICT started, so edits made
// through Bash, scripts or other tools count, and only a PASS proof for exactly the current tree lets it stop.
// Other projects: falls back to the last Edit/Write time against the newest PASS. One block per state, so never a
// loop. Does nothing in MINIMAL and STANDARD.
import { isMain, runHook } from './lib/hook-io.mjs';
import { readSession, resolveProfile, updateSession } from './lib/state.mjs';
import { latestPassAt as findLatestPassAt, passingTrees } from './lib/verification.mjs';
import { treeFingerprint } from './lib/fingerprint.mjs';

const time = (iso) => (typeof iso === 'string' ? Date.parse(iso) : NaN);

export function shouldBlock({ profile, lastEditAt, latestPassAt, stopHookActive, gateBlockedAt }) {
  if (profile !== 'strict' || stopHookActive) return false;
  const edit = time(lastEditAt);
  if (Number.isNaN(edit)) return false;
  if (time(gateBlockedAt) >= edit) return false;
  const pass = time(latestPassAt);
  return Number.isNaN(pass) || pass < edit;
}

export function shouldBlockTree({ profile, stopHookActive, startTree, currentTree, passTrees, blockedTree }) {
  if (profile !== 'strict' || stopHookActive || !startTree || !currentTree) return false;
  if (currentTree === startTree) return false;
  if (passTrees.has(currentTree)) return false;
  return blockedTree !== currentTree;
}

const TREE_MESSAGE = 'STRICT profile: the code changed in this session and no PASS verification matches it. '
  + 'Run the release-gate agent, or state in the delivery report what remains unverified.';

export function handle(input) {
  if (input === null) return { exit: 0 };
  const session = readSession(input.session_id);
  const profile = resolveProfile({ sessionId: input.session_id });
  if (profile === 'strict' && session.startTree && typeof input.cwd === 'string') {
    const currentTree = treeFingerprint(input.cwd);
    if (currentTree) {
      const block = shouldBlockTree({
        profile, stopHookActive: input.stop_hook_active === true, startTree: session.startTree, currentTree,
        passTrees: passingTrees(input.cwd), blockedTree: session.gateBlockedTree,
      });
      if (!block) return { exit: 0 };
      updateSession(input.session_id, { gateBlockedTree: currentTree, gateBlockedAt: new Date().toISOString() });
      return { exit: 2, stderr: TREE_MESSAGE };
    }
  }
  const block = shouldBlock({
    profile,
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
