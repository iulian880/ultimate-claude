// Reads the verification proofs written by the release-gate agent.
// Schema: {"verdict": "PASS"|"FAIL", "at": "<ISO 8601>", "checks": [{command, exitCode, summary}], "unverified": [string]}
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
