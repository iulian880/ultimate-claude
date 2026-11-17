# Mac migration v3 → V2 (Plan 2 of 6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring this Mac's global Claude Code configuration in line with the V2 design: a new global `CLAUDE.md`
block, leftovers of the v3 setup archived, and the remaining decisions recorded.

**Architecture:** The new global block lives in the repo as a reviewed, tested proposal
(`installer/proposals/global-claude-md.md`), so Plan 5's installer can offer the same text on Windows. Each change
to `~/.claude` is a separate step that needs the user's explicit yes, is preceded by a backup, and is reversible.

**Tech Stack:** Node.js ≥ 22 (`node:test`), git, Claude Code CLI 2.1.311.

**Spec:** `docs/DESIGN.md` §2 (anti-goals), §5.2 (global block), §5.5 (RTK, security-guidance), §7 (profiles),
§9 (migration). Decisions taken by the user on 2026-11-17 override §9 where they differ (listed below).

## Audit (2026-11-17, read-only)

What §9 expected versus what this Mac has. Items marked *absent* need no task.

| §9 item | Found |
|---|---|
| RTK (`@RTK.md`, hook, binary) | present; **stays** (user decision, DESIGN §5.5) |
| `~/.claude/CLAUDE.md` with "Do not create custom subagents" | present → Task 2 |
| `~/.claude/hooks/block-destructive.sh` in settings | present; **stays** global (user decision: uc-core is not global) |
| Playwright MCP | absent (`claude mcp list`: only claude.ai connectors; no user `mcpServers`) |
| Plugins `headroom`, `code-graph`, `engineering`, `design`, `data`, `productivity`, `datarobot`, `firecrawl` | absent (installed: `superpowers` user, `uc-core` and `security-guidance` project) |
| `SETUP-SPEC.md`, `RAPORT-setup.md` | absent on this Mac |
| `~/.claude/PLAYBOOK.md` (v3 guide, not loaded) | present → Task 3 (user: the old setup is redundant) |
| Projects `notirelay`, `telegram-mt5-copier` | absent (`~/Documents/claude code/` does not exist) |
| `~/.claude/hooks/notirelay-exe.sh` | present, referenced by no settings file, its project is absent → Task 3 |
| `env.ENABLE_CODE_SECURITY_REVIEW = "0"` in `~/.claude/settings.json` | present since before 2026-11-17 → Task 4 |

## Global Constraints

- Every write, move or delete under `~/.claude` needs the user's explicit yes for that item, given after they have seen
  the exact change. Approval of one item does not cover the next.
- Before each change, copy the target to `~/.claude/backups/2026-11-17/` keeping its file name; if a file of that name
  already exists there, append `.v2-<HHMMSS>` instead of overwriting it.
- Never delete: archiving is a move into the backup folder.
- Do not touch `permissions`, `hooks`, `extraKnownMarketplaces` or MCP configuration in `~/.claude/settings.json`.
- RTK stays, `block-destructive.sh` stays, `uc-core` stays project-scoped, agent teams stay off.
- The global block is at most 35 lines, excluding the `@RTK.md` import line (DESIGN §5.2).
- Repo files in English; talk to the user in Romanian.

## Review Focus

1. `~/.claude/CLAUDE.md` changed between the audit and the apply step → the apply step must stop, not overwrite
   (Task 2 compares the file with its backup right before copying).
2. The `@RTK.md` import line is lost or moved → RTK instructions silently stop loading (Task 1 test pins it as line 1).
3. A backup with the same name already exists → it must survive (Global Constraints naming rule; Task 2 and 3 check
   the backup with `cmp` before the change).
4. Rollback must give back the exact old file (Task 5 records one restore command per change and Task 2 checks it
   with `cmp`).
5. A rule in the new block contradicts the profiles → for example MINIMAL work forced through brainstorming (Task 1
   test asserts the MINIMAL override line).

---

### Task 1: Global CLAUDE.md proposal

**Files:**
- Create: `installer/proposals/global-claude-md.md`
- Test: `tests/global-claude-md.test.mjs`

**Interfaces:**
- Produces: the file `installer/proposals/global-claude-md.md`, the exact text Task 2 installs and Plan 5 offers.

- [ ] **Step 1: Write the failing test** `tests/global-claude-md.test.mjs`:

```js
test('first line is the @RTK.md import', ...)                    // lines[0] === '@RTK.md'
test('block is at most 35 lines without the import', ...)        // lines.slice(1) trimmed of leading blanks
test('keeps precedence, verification, delegation and language rules', ...)
  // contains: 'explicit request', 'Never claim done', 'Send context-flooding work', 'Speak Romanian'
test('has the three-profile table and the MINIMAL override', ...)
  // contains '| MINIMAL', '| STANDARD', '| STRICT', 'overrides the Superpowers'
test('drops the v3 ban on custom subagents and keeps agent teams off', ...)
  // does not contain 'Do not create custom subagents'; contains 'agent teams stay off'
```

- [ ] **Step 2:** `npm test` → FAIL (file missing).
- [ ] **Step 3:** Write `installer/proposals/global-claude-md.md` with exactly this text:

