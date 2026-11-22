// Acceptance criteria belong to the current project/worktree. Bind a Markdown spec
// once; changes to the criteria are picked up on every check, including CI.
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const list = value => Array.isArray(value) && value.length > 0;

export function atomicJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + '.' + randomUUID() + '.tmp';
  try {
    fs.writeFileSync(temp, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
    fs.renameSync(temp, file);
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

export function contract(dir, source) {
  if (source === undefined) {
    try {
      source = JSON.parse(fs.readFileSync(path.join(dir, '.uc/contract.json'), 'utf8')).source;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      source = '.uc/criteria.md';
    }
  }
  if (!nonempty(source) || path.isAbsolute(source)) throw Error('Expected a project-relative criteria file');
  const file = fs.realpathSync(path.resolve(dir, source));
  const relative = path.relative(fs.realpathSync(dir), file);
  if (relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) throw Error('Criteria outside project');
  source = relative.split(path.sep).join('/');
  const sections = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split(/^## /m).slice(1)
    .filter(section => /^Acceptance criteria[ \t]*\n/i.test(section));
  if (sections.length !== 1) throw Error('Expected one ## Acceptance criteria section');
  const lines = sections[0].split('\n').slice(1).map(line => line.trim()).filter(Boolean);
  if (!lines.length || lines.some(line => !/^[-*] \S/.test(line))) throw Error('Use one bullet per criterion');
  const criteria = lines.map(line => line.slice(2).trim());
  if (new Set(criteria).size !== criteria.length) throw Error('Duplicate acceptance criterion');
  const digest = createHash('sha256').update(JSON.stringify([source, criteria])).digest('hex');
  return { source, criteria, digest };
}

export function contractState(dir) {
  try { return contract(dir).digest; }
  catch (error) { return error.code === 'ENOENT' ? 'missing' : 'invalid'; }
}

// Return one actionable diagnostic. The same contract is used at recording,
// conversational Stop and independent release checks.
export function passError(p, active) {
  if (p?.schemaVersion !== 2) return 'Version 2 evidence required';
  if (p.verdict !== 'PASS') return 'Verdict is not PASS';
  if (!nonempty(p.at) || !/^\d{4}-\d\d-\d\dT/.test(p.at) || !Number.isFinite(Date.parse(p.at))) return 'Invalid timestamp';
  if (!nonempty(p.platform)) return 'Missing verification platform';
  if (!nonempty(p.tree) || p.treeBefore !== p.tree) return 'Code changed during verification';
  if (p.criteriaDigest !== active.digest) return 'Acceptance criteria changed';
  if (!list(p.checks)) return 'Missing checks';
  for (const [index, check] of p.checks.entries()) {
    if (!nonempty(check?.summary)) return 'Missing summary for check ' + index;
    if (check.type === 'inspection' && nonempty(check.artifact)) continue;
    if (check.type !== 'command' || !nonempty(check.command) || check.exitCode !== 0) return 'Invalid check ' + index;
  }
  if (!Array.isArray(p.unverified) || p.unverified.length) return 'Outstanding checks';
  if (p.criteria?.length !== active.criteria.length || !Array.isArray(p.criteria)) return 'Criteria count differs';
  for (const [i, row] of p.criteria.entries()) {
    if (row?.criterion !== active.criteria[i] || row.status !== 'VERIFIED') return 'Unverified criterion ' + (i + 1);
    if (!list(row.checks) || row.checks.some(n => !Number.isInteger(n) || n < 0 || n >= p.checks.length)) return 'Missing evidence for criterion ' + (i + 1);
  }
  return null;
}

export function passes(dir, platform = process.platform) {
  let active, files;
  const folder = path.join(dir, '.uc/verification');
  try { active = contract(dir); files = fs.readdirSync(folder); } catch { return []; }
  const records = [];
  const lastFailure = new Map();
  for (const file of files.filter(name => name.endsWith('.json'))) {
    try {
      const p = JSON.parse(fs.readFileSync(path.join(folder, file), 'utf8'));
      if (p?.schemaVersion !== 2 || p.platform !== platform || p.criteriaDigest !== active.digest) continue;
      if (p.verdict === 'FAIL' && Number.isFinite(Date.parse(p.at))) {
        lastFailure.set(p.tree, Math.max(lastFailure.get(p.tree) ?? 0, Date.parse(p.at)));
      } else if (!passError(p, active)) records.push({ ...p, file: path.join(folder, file) });
    } catch { /* Incomplete or unreadable evidence cannot approve delivery. */ }
  }
  return records.filter(p => Date.parse(p.at) > (lastFailure.get(p.tree) ?? -Infinity)).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

export function latestPassAt(dir) { return passes(dir).find(p => p.tree === 'none')?.at ?? null; }
export function passingTrees(dir) { return new Set(passes(dir).map(p => p.tree)); }
