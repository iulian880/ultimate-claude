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
import { latestPassAt as findLatestPassAt, passingTrees } from './lib/verification.mjs';
import { repoRoot, treeFingerprint } from './lib/fingerprint.mjs';

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

/** Working trees to check: the main checkout, the one Claude is in now, and those the session worked in before. */
function treesToCheck(mainRoot, cwd, seen) {
  const roots = [mainRoot, repoRoot(cwd), ...(Array.isArray(seen) ? seen : [])];
  return [...new Set(roots.filter((r) => typeof r === 'string' && fs.existsSync(r)))];
}

/** Proofs may sit in the project folder of any checked tree (monorepo package) or at its root. */
function passTreesFor(roots, mainRoot, dir) {
  const rel = path.relative(mainRoot, dir);
  const trees = new Set();
  for (const folder of new Set(roots.flatMap((r) => [path.join(r, rel), r]))) {
    for (const t of passingTrees(folder)) trees.add(t);
  }
  return trees;
}

function handleTree(input, session, profile, dir, mainRoot, mainTree) {
  const roots = treesToCheck(mainRoot, input.cwd, session.worktrees);
  const passTrees = passTreesFor(roots, mainRoot, dir);
  const blocked = session.gateBlocked && typeof session.gateBlocked === 'object' ? session.gateBlocked : {};
  const blocking = {};
  for (const root of roots) {
    const currentTree = root === mainRoot ? mainTree : treeFingerprint(root);
    const block = shouldBlockTree({
      profile, stopHookActive: input.stop_hook_active === true, startTree: session.startTree, currentTree, passTrees,
      blockedTree: blocked[root],
    });
    if (block) blocking[root] = currentTree;
  }
  const worktrees = roots.filter((r) => r !== mainRoot);
  const patch = { worktrees };
  const names = Object.keys(blocking);
  if (names.length > 0) Object.assign(patch, { gateBlocked: { ...blocked, ...blocking }, gateBlockedAt: new Date().toISOString() });
  updateSession(input.session_id, patch);
  if (names.length === 0) return { exit: 0 };
  const where = names.filter((r) => r !== mainRoot);
  return { exit: 2, stderr: where.length ? `${TREE_MESSAGE} Changed worktree: ${where.join(', ')}` : TREE_MESSAGE };
}

export function handle(input) {
  if (input === null) return { exit: 0 };
  const session = readSession(input.session_id);
  const profile = resolveProfile({ sessionId: input.session_id });
  const dir = projectDir(input);
  if (profile === 'strict' && session.startTree && dir) {
    const mainRoot = repoRoot(dir);
    const mainTree = mainRoot ? treeFingerprint(mainRoot) : null;
    if (mainTree) return handleTree(input, session, profile, dir, mainRoot, mainTree);
  }
  const block = shouldBlock({
    profile,
    lastEditAt: session.lastEditAt,
    latestPassAt: dir ? findLatestPassAt(dir) : null,
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
