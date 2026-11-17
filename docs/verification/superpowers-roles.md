# uc-core and Superpowers roles: verification

Date: 2026-11-17. Plan: `docs/plans/01b-superpowers-roles.md`. Machine: macOS 27.2.1 (arm64), Claude Code 2.1.311,
Superpowers 7.0.2. Executed inline on `main` (3 coupled tasks plus a step outside the repo).

## Change installed outside the repo

| Item | State | Backups | Restore command |
|---|---|---|---|
| `~/.claude/CLAUDE.md` | replaced with `installer/proposals/global-claude-md.md` (twice: the plan's version, then the version after the final review) | before Plan 1b: `~/.claude/backups/2026-11-17/CLAUDE.md.v2-141911`; first Plan 1b version: `CLAUDE.md.v2-142430` | `cp ~/.claude/backups/2026-11-17/CLAUDE.md.v2-141911 ~/.claude/CLAUDE.md` |

## Checks

| Check | Result |
|---|---|
| Each backup equals the file it copied | `cmp` identical (both times) |
| Installed file equals the proposal | `cmp` identical |
| Live, after the first install (`claude -p --model haiku`, scratch repo) | quoted `## Execution (uc-core decides, Superpowers runs it)`; picked inline for 3 coupled tasks |
| Live, after the final-review fixes | inline for 3 coupled tasks and no start before the user confirms; conformance review after the Superpowers reviews and before finishing the branch; architect between brainstorming and writing-plans in STRICT |
| `npm test` | 95 passed, 0 failed |
| `node scripts/lint-plugin.mjs plugins/uc-core` | `OK: plugins/uc-core` |
| Global block size | 40 lines without the `@RTK.md` import (cap raised from 35 to 40, DESIGN §5.2) |
| Final review (fresh reviewer, session model) | "with fixes": four important findings; three fixed test-first, the missing verification record and DESIGN §12 added here; a fifth (re-graded findings counted as open) was re-graded to important and fixed |

## Deferred (minor)

- `architect` and `code-reviewer` set `model: opus`; in a session on a cheaper model this conflicts with "Subagents never
  use a pricier model". Needs the user's call: keep Opus for these two, or switch them to `inherit`.
- The global rule sends coupled tasks to inline, while Superpowers lists "mostly independent tasks" as a precondition of
  both executors and suggests re-planning for tightly coupled work.
- `delivery-report` says both executors end with "Deferred minors"; subagent-driven-development prints only
  "Rulings I made".
- The draft uc-excel section (DESIGN §5.4) says `excel-vba-reviewer` uses the same report format as `code-reviewer`,
  which is now a conformance format. To settle with the Plan 4 design.

## Not verified

- A real plan executed with subagent-driven-development under the new rule.
- Whether edits made by SDD subagents reach the STRICT profile gate under the parent session id.
- The desktop app: checks ran in headless terminal sessions.
