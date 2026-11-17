# Mac migration v3 → V2 verification

Date: 2026-11-17. Plan: `docs/plans/02-mac-migration.md`. Machine: macOS 27.2.1 (arm64), Claude Code 2.1.311.
Every change under `~/.claude` was made after the user's explicit yes for that item.

## Final state

| Item | State | Backup | Restore command |
|---|---|---|---|
| `~/.claude/CLAUDE.md` | replaced with `installer/proposals/global-claude-md.md` | `~/.claude/backups/2026-11-17/CLAUDE.md` | `cp ~/.claude/backups/2026-11-17/CLAUDE.md ~/.claude/CLAUDE.md` |
| `~/.claude/PLAYBOOK.md` | archived | `~/.claude/backups/2026-11-17/PLAYBOOK.md` | `mv ~/.claude/backups/2026-11-17/PLAYBOOK.md ~/.claude/PLAYBOOK.md` |
| `~/.claude/hooks/notirelay-exe.sh` | archived (no settings file referenced it; project absent) | `~/.claude/backups/2026-11-17/hooks/notirelay-exe.sh` | `mv ~/.claude/backups/2026-11-17/hooks/notirelay-exe.sh ~/.claude/hooks/` |
| RTK (`@RTK.md`, hook, binary) | kept (user decision) | — | — |
| `~/.claude/hooks/block-destructive.sh` | kept global (uc-core is not global) | — | — |
| `env.ENABLE_CODE_SECURITY_REVIEW = "0"` | kept (user decision); `settings.json` not modified | — | — |
| Playwright MCP, plugins `headroom`, `code-graph`, `engineering`, `design`, `data`, `productivity`, `datarobot`, `firecrawl`, `SETUP-SPEC.md`, `RAPORT-setup.md`, projects `notirelay` and `telegram-mt5-copier` | already absent before the migration | — | — |

## Checks

| Check | Result |
|---|---|
| Backup of `CLAUDE.md` before the change | `cmp` identical |
| `CLAUDE.md` unchanged between backup and install | `cmp` identical right before copying |
| Installed file equals the proposal | `cmp` identical |
| Rollback rehearsal (backup copied to the scratchpad) | `cmp` identical |
| Live: `claude -p --model haiku` in a scratch repo, asked for the global H1 and RTK | quoted `# Global working rules (ultimate-claude V2)` and confirmed the RTK "Command output" section is loaded |
| Archived files | each source gone, each destination present (`ls`) |
| `npm test` | 84 passed, 0 failed |
| `node scripts/lint-plugin.mjs plugins/uc-core` | `OK: plugins/uc-core` |
| `claude plugin list` (from this repo) | `superpowers` user scope enabled; `uc-core` and `security-guidance` project scope, disabled here as expected (enabled only in `Robot SAP`) |

## Noticed, not changed

- Claude Code warns that the deny rules `Write(**/.env)` and `Write(**/.env.*)` in `~/.claude/settings.json` are never
  matched (only `Edit(...)` rules apply to file writes). The existing `Edit(**/.env)` and `Edit(**/.env.*)` rules
  already cover writes, so `.env` files stay protected; the two `Write` rules are redundant. Permissions were out of
  scope for this plan.

## Not verified

- The new global block was checked in one headless terminal session; a desktop-app session was not checked.
- Windows: nothing in this plan applies there yet; the same proposal file is meant for the Plan 5 installer.
