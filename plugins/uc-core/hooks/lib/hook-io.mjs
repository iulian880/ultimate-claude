// Shared stdin / exit-code protocol for uc-core hooks.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

/** True when the module at `moduleUrl` is the script node was started with (not an import). */
export function isMain(moduleUrl) {
  try {
    return moduleUrl === pathToFileURL(fs.realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}

/** Parses hook stdin. Returns null for empty input, invalid JSON, or JSON that is not an object. */
export function parseInput(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  try {
    const value = JSON.parse(raw);
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

async function readStdin() {
  let raw = '';
  try {
    process.stdin.setEncoding('utf8');
    for await (const chunk of process.stdin) raw += chunk;
  } catch {
    // An unreadable stdin is treated as empty input.
  }
  return raw;
}

/**
 * Reads all of stdin, calls `handler(input)` and applies its result.
 * handler returns {exit: 0|2, stderr?, stdout?}. Exit 2 blocks; stderr is fed back to Claude.
 * A handler that throws exits 0, or 2 when `failClosed` is set.
 */
export async function runHook(handler, { failClosed = false } = {}) {
  const input = parseInput(await readStdin());
  let result;
  try {
    result = (await handler(input)) ?? { exit: 0 };
  } catch (err) {
    result = failClosed
      ? { exit: 2, stderr: `uc-core hook failed and blocks by default: ${err?.message ?? err}` }
      : { exit: 0 };
  }
  if (result.stdout) process.stdout.write(`${result.stdout}\n`);
  if (result.stderr) process.stderr.write(`${result.stderr}\n`);
  process.exitCode = result.exit === 2 ? 2 : 0;
}
