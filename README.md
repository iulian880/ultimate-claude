# ultimate-claude

Private Claude Code plugin marketplace. Design: [docs/DESIGN.md](docs/DESIGN.md) (Romanian). Layout: [STRUCTURE.md](STRUCTURE.md).

## Plugins

| Plugin | Status | Scope | What it has |
|---|---|---|---|
| `uc-core` | built (Plans 1, 1b) | per project | agents `architect`, `code-reviewer` (conformance), `qa-engineer`, `release-gate`; skills `complexity-check`, `product-discovery`, `delivery-report`, `uc-profile`; hooks `block-destructive`, `set-profile`, `session-start`, `track-edit`, `profile-gate`; profiles |
| `uc-excel` | built (Plan 4) | per Excel/VBA project | agent `excel-vba-reviewer`; skill `vba-workflow`; hook `workbook-guard`; template `excel-vba` |
| `uc-web` | not written (Plan 3) | web projects | — |

Plans are in [docs/plans/](docs/plans/), and what was verified on which machine is in [docs/verification/](docs/verification/).
`components.lock.json` lists the third-party components with pinned versions; `installer/proposals/global-claude-md.md`
is the global `CLAUDE.md` block.

## Use

Requires Node.js >= 22. No npm dependencies.

```bash
claude plugin marketplace add "/path/to/ultimate-claude"
claude plugin install uc-core@ultimate-claude --scope project
```

For an Excel/VBA project install `uc-excel` the same way; it depends on `uc-core`.

`uc-core` declares `security-guidance@claude-plugins-official` as a dependency, so installing `uc-core` in a
project also installs and enables `security-guidance` there, and nowhere else. Its LLM reviews (on every stop
and every commit) run on Opus with your account; set `ENABLE_CODE_SECURITY_REVIEW=0` in a project's
`env` to keep only its free pattern warnings.

Try it without installing: load the dependencies too, or Claude Code disables the plugin silently
(`claude --debug` shows "dependency-unsatisfied"):

```bash
claude --plugin-dir ~/.claude/plugins/cache/claude-plugins-official/security-guidance/<version> \
  --plugin-dir "/path/to/ultimate-claude/plugins/uc-core" --plugin-dir "/path/to/ultimate-claude/plugins/uc-excel"
```

## Profiles

`MINIMAL`, `STANDARD` (default), `STRICT`. Switch for one session by starting a prompt with `profil strict`
(or `profile strict`), per project with `env.UC_PROFILE` in `.claude/settings.local.json`, or from a terminal with
`bin/uc strict`. See the `uc-profile` skill.

## Credits

The `uc-core` agents are our own text. Some techniques in them were adapted, not copied, from these projects:

- [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official) (Apache-2.0):
  confidence threshold and project-rule checks in code review (`code-review`, `pr-review-toolkit`), file:line
  evidence and the implementation blueprint (`feature-dev`), criticality scores for test gaps.
- [obra/superpowers](https://github.com/obra/superpowers) (MIT): naming the failure a test catches, expected
  values worked out by hand, the mutation check, banned hedging words in verification.
- [affaan-m/everything-claude-code](https://github.com/affaan-m/everything-claude-code) (MIT): the pre-report
  gate and the false-positive list in review, baseline checks and next steps in verification, flaky-test reruns.
- [mattpocock/skills](https://github.com/mattpocock/skills) (MIT): distinct design constraints per candidate,
  the deletion test, dependency classes and the three-part ADR test.

## Develop

```bash
npm test
npm run lint
```
