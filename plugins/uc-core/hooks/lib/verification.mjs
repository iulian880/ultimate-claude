// Reads the verification proofs written by the release-gate agent.
// Schema: {"verdict": "PASS"|"FAIL", "at": "<ISO 8601>", "checks": [{command, exitCode, summary}],
//          "criteria": [{criterion, status: "VERIFIED"|"FAILED"|"NOT PERFORMED", checks: [index]}], "unverified": [string],
//          "tree": "<working-tree fingerprint, hooks/fingerprint.mjs>"}
// latestPassAt (non-git projects) reads `verdict` and `at`. passingTrees (git projects) also requires `tree`, at least
// one check with every exitCode 0, and every criterion VERIFIED.
import fs from 'node:fs';
import path from 'node:path';

/** Returns the `at` of the newest PASS in <projectDir>/.uc/verification/*.json, or null. */
export function latestPassAt(projectDir) {
  const dir = path.join(projectDir, '.uc', 'verification');
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return null;
  }
  let newest = null;
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    let proof;
    try {
      proof = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
    } catch {
      continue;
    }
    if (proof?.verdict !== 'PASS' || typeof proof.at !== 'string') continue;
    const time = Date.parse(proof.at);
    if (Number.isNaN(time)) continue;
    if (newest === null || time > Date.parse(newest)) newest = proof.at;
  }
  return newest;
}

function readProofs(projectDir) {
  const dir = path.join(projectDir, '.uc', 'verification');
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return names.filter((n) => n.endsWith('.json')).flatMap((n) => {
    try {
      return [JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8'))];
    } catch {
      return [];
    }
  });
}

/** Trees that a valid PASS proof vouches for: verdict PASS, a tree, passing checks, every criterion VERIFIED. */
export function passingTrees(projectDir) {
  const trees = new Set();
  for (const p of readProofs(projectDir)) {
    if (p?.verdict !== 'PASS' || typeof p.tree !== 'string' || !p.tree) continue;
    if (!Array.isArray(p.checks) || p.checks.length === 0 || !p.checks.every((c) => c?.exitCode === 0)) continue;
    if (p.criteria !== undefined && !(Array.isArray(p.criteria) && p.criteria.every((c) => c?.status === 'VERIFIED'))) continue;
    trees.add(p.tree);
  }
  return trees;
}
