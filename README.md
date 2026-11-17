# ultimate-claude

Private Claude Code plugin marketplace. Design: [docs/DESIGN.md](docs/DESIGN.md) (Romanian). Layout: [STRUCTURE.md](STRUCTURE.md).

## Plugins

| Plugin | Status | Scope |
|---|---|---|
| `uc-core` | Plan 1 | global, or per project |
| `uc-web` | Plan 3 (not written) | web projects |
| `uc-excel` | Plan 4 (not written) | Excel/VBA projects |

## Use

Requires Node.js >= 22. No npm dependencies.

```bash
claude plugin marketplace add "/path/to/ultimate-claude"
claude plugin install uc-core@ultimate-claude --scope project
```

`uc-core` declares `security-guidance@claude-plugins-official` as a dependency, so installing `uc-core` in a
project also installs and enables `security-guidance` there, and nowhere else. Its LLM reviews (on every stop
and every commit) run on Opus with your account; set `ENABLE_CODE_SECURITY_REVIEW=0` in a project's
`env` to keep only its free pattern warnings.

Try it without installing: `claude --plugin-dir "/path/to/ultimate-claude/plugins/uc-core"`.

## Profiles

`MINIMAL`, `STANDARD` (default), `STRICT`. Switch for one session by starting a prompt with `profil strict`
(or `profile strict`), per project with `env.UC_PROFILE` in `.claude/settings.local.json`, or from a terminal with
`bin/uc strict`. See the `uc-profile` skill.

## Develop

```bash
npm test
npm run lint
```
