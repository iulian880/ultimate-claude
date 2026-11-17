// Reads the verification proofs written by the release-gate agent.
// Schema: {"verdict": "PASS"|"FAIL", "at": "<ISO 8601>", "checks": [{command, exitCode, summary}],
//          "criteria": [{criterion, status: "VERIFIED"|"FAILED"|"NOT PERFORMED", checks: [index]}], "unverified": [string],
//          "treeBefore": "<fingerprint before the first check>", "tree": "<fingerprint after the last check>"}
// latestPassAt (non-git projects) reads `verdict` and `at`. passingTrees (git projects) requires a complete proof:
// `tree` equal to `treeBefore` (the checks did not change the code), at least one check and every exitCode 0, at least
// one criterion and every criterion VERIFIED, and an empty `unverified` list.
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

const nonEmpty = (list) => Array.isArray(list) && list.length > 0;

/** True for a PASS proof with nothing missing, failed or left unverified, taken on code the checks did not change. */
function isCompletePass(p) {
  return p?.verdict === 'PASS'
    && typeof p.tree === 'string' && p.tree !== '' && p.treeBefore === p.tree
    && nonEmpty(p.checks) && p.checks.every((c) => c?.exitCode === 0)
    && nonEmpty(p.criteria) && p.criteria.every((c) => c?.status === 'VERIFIED')
    && Array.isArray(p.unverified) && p.unverified.length === 0;
}

/** The code states (trees) that a complete PASS proof vouches for. */
export function passingTrees(projectDir) {
  return new Set(readProofs(projectDir).filter(isCompletePass).map((p) => p.tree));
}
