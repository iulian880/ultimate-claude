// Fingerprint of the working tree for the STRICT gate: the git tree hash of everything in the working directory
// that git would add (tracked, modified, deleted and new files; .gitignore respected), minus what is not code:
// verification proofs (.uc/), agent memory notes, design documents (Superpowers specs and plans, ADRs, the glossary)
// and worktree folders, which the gate checks separately.
// Content-based: it changes with any edit, however it was made, and stays the same after committing that content.
// Computed in a temporary index and a temporary object folder that lists the repository's objects in
// info/alternates (a file, so a ':' or ';' in the path is harmless), so neither the real index nor .git/objects
// changes. null outside a git repository.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Pathspecs relative to the repository root; `**/` also matches at the root, so monorepo packages are covered.
const NOT_CODE = [
  '**/.uc/**', '**/.claude/agent-memory/**',
  '**/docs/superpowers/**', '**/docs/specs/**', '**/docs/plans/**', '**/docs/adr/**', '**/GLOSSARY.md', '**/GLOSSARY-MAP.md',
  '**/.worktrees/**', '**/.claude/worktrees/**',
].map((p) => `:(glob)${p}`);

function git(args, cwd, env = process.env) {
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', env: { ...env, GIT_OPTIONAL_LOCKS: '0' }, maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? r.stdout.trim() : null;
}

const real = (p) => {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
};

/** The root folder of the git working tree (main checkout or linked worktree) that contains `dir`, or null. */
export function repoRoot(dir) {
  if (typeof dir !== 'string' || !fs.existsSync(dir)) return null;
  const root = git(['rev-parse', '--show-toplevel'], dir);
  return root ? real(root) : null;
}

/** The repository's shared .git folder: the same for the main checkout and all its linked worktrees. */
export function commonDir(dir) {
  const out = typeof dir === 'string' && fs.existsSync(dir) ? git(['rev-parse', '--git-common-dir'], dir) : null;
  return out ? real(path.resolve(dir, out)) : null;
}

/** Every working tree of the repository that contains `dir` (main checkout first), or []. */
export function worktreeRoots(dir) {
  const out = git(['worktree', 'list', '--porcelain'], dir);
  return out ? out.split('\n').filter((l) => l.startsWith('worktree ')).map((l) => real(l.slice(9))) : [];
}

/** The tree of the commit checked out in `dir`, or null. */
export function headTree(dir) {
  return git(['rev-parse', 'HEAD^{tree}'], dir);
}

/** Returns the tree hash of the current working directory content, or null outside a git repository. */
export function treeFingerprint(projectDir) {
  if (typeof projectDir !== 'string') return null;
  const root = git(['rev-parse', '--show-toplevel'], projectDir);
  if (!root) return null;
  const gitDir = git(['rev-parse', '--absolute-git-dir'], root);
  if (!gitDir) return null;
  const objects = git(['rev-parse', '--git-path', 'objects'], root);
  if (!objects) return null;
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'uc-fingerprint-'));
  const index = path.join(scratch, 'index');
  fs.mkdirSync(path.join(scratch, 'objects', 'info'), { recursive: true });
  fs.writeFileSync(path.join(scratch, 'objects', 'info', 'alternates'), `${path.resolve(root, objects)}\n`);
  try {
    // Starting from a copy of the real index keeps git's stat cache, so unchanged files are not re-read.
    // The copy keeps the original's modification time: git re-reads files changed in the same second as the index
    // ("racy git") only when the index looks as old as it really is.
    const real = path.join(gitDir, 'index');
    if (fs.existsSync(real)) {
      fs.copyFileSync(real, index);
      const st = fs.statSync(real);
      fs.utimesSync(index, st.atime, st.mtime);
    }
    const env = { ...process.env, GIT_INDEX_FILE: index, GIT_OBJECT_DIRECTORY: path.join(scratch, 'objects') };
    const excluded = NOT_CODE.map((p) => p.replace(':(glob)', ':(exclude,glob)'));
    if (git(['add', '-A', '--', '.', ...excluded], root, env) === null) return null;
    git(['rm', '--cached', '-r', '-q', '--ignore-unmatch', '--', ...NOT_CODE], root, env);
    return git(['write-tree'], root, env);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}
