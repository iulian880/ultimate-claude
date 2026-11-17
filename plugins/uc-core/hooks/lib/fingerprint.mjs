// Fingerprint of the working tree for the STRICT gate: the git tree hash of everything in the working directory
// that git would add (tracked, modified, deleted and new files; .gitignore respected), minus what is not code:
// verification proofs (.uc/), agent memory notes, design documents (Superpowers specs and plans, ADRs, the glossary)
// and worktree folders, which the gate checks separately.
// Content-based: it changes with any edit, however it was made, and stays the same after committing that content.
// Computed in a temporary index, so the real index is never touched. null outside a git repository.
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

/** The root folder of the git working tree (main checkout or linked worktree) that contains `dir`, or null. */
export function repoRoot(dir) {
  return typeof dir === 'string' && fs.existsSync(dir) ? git(['rev-parse', '--show-toplevel'], dir) : null;
}

/** Returns the tree hash of the current working directory content, or null outside a git repository. */
export function treeFingerprint(projectDir) {
  if (typeof projectDir !== 'string') return null;
  const root = git(['rev-parse', '--show-toplevel'], projectDir);
  if (!root) return null;
  const gitDir = git(['rev-parse', '--absolute-git-dir'], root);
  if (!gitDir) return null;
  const index = path.join(os.tmpdir(), `uc-index-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
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
    const env = { ...process.env, GIT_INDEX_FILE: index };
    const excluded = NOT_CODE.map((p) => p.replace(':(glob)', ':(exclude,glob)'));
    if (git(['add', '-A', '--', '.', ...excluded], root, env) === null) return null;
    git(['rm', '--cached', '-r', '-q', '--ignore-unmatch', '--', ...NOT_CODE], root, env);
    return git(['write-tree'], root, env);
  } finally {
    fs.rmSync(index, { force: true });
    fs.rmSync(`${index}.lock`, { force: true });
  }
}