```markdown
@RTK.md

# Global working rules (ultimate-claude V2)

## Precedence and approach
- The user's explicit request > the project's CLAUDE.md and rules > this file > skill instructions (Superpowers included).
- Intelligent Complexity: build what fits this project. Added structure needs a named driver (a requirement, a failure
  it prevents, an expected change); so does leaving it out when it is needed. When unsure, use `complexity-check`.

## Profiles (uc-core; default STANDARD)
| Profile | When | Process | Review |
|---|---|---|---|
| MINIMAL | typo, rename, a fix inside one function | do it directly, then one check | none |
| STANDARD | everyday development | Superpowers: brainstorming, writing-plans, executing-plans (inline), verification | `code-reviewer` |
| STRICT | critical systems, migrations, important VBA, security, data | STANDARD + `architect` (ADR) + `qa-engineer` | `code-reviewer`, `/security-review`, domain reviewer, `release-gate` |
- MINIMAL work skips brainstorming and plans; this overrides the Superpowers "skill first" rule.
- Switch for one session by starting a prompt with `profil <name>`. Hooks enforce profiles only where uc-core is enabled.

## Verification
- Never claim done without running a check (tests, build, typecheck or screenshot) and showing its output.
- Report what was verified, how, and what stayed unverified (e.g. Windows-only behaviour checked from a Mac).

## Delegation
- Send context-flooding work (wide searches, logs, reading docs) to a subagent; keep only the plan and decisions here.
- Every delegation states: goal, allowed files/dirs, what to return (format, max length), what it must not do, how to verify.
- Parallelize only independent tasks; if they touch the same files, give each its own worktree.
- Before /batch or a dynamic workflow, state the estimated cost and wait for approval.
- Read line ranges, not whole files. Navigate with LSP (definitions, references) before grep.
- Use the uc-core agents where the profile calls for them; do not invent ad-hoc agents; agent teams stay off.
- Use subagent-driven-development only when the user asks for it.

## User
- Speak Romanian with the user; write code, configs and commit messages in English.
- The user is new to Claude Code: briefly explain decisions and give exact commands when they must run something.
```

- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit: `feat(installer): proposed global CLAUDE.md block for V2`.

### Task 2: Install the block in `~/.claude/CLAUDE.md` (needs the user's yes)

**Files:**
- Modify (outside the repo): `~/.claude/CLAUDE.md`
- Backup: `~/.claude/backups/2026-11-17/CLAUDE.md`

**Interfaces:**
- Consumes: `installer/proposals/global-claude-md.md` from Task 1.

- [ ] **Step 1:** Copy `~/.claude/CLAUDE.md` to the backup path (naming rule in Global Constraints); `cmp` the two → identical.
- [ ] **Step 2:** Show the user `diff -u ~/.claude/CLAUDE.md installer/proposals/global-claude-md.md` and ask for a yes.
  No yes → stop here and record "not applied" in Task 5.
- [ ] **Step 3:** Right before copying, `cmp` `~/.claude/CLAUDE.md` with the backup again; if they differ, the user
  edited it meanwhile: stop and report.
- [ ] **Step 4:** Copy the proposal over `~/.claude/CLAUDE.md`; `cmp` the two → identical.
- [ ] **Step 5: Live check.** In a scratch folder: `claude -p --model haiku "Quote the H1 heading of your global
  CLAUDE.md instructions, then say whether RTK instructions are loaded."` Expected: the answer quotes
  `Global working rules (ultimate-claude V2)` and mentions RTK.
- [ ] **Step 6:** Rollback rehearsal on a copy: copy the backup to the scratchpad, `cmp` it with the backup → identical
  (proves the restore command in Task 5 returns the exact old file).

### Task 3: Archive v3 leftovers (each item needs the user's yes)

**Files (outside the repo):**
- Move: `~/.claude/PLAYBOOK.md` → `~/.claude/backups/2026-11-17/PLAYBOOK.md`
- Move: `~/.claude/hooks/notirelay-exe.sh` → `~/.claude/backups/2026-11-17/hooks/notirelay-exe.sh`

- [ ] **Step 1:** Re-check that no settings file references the hook:
  `grep -rn "notirelay-exe" ~/.claude/settings.json ~/.claude/settings.local.json` → no match (a missing
  `settings.local.json` is fine). A match → skip this item and report it.
- [ ] **Step 2:** For each item, show source and destination and ask for a yes; on yes, `mv`; then `ls` the destination
  and confirm the source is gone. A destination that already exists gets the `.v2-<HHMMSS>` suffix.

### Task 4: Security review setting and design record

**Files:**
- Modify: `docs/DESIGN.md` (§5.5 security-guidance row, §9)
- Possibly modify (outside the repo, with a yes): `~/.claude/settings.json` (`env` only)

- [ ] **Step 1:** Tell the user that `ENABLE_CODE_SECURITY_REVIEW=0` is already set globally, so security-guidance
  runs only its free pattern warnings everywhere, and ask: keep it, or remove it so the Opus diff and commit
  reviews run in uc-core projects. Default if no answer: keep.
- [ ] **Step 2:** Only if the user says remove: back up `settings.json`, delete that single `env` key with a JSON-aware
  edit (Node, not sed), and check that `node -e "require(process.argv[1])" ~/.claude/settings.json` parses and
  that every other key is unchanged (compare `JSON.stringify` of the other keys before and after).
- [ ] **Step 3:** Update DESIGN §9 to the decided state: RTK stays; `block-destructive.sh` stays global because
  uc-core is not global (the Node version replaces it in Plan 5); PLAYBOOK and the notirelay hook archived; absent
  items listed as absent; the security review setting as decided. Update the §5.5 security-guidance row if Step 2 ran.
- [ ] **Step 4:** `npm test` → PASS. Commit: `docs: record Mac migration decisions`.

### Task 5: Verification record

**Files:**
- Create: `docs/verification/mac-migration.md`

- [ ] **Step 1:** Write the record: the audit table above with final states; each change with its backup path and the
  exact restore command (`cp "<backup>" "<original>"` or `mv "<backup>" "<original>"`); the live check output from
  Task 2 Step 5; what was declined or skipped.
- [ ] **Step 2:** Run `npm test`, `node scripts/lint-plugin.mjs plugins/uc-core` and `claude plugin list`; paste the
  summaries.
- [ ] **Step 3:** Commit: `docs: Mac migration verification`. Push only after the user says yes.
