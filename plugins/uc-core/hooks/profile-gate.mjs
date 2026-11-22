#!/usr/bin/env node
// Stop hook: in the STRICT profile, blocks once when the code changed without a matching PASS verification.
// Git projects: compares the working-tree fingerprint with the one recorded when STRICT started, so edits made
// through Bash, scripts or other tools count, and only a PASS proof for exactly the current tree lets it stop.
// It checks the main checkout and every worktree this session worked in (Superpowers executes plans in one).
// Other projects: falls back to the last Edit/Write time against the newest PASS. One block per state, so never a
// loop. Does nothing in MINIMAL and STANDARD.
import fs from 'node:fs';
import path from 'node:path';
import { isMain, runHook } from './lib/hook-io.mjs';
import { projectDir, readSession, resolveProfile, updateSession } from './lib/state.mjs';
import { latestPassAt as findLatestPassAt, passingTrees, contractState } from './lib/verification.mjs';
import { commonDir, repoRoot, treeFingerprint } from './lib/fingerprint.mjs';

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

/**
 * Working trees to check: the main checkout, the one Claude is in now, and those the session worked in before -
 * only worktrees of this repository, never another repository Claude happened to visit.
 */
function treesToCheck(mainRoot, cwd, seen) {
  const repo = commonDir(mainRoot);
  const roots = [...new Set([mainRoot, repoRoot(cwd), ...(Array.isArray(seen) ? seen : [])])];
  return roots.filter((r) => typeof r === 'string' && fs.existsSync(r) && (r === mainRoot || commonDir(r) === repo));
}

function handleTree(input, session, profile, dir, mainRoot, mainTree) {
  const roots = treesToCheck(mainRoot, input.cwd, session.worktrees);
  const relativeProject = path.relative(mainRoot, fs.realpathSync(dir));
  const blocked = session.gateBlocked && typeof session.gateBlocked === 'object' ? session.gateBlocked : {};
  const startContracts = { ...session.startContracts };
  const starts = { ...(session.starts && typeof session.starts === 'object' ? session.starts : {}) };
  // A worktree created during the session starts from the main checkout's state; one that already existed starts
  // from the state the session first found it in.
  const existed = (root) => !Array.isArray(session.startWorktrees) || session.startWorktrees.includes(root);
  const blocking = {};
  for (const root of roots) {
    const currentTree = root === mainRoot ? mainTree : treeFingerprint(root);
    const folder = path.join(root, relativeProject);
    const digest = contractState(folder);
    const passTrees = passingTrees(folder);
    const identity = currentTree + ':' + digest;
    let startTree = root === mainRoot ? session.startTree : starts[root];
    if (!startTree && existed(root)) {
      starts[root] = currentTree;
      startContracts[root] = digest;
      continue;
    }
    startTree ??= session.startTree;
    const initialDigest = startContracts[root] ?? session.startContract;
    if (initialDigest !== undefined && digest !== initialDigest) startTree = 'contract changed';
    const block = shouldBlockTree({
      profile, stopHookActive: input.stop_hook_active === true, startTree, currentTree, passTrees,
      blockedTree: blocked[root] === identity ? currentTree : undefined,
    });
    if (block) blocking[root] = identity;
  }
  const worktrees = roots.filter((r) => r !== mainRoot);
  const patch = { worktrees, starts, startContracts };
  const names = Object.keys(blocking);
  if (names.length > 0) Object.assign(patch, { gateBlocked: blocking, gateBlockedAt: new Date().toISOString() });
  updateSession(input.session_id, patch);
  if (names.length === 0) return { exit: 0 };
  const where = names.filter((r) => r !== mainRoot);
  return { exit: 2, stderr: where.length ? `${TREE_MESSAGE} Changed worktree: ${where.join(', ')}` : TREE_MESSAGE };
}

export function handle(input) {
  if (input === null) return { exit: 0 };
  const profile = resolveProfile({ sessionId: input.session_id });
  if (profile !== 'strict' || input.stop_hook_active === true) return { exit: 0 };
  const session = readSession(input.session_id);
  const dir = projectDir(input);
  if (session.startTree && dir) {
    const mainRoot = repoRoot(dir);
    const mainTree = mainRoot ? treeFingerprint(mainRoot) : null;
    if (mainTree) return handleTree(input, session, profile, dir, mainRoot, mainTree);
  }
  const digest = dir ? contractState(dir) : 'missing';
  const contractChanged = session.startContract !== undefined && session.startContract !== digest;
  const latestPassAt = dir ? findLatestPassAt(dir) : null;
  const block = shouldBlock({
    profile,
    lastEditAt: session.lastEditAt,
    latestPassAt,
    stopHookActive: input.stop_hook_active === true,
    gateBlockedAt: session.gateBlockedAt,
  });
  const contractNeedsProof = contractChanged && session.blockedContract !== digest && !latestPassAt;
  if (!block && !contractNeedsProof) return { exit: 0 };
  updateSession(input.session_id, { blockedContract: digest, gateBlockedAt: new Date().toISOString() });
  return {
    exit: 2,
    stderr: 'STRICT profile: files changed after the last PASS verification. Run the release-gate agent, or state in the delivery report what remains unverified.',
  };
}

if (isMain(import.meta.url)) await runHook(handle);
