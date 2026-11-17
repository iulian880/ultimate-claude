# ultimate-claude — target file structure

Copy this kit (`STRUCTURE.md` + `docs/`) into an empty folder or a new repo, then execute `docs/plans/01-uc-core.md`.
The number in brackets is the plan that creates each item. Only Plan 1 is written; Plans 2–6 are outlined below.

```
ultimate-claude/
├── STRUCTURE.md                              [kit] this file
├── README.md                                 [1]
├── package.json                              [1] type: module, node >= 22, no dependencies
├── .gitignore                                [1]
├── components.lock.json                      [1] third-party components: pinned version, license, scope, default,
│                                                 install / uninstall / verify, bringsHooks, bringsMcp, alwaysOnTokens
├── .claude-plugin/
│   └── marketplace.json                      [1] private marketplace: uc-core, uc-web [3], uc-excel [4]
├── bin/
│   ├── uc.ps1                                [1] uc <minimal|standard|strict> → claude --settings <profile>
│   └── uc                                    [1] same, POSIX shell
├── scripts/
│   └── lint-plugin.mjs                       [1] structure/frontmatter linter for any plugin dir
├── plugins/
│   ├── uc-core/                              [1] active globally
│   │   ├── .claude-plugin/plugin.json
│   │   ├── agents/
│   │   │   ├── architect.md
│   │   │   ├── code-reviewer.md
│   │   │   ├── qa-engineer.md
│   │   │   └── release-gate.md
│   │   ├── skills/
│   │   │   ├── complexity-check/SKILL.md
│   │   │   ├── product-discovery/SKILL.md
│   │   │   ├── delivery-report/SKILL.md
│   │   │   └── uc-profile/SKILL.md
│   │   ├── hooks/
│   │   │   ├── hooks.json
│   │   │   ├── block-destructive.mjs         PreToolUse (Bash, PowerShell)
│   │   │   ├── set-profile.mjs               UserPromptSubmit
│   │   │   ├── track-edit.mjs                PostToolUse (Edit|Write|NotebookEdit)
│   │   │   ├── profile-gate.mjs              Stop (STRICT only)
│   │   │   └── lib/
│   │   │       ├── hook-io.mjs
│   │   │       ├── state.mjs
│   │   │       └── verification.mjs
│   │   └── profiles/
│   │       ├── minimal.json
│   │       ├── standard.json
│   │       └── strict.json
│   ├── uc-web/                               [3] enabled per web project
│   │   ├── .claude-plugin/plugin.json
│   │   ├── agents/
│   │   │   ├── frontend-reviewer.md
│   │   │   └── database-reviewer.md          adapted from ECC (MIT, attributed)
│   │   ├── skills/
│   │   │   └── ui-improve/SKILL.md
│   │   └── templates/web-app/
│   │       ├── CLAUDE.md
│   │       ├── .claude/settings.json         enabledPlugins: uc-web
│   │       ├── .claude/rules/                path-scoped rules
│   │       ├── docs/adr/  docs/specs/
│   │       ├── design-system/MASTER.md
│   │       └── checklists/{security,performance,release}.md
│   └── uc-excel/                             [4] enabled per Excel/VBA project; development and checks on the Mac
│       ├── .claude-plugin/plugin.json        depends on uc-core
│       ├── agents/excel-vba-reviewer.md      VBA-specific review, session model
│       ├── skills/vba-workflow/SKILL.md      backup, sources only, lint, build, compile, tests, user docs
│       ├── hooks/
│       │   ├── hooks.json
│       │   ├── session-start.mjs             SessionStart: records the session start
│       │   ├── workbook-guard.mjs            PreToolUse: backup required before workbook writes
│       │   └── lib/                          byte-identical copy of uc-core hooks/lib
│       └── templates/excel-vba/
│           ├── CLAUDE.md                     what it is, commands, user documentation, rules
│           ├── .claude/settings.json         enabledPlugins: uc-core, uc-excel; UC_PROFILE standard
│           └── .gitignore                    backups/, .venv/, archives
├── installer/                                [5]
│   ├── install.ps1                           thin entry: checks Node, calls uc-setup.mjs
│   ├── install.sh                            thin entry
│   ├── uc-setup.mjs                          detect → plan → backup → apply → verify → report
│   ├── lib/{detect,plan,backup,apply,state,report}.mjs
│   └── proposals/                            diffs offered for consent: CLAUDE.md block, settings, PATH
├── bench/                                    [6]
│   ├── tasks/<task>/{prompt.md,acceptance/,rubric.md}
│   ├── run-bench.mjs
│   └── results/
├── tests/                                    [1,3,4,5] node:test, one file per unit
├── .github/workflows/test.yml                [5] macOS + windows-latest
└── docs/
    ├── DESIGN.md                             [kit] approved design (Romanian)
    ├── plans/
    │   ├── 01-uc-core.md                     [kit] ready to execute
    │   ├── 02-mac-migration.md               to be written after Plan 1 is verified
    │   ├── 03-uc-web.md
    │   ├── 04-uc-excel.md
    │   ├── 05-installer.md
    │   └── 06-benchmark-windows.md
    ├── adr/                                  [1] 0001 plugins in a private marketplace, 0002 Node hooks and installer
    └── verification/                         [1] what was verified on which OS, and what was not
```

Files written outside the repo at runtime (never committed):

```
<CLAUDE_CONFIG_DIR or ~/.claude>/uc/sessions/<session_id>.json   profile, lastEditAt, gateBlockedAt
<CLAUDE_CONFIG_DIR or ~/.claude>/uc/state.json                   [5] installer state for uninstall / rollback
<project>/.uc/verification/<timestamp>.json                      written by the release-gate agent
```

## Plan outline

| # | Plan | Delivers | Depends on |
|---|---|---|---|
| 1 | uc-core | repo, linter, 4 agents, 4 skills, 4 hook scripts, profiles, lockfile, ADRs | — |
| 2 | Migration of the existing setup (v3 → V2) | old global rules and duplicate hooks removed with consent (RTK stays, bypassed by the verifying agents); new global `CLAUDE.md` block; plugin audit | 1 |
| 3 | uc-web | frontend-reviewer, database-reviewer, `ui-improve`, web-app template; Playwright CLI, UI UX Pro Max, Frontend Design wired in | 1 |
| 4 | uc-excel | excel-vba-reviewer, `vba-workflow`, `workbook-guard`, template; Robot SAP on the Mac toolchain (LibreOffice, Python venv) | 1 |
| 5 | Installer | detect / preview / backup / apply / verify / uninstall / rollback; CI on macOS and Windows | 1–4 |
| 6 | Benchmark and real Windows test | pilot benchmark, context budget, full Windows verification | 1–5 |

## How to start in an empty folder

1. Copy `STRUCTURE.md` and `docs/` into the folder.
2. `git init -b main`, then commit these files (Superpowers needs a repo with one commit).
3. Open Claude Code in the folder and say: `Execute docs/plans/01-uc-core.md task by task.`
