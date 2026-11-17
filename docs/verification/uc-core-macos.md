# uc-core verification on macOS

Date: 2026-11-17. Machine: macOS 27.2.1 (arm64), Node v26.13.1, Claude Code 2.1.311. No `pwsh` installed.

## Automated checks

| Command | Result |
|---|---|
| `npm test` | `tests 70`, `pass 70`, `fail 0` |
| `node scripts/lint-plugin.mjs plugins/uc-core` | `OK: plugins/uc-core`, exit 0 |
| `claude plugin validate .` | `Validation passed` (marketplace manifest) |
| `claude plugin validate plugins/uc-core` | `Validation passed` |

The red step of TDD (tests failing before the implementation) was run for Tasks 1, 2, 4, 5 and 6. For Tasks 3,
7, 8 and 9 the tests and the implementation were written together and only the green run was observed.

## Live session

One headless session in a scratch git repo whose path contains a space:
`claude -p --plugin-dir "<repo>/plugins/uc-core" --model haiku --permission-mode acceptEdits`, with a prompt that
started with `profil strict`, wrote one file and tried one destructive command. Terminal (headless) only.

| Check | Result | Evidence |
|---|---|---|
| (a) four agents and four skills are listed | PASS | session listed `uc-core:architect`, `uc-core:code-reviewer`, `uc-core:qa-engineer`, `uc-core:release-gate` and `uc-core:complexity-check`, `uc-core:delivery-report`, `uc-core:product-discovery`, `uc-core:uc-profile` |
| (b) `profil strict` confirms and writes the session file | PASS | context line `UserPromptSubmit hook success: UC profile for this session is now STRICT.`; `~/.claude/uc/sessions/<session_id>.json` contained `"profile": "strict"` |
| (c) an edit followed by stopping is blocked once | PASS | session file got `lastEditAt` then `gateBlockedAt`; the model received `STRICT profile: files changed after the last PASS verification. ...`, answered with a delivery report, and the second stop went through |
| (d) `rm -rf x` is blocked | PASS | `PreToolUse:Bash hook error: [node ".../hooks/block-destructive.mjs"]: Blocked by uc-core block-destructive: rm -rf. ...` |
| (e) `architect` can use the user-scope `codebase-design` skill | NOT RUN | the agent was not started; the body instruction ("if available, load them") stays as the fallback |

Agents and skills are namespaced by the plugin: the agent type is `uc-core:release-gate`, not `release-gate`.

The session marker created by this test was deleted afterwards.

## Context budget

Measured with `/context all` in a new desktop-app session in the `Robot SAP` project (uc-core enabled at project
scope), 2026-11-17. Total at session start: 58.5k of 1M tokens.

| Item | Tokens |
|---|---|
| `uc-core:architect` | 105 |
| `uc-core:code-reviewer` | 114 |
| `uc-core:qa-engineer` | 107 |
| `uc-core:release-gate` | 135 |
| **Custom agents, total** | **461** |
| Skills, all sources together | 6.3k |

The agent baseline is 461 tokens. On the same day the four agents were rewritten with techniques adopted from
public agents (see README, Credits); their descriptions grew from 1299 to 1564 characters in total, roughly
65 more tokens. The new figure has not been measured. The share of the four `uc-core` skills inside the 6.3k "Skills" line was not
visible (that section was not expanded), so the skill baseline is still open.

This also shows that the desktop app loads the plugin's agents from a project-scope install.

## Not verified

- Windows: hooks under Git Bash and PowerShell, the `PowerShell` tool matcher, paths with backslashes at
  runtime (unit tests cover sanitising only), and `bin/uc.ps1` (never executed: no `pwsh` on this machine).
- The desktop app: agents load there (see Context budget), but the hooks were only exercised in a headless
  terminal session.
- Check (e) and the per-skill part of the context budget, above.
- `components.lock.json`: the install, uninstall and verify commands were collected from project READMEs by a
  research subagent and were neither run nor re-read; see `components-sources.md`. Three commands are
  `UNVERIFIED` (graphify verify, ccusage uninstall, xlflow uninstall). Marketplace plugins are not pinned to a
  version by their install command.
- The process skill `superpowers:executing-plans` was not available in the executing session (no plugins
  installed), so the plan was followed task by task without it, and without a separate code review pass.
- Task 9 step 5 (`gh repo create ... --push`) was deliberately not run.
