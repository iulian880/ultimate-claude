# uc-core (Plan 1 of 6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the private `ultimate-claude` marketplace repo and a working, tested `uc-core` plugin (4 agents, 4 skills, 3 hooks, profiles, lockfile).

**Architecture:** One git repo that is a Claude Code plugin marketplace. `uc-core` ships markdown agents/skills plus dependency-free Node hooks. Hooks share two small libraries (stdin/exit protocol, profile resolution) and are pure functions wrapped by thin CLI entry points, so they are unit-testable with `node:test` on macOS and Windows.

**Tech Stack:** Node.js ≥ 22 (ES modules, `node:test`, no npm dependencies), Claude Code plugin format, git, GitHub Actions (later plan).

**Spec:** `docs/DESIGN.md` (§5.1, §5.2, §6, §7; written in Romanian). Executors read both. Target layout: `STRUCTURE.md`.

**Plan series:** 1 uc-core (this) · 2 Mac migration v3→V2 · 3 uc-web · 4 uc-excel · 5 installer · 6 benchmark + Windows real-machine test. Each later plan is written when the previous one is verified.

## Global Constraints

- Repo root: the folder that contains this kit (`STRUCTURE.md`, `docs/`) — an empty folder or a fresh repo. All paths below are relative to it. Works from any location and on macOS or Windows.
- Node ≥ 22; **zero** npm dependencies; ES modules (`.mjs`); tests run with `node --test`.
- Everything must run on macOS and native Windows: no bash, no `python`, no POSIX-only paths; use `node:path` and `node:os`.
- Config base dir is `process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')`. Session state lives in `<base>/uc/sessions/<session_id>.json`.
- Profiles are exactly `minimal`, `standard`, `strict`; default `standard`.
- Files are written in English. Skill `description` + `when_to_use` ≤ 1536 characters.
- This plan must **not** modify `~/.claude/settings.json`, `~/.claude/CLAUDE.md`, existing hooks, permissions or MCP config. Manual checks use `claude --plugin-dir`.
- Creating the GitHub repo and pushing are outward-facing: ask the user before Task 9 step 5.
- Before writing hooks, re-read https://code.claude.com/docs/en/hooks.md and confirm: stdin fields (`session_id`, `tool_name`, `tool_input`, `prompt`, `stop_hook_active`, `cwd`), exit code 2 = block with stderr fed back, the PowerShell tool's `tool_name`, and `${CLAUDE_PLUGIN_ROOT}`. If the docs differ from this plan, follow the docs and note the change in the commit message.

## Review Focus

1. Hook stdin is empty or not JSON → `block-destructive` blocks (fails closed) with a readable message; every other hook exits 0 silently.
2. Home or project path contains spaces/backslashes (e.g. `C:\Users\Ion Pop\`, `/Users/x/Documents/claude code`) → state files are read and written correctly.
3. `session_id` contains path characters (`../x`, `a\b`) → sanitized to `[A-Za-z0-9_-]`, never escapes the sessions dir.
4. Stop arrives with `stop_hook_active: true`, or a second Stop after a gate block → never blocks again (no loop).
5. A verification file is malformed JSON or has `verdict: "FAIL"` → treated as "no PASS"; and `git push --force-with-lease` / `rm -r dir` (no force) are **not** blocked.

Each line is pinned by a test in the task that owns the code (Tasks 2–5).

---

### Task 1: Repo scaffold, manifests, plugin linter

**Files:**
- Create: `.claude-plugin/marketplace.json`, `plugins/uc-core/.claude-plugin/plugin.json`, `package.json`, `.gitignore`, `README.md`, `scripts/lint-plugin.mjs`
- Test: `tests/lint-plugin.test.mjs`

**Interfaces:**
- Produces: `lintPlugin(pluginDir: string): string[]` (list of problems, empty = OK), exported from `scripts/lint-plugin.mjs`; CLI `node scripts/lint-plugin.mjs plugins/uc-core` exits 1 when problems exist. `npm test` runs `node --test tests/`.

- [ ] **Step 1:** In the repo root, run `git init -b main` if it is not already a git repo (Superpowers ≥ 7.0.2 needs a repo with one commit: commit the kit files first as `docs: design, structure and plan`). Write `package.json` (`"type": "module"`, `"private": true`, `"engines": {"node": ">=22"}`, scripts `test` and `lint`), `.gitignore` (`node_modules/`, `.uc/`, `*.log`).
- [ ] **Step 2:** Write `marketplace.json` (name `ultimate-claude`, owner name `ultimate-claude`, one plugin entry `uc-core` with `source: "./plugins/uc-core"`) and `plugin.json` (name `uc-core`, version `0.1.0`, description). Check the field names against https://code.claude.com/docs/en/plugins/install.md and the plugin reference page first.
- [ ] **Step 3: Write failing tests** in `tests/lint-plugin.test.mjs` using temp dirs:

```js
test('valid minimal plugin has no problems', ...)            // plugin.json + one agent + one skill
test('agent without name or description is reported', ...)   // problem text includes the file name
test('skill whose name differs from its directory is reported', ...)
test('skill description + when_to_use over 1536 chars is reported', ...)
test('hooks.json that is not valid JSON is reported', ...)
test('hooks.json command pointing to a missing script is reported', ...)
```

- [ ] **Step 4:** Run `npm test` → FAIL (module not found).
- [ ] **Step 5:** Implement `lintPlugin`. Parse frontmatter with a small local parser (lines between the first two `---`, `key: value`, values may be quoted); no YAML library.
- [ ] **Step 6:** Run `npm test` → PASS. Run `claude plugin validate .` if the command exists in the installed version; record the output.
- [ ] **Step 7:** Commit: `chore: scaffold ultimate-claude marketplace and plugin linter`.

### Task 2: Hook libraries — I/O protocol and profile resolution

**Files:**
- Create: `plugins/uc-core/hooks/lib/hook-io.mjs`, `plugins/uc-core/hooks/lib/state.mjs`
- Test: `tests/hook-io.test.mjs`, `tests/state.test.mjs`

**Interfaces:**
- Produces (`hook-io.mjs`):
  - `parseInput(raw: string): object | null` — `null` on empty/invalid JSON.
  - `runHook(handler: (input: object|null) => {exit: 0|2, stderr?: string, stdout?: string}): Promise<void>` — reads all stdin, calls handler, writes streams, sets `process.exitCode`.
- Produces (`state.mjs`):
  - `configBase(env = process.env): string`
  - `safeSessionId(id: unknown): string` — strips everything outside `[A-Za-z0-9_-]`; empty result → `"unknown"`.
  - `readSession(sessionId, env?): {profile?: string, lastEditAt?: string, gateBlockedAt?: string}` — `{}` if missing or malformed.
  - `updateSession(sessionId, patch: object, env?): void` — merge + write, creates dirs.
  - `resolveProfile({sessionId, env = process.env}): 'minimal'|'standard'|'strict'` — order: session file `profile` → `env.UC_PROFILE` → `'standard'`; any value outside the three is ignored.

- [ ] **Step 1: Write failing tests** (each uses a temp dir passed as `CLAUDE_CONFIG_DIR`):

```js
test('parseInput returns null for "" and for "{not json"', ...)
test('safeSessionId("../x") === "x" and safeSessionId("a\\b/c") === "abc"', ...)
test('safeSessionId("") === "unknown"', ...)
test('updateSession then readSession round-trips in a base dir containing a space', ...)
test('readSession returns {} for malformed JSON file', ...)
test('resolveProfile: session file beats env; env beats default', ...)
test('resolveProfile ignores UC_PROFILE="turbo" and returns "standard"', ...)
```

- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement both modules.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit: `feat(uc-core): hook io and session state libraries`.

### Task 3: `block-destructive` hook

**Files:**
- Create: `plugins/uc-core/hooks/block-destructive.mjs`
- Test: `tests/block-destructive.test.mjs`
- If `~/.claude/hooks/block-destructive.sh` exists on this machine, read it first: it is the behaviour to preserve. Do not modify or delete it (removal belongs to Plan 2). If it does not exist, the test table below is the full specification.

**Interfaces:**
- Consumes: `parseInput`, `runHook`.
- Produces: `findDestructive(command: string): string | null` — returns the rule label or `null`. Labels: `"rm -rf"`, `"git reset --hard"`, `"git push --force"`, `"Remove-Item -Recurse -Force"`, `"rd /s /q"`.
- CLI behaviour: input `null` → exit 2 (fail closed); `tool_input.command` matches → exit 2 with stderr `Blocked by uc-core block-destructive: <label>. Ask the user to run it manually if it is really intended.`; otherwise exit 0.

- [ ] **Step 1: Write failing tests** — table-driven:

```js
const blocked = ['rm -rf build', 'rm -fr x', 'rm -r -f x', 'rm --recursive --force x', 'sudo rm -Rf /tmp/x',
  'git reset --hard HEAD~1', 'git -C repo reset --hard', 'git push --force', 'git push -f origin main',
  'git push origin +main', 'Remove-Item -Recurse -Force .\\out', 'Remove-Item out -Force -Recurse',
  'rd /s /q out', 'rmdir /S /Q out'];
const allowed = ['rm -r dir', 'rm -f file.txt', 'git push --force-with-lease', 'git reset --soft HEAD~1',
  'git push origin main', 'Remove-Item file.txt', 'Remove-Item -Recurse out', 'npm run format'];
test('each blocked command returns a label', ...)   test('each allowed command returns null', ...)
test('CLI: empty stdin exits 2', ...)               // spawnSync node hook with input ''
test('CLI: allowed command exits 0, blocked exits 2 with label in stderr', ...)
```

- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement `findDestructive` with case-insensitive regexes for the PowerShell/cmd forms ; for `rm` require both a recursive flag (`-r`, `-R`, `--recursive`) and a force flag (`-f`, `--force`) in any order or combined; for `git push` treat `--force`, a short flag group containing `f`, and a `+refspec` as force, but never `--force-with-lease`.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit: `feat(uc-core): cross-platform block-destructive hook`.

### Task 4: `set-profile` hook (UserPromptSubmit)

**Files:**
- Create: `plugins/uc-core/hooks/set-profile.mjs`
- Test: `tests/set-profile.test.mjs`

**Interfaces:**
- Consumes: `parseInput`, `runHook`, `updateSession`.
- Produces: `detectProfile(prompt: string): 'minimal'|'standard'|'strict'|null` — matches only when the prompt **starts** (after whitespace) with `profil` or `profile`, optional `uc ` prefix, then the profile name, case-insensitive: `/^\s*(?:uc\s+)?profile?\s+(minimal|standard|strict)\b/i`.
- CLI behaviour: on match, `updateSession(session_id, {profile})` and print to stdout `UC profile for this session is now <PROFILE>.` (stdout of UserPromptSubmit is added to context); always exit 0, including on `null` input.

- [ ] **Step 1: Write failing tests:**

```js
test('detectProfile("profil STRICT") === "strict"', ...)
test('detectProfile("  UC profile minimal pentru typo") === "minimal"', ...)
test('detectProfile("explain the strict profile") === null', ...)
test('CLI writes profile into the session file and prints the confirmation', ...)
test('CLI with empty stdin exits 0 and writes nothing', ...)
```

- [ ] **Step 2:** `npm test` → FAIL. **Step 3:** implement. **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit: `feat(uc-core): per-session profile selection hook`.

### Task 5: `profile-gate` hooks (PostToolUse edit tracker + Stop gate)

**Files:**
- Create: `plugins/uc-core/hooks/track-edit.mjs`, `plugins/uc-core/hooks/profile-gate.mjs`, `plugins/uc-core/hooks/lib/verification.mjs`
- Test: `tests/profile-gate.test.mjs`

**Interfaces:**
- Consumes: `resolveProfile`, `readSession`, `updateSession`, `runHook`.
- Produces (`verification.mjs`): `latestPassAt(projectDir: string): string | null` — scans `<projectDir>/.uc/verification/*.json`; a file counts only if it parses and has `verdict === "PASS"` and an ISO `at`; returns the newest `at`.
- Verification file schema (written by the `release-gate` agent, Task 7): `{"verdict": "PASS"|"FAIL", "at": "<ISO 8601>", "checks": [{"command": string, "exitCode": number, "summary": string}], "unverified": string[]}`.
- Produces (`profile-gate.mjs`): `shouldBlock({profile, lastEditAt, latestPassAt, stopHookActive, gateBlockedAt}): boolean` — true only if `profile === 'strict'` AND `lastEditAt` set AND (`latestPassAt` is null OR `latestPassAt < lastEditAt`) AND NOT `stopHookActive` AND NOT (`gateBlockedAt >= lastEditAt`).
- `track-edit.mjs` CLI: `updateSession(session_id, {lastEditAt: new Date().toISOString()})`, exit 0 always.
- `profile-gate.mjs` CLI: when `shouldBlock`, `updateSession(session_id, {gateBlockedAt: now})`, stderr `STRICT profile: files changed after the last PASS verification. Run the release-gate agent, or state in the delivery report what remains unverified.`, exit 2. Otherwise exit 0. `projectDir` = `input.cwd`.

- [ ] **Step 1: Write failing tests:**

```js
test('standard and minimal never block', ...)
test('strict + edit + no verification → block', ...)
test('strict + PASS newer than edit → no block', ...)
test('strict + PASS older than edit → block', ...)
test('stopHookActive true → no block', ...)
test('already blocked once since the last edit → no block', ...)
test('latestPassAt ignores malformed JSON and verdict FAIL', ...)
test('latestPassAt returns null when .uc/verification is missing', ...)
test('CLI flow: track-edit then profile-gate exits 2 once, then 0', ...)  // strict via UC_PROFILE env
```

- [ ] **Step 2:** `npm test` → FAIL. **Step 3:** implement the three files. **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit: `feat(uc-core): strict-profile verification gate`.

### Task 6: `hooks.json` wiring

**Files:**
- Create: `plugins/uc-core/hooks/hooks.json`
- Test: `tests/hooks-json.test.mjs`

**Interfaces:**
- Consumes: the four CLI scripts from Tasks 3–5.
- Wiring (command form `node "${CLAUDE_PLUGIN_ROOT}/hooks/<file>.mjs"`):
  - `PreToolUse`, matcher = Bash tool and the PowerShell tool (exact names from the docs) → `block-destructive.mjs`
  - `UserPromptSubmit` → `set-profile.mjs`
  - `PostToolUse`, matcher `Edit|Write|NotebookEdit` → `track-edit.mjs`
  - `Stop` → `profile-gate.mjs`

- [ ] **Step 1: Write failing test:** every `command` in `hooks.json` references an existing file under `plugins/uc-core/hooks/`; the four events above are present; `lintPlugin('plugins/uc-core')` returns `[]`.
- [ ] **Step 2:** FAIL → write `hooks.json` → PASS.
- [ ] **Step 3:** Commit: `feat(uc-core): register hooks`.

### Task 7: Agents

**Files:**
- Create: `plugins/uc-core/agents/architect.md`, `code-reviewer.md`, `qa-engineer.md`, `release-gate.md`
- Test: `tests/agents.test.mjs`

**Interfaces:**
- Produces: agent names `architect`, `code-reviewer`, `qa-engineer`, `release-gate` (used by skills in Task 8 and by later plans).

Frontmatter decisions (bodies are prose the implementer writes from spec §5.2; each body ≤ 80 lines):

| Agent | model / effort | tools | Body must contain |
|---|---|---|---|
| `architect` | `opus` / `high` | Read, Grep, Glob, Write, Edit, WebFetch, Skill | explore 2–3 candidate architectures; compare on the eight Intelligent Complexity criteria (scalability, maintainability, reliability, security, performance, extensibility, UX, testability); recommend one; write an ADR to `docs/adr/NNNN-<slug>.md`; use the `codebase-design` and `domain-modeling` skills when available; never write product code; writes only under `docs/` |
| `code-reviewer` | `opus` / `high` | Read, Grep, Glob, Bash | independent review of a diff or branch against the spec and ADRs: correctness bugs first, then maintainability; each finding = file:line, failure scenario, severity; read-only (Bash only for `git diff/log/show` and running tests); no style nitpicks; says explicitly when nothing serious is found |
| `qa-engineer` | `inherit` / `high` | Read, Grep, Glob, Bash, Write, Edit | risk-proportional test strategy, edge cases, coverage gaps; may add tests under the project's test dirs only; runs the suite and reports real output |
| `release-gate` | `inherit` / `medium` | Read, Grep, Glob, Bash, Write | read acceptance criteria from the spec/plan; run each verification command; write `.uc/verification/<UTC timestamp>.json` in the Task 5 schema; verdict PASS only if every criterion has evidence; list what could not be verified on this machine; writes nothing else |

- [ ] **Step 1: Write failing test:** for each of the four files — frontmatter has `name` equal to the filename, non-empty `description`, `tools`, `model`; `release-gate.md` body contains `.uc/verification/` and the four schema keys `verdict`, `at`, `checks`, `unverified`; `lintPlugin` returns `[]`.
- [ ] **Step 2:** FAIL → write the four agents → PASS.
- [ ] **Step 3:** Commit: `feat(uc-core): architect, code-reviewer, qa-engineer, release-gate agents`.

### Task 8: Skills

**Files:**
- Create: `plugins/uc-core/skills/{complexity-check,product-discovery,delivery-report,uc-profile}/SKILL.md`
- Test: `tests/skills.test.mjs`

**Interfaces:**
- Consumes: agent names from Task 7; profile semantics from spec §7.

Content decisions (each SKILL.md ≤ 120 lines):

| Skill | description trigger | Must contain |
|---|---|---|
| `complexity-check` | when choosing between a simpler and a more elaborate design, or when YAGNI/simplicity is cited as a reason | "simplicity and YAGNI are decision tools, not prohibitions"; the eight criteria; a justification test (name the concrete requirement, failure, or change the added structure serves, and its cost); an explicit "not justified" list (speculative generality with no named driver); output = a 3–6 line decision record |
| `product-discovery` | before brainstorming a new product, app or major feature | who the user is, the problem, what they do today, success criterion, smallest valuable version, what would make it fail; hands off to `superpowers:brainstorming`; never replaces it |
| `delivery-report` | at the end of STANDARD/STRICT work, before claiming done | sections: Done · Verified (command + result) · Not verified and why · Decisions made · Follow-ups; in STRICT, cites the latest `.uc/verification/*.json` |
| `uc-profile` | when the user asks about or switches MINIMAL/STANDARD/STRICT | the §7 table; how to switch (`profil strict` as the first words of a prompt, project `env.UC_PROFILE`, or the `uc` launcher); what the gate enforces; `disable-model-invocation` not set |

- [ ] **Step 1: Write failing test:** four skills exist; `name` equals directory; description+when_to_use ≤ 1536 chars; `complexity-check` body contains all eight criteria words; `delivery-report` contains `Not verified`; `lintPlugin` returns `[]`.
- [ ] **Step 2:** FAIL → write skills → PASS.
- [ ] **Step 3:** Commit: `feat(uc-core): complexity-check, product-discovery, delivery-report, uc-profile skills`.

### Task 9: Profiles, launchers, lockfile, ADR, first push

**Files:**
- Create: `plugins/uc-core/profiles/{minimal,standard,strict}.json`, `bin/uc.ps1`, `bin/uc`, `components.lock.json`, `docs/adr/0001-plugins-in-private-marketplace.md`, `docs/adr/0002-node-hooks-and-installer.md`
- Test: `tests/profiles-lock.test.mjs`

**Interfaces:**
- Produces: each profile file is `{"env": {"UC_PROFILE": "<name>"}}`. Launchers: `uc <minimal|standard|strict> [claude args…]` → `claude --settings <repo>/plugins/uc-core/profiles/<name>.json <args>`; unknown profile → usage text, exit 1.
- `components.lock.json`: `{"schema": 1, "components": [ … ]}`; each entry has exactly `name`, `source`, `version`, `license`, `scope` (`global|project`), `default` (bool), `install`, `uninstall`, `verify`, `bringsHooks` (bool), `bringsMcp` (bool), `alwaysOnTokens` (`null` until measured). Entries and versions come from spec §5.5 and Annex A; `default: false` for Planning with Files, Graphify, Ponytail, mcp-server-excel. `install`/`uninstall`/`verify` strings are copied from each project's current README — fetch it; do not write commands from memory. A command that could not be confirmed is the string `"UNVERIFIED"`.

- [ ] **Step 1: Write failing test:** three profile files parse and set the matching `UC_PROFILE`; lockfile parses, every entry has all twelve keys, names are unique, the four opt-in components have `default === false`; no `install` string contains `@latest` or `curl` piped to a shell.
- [ ] **Step 2:** FAIL → write files → PASS. Run `pwsh -NoProfile -File bin/uc.ps1 bogus` only if `pwsh` exists; otherwise note "uc.ps1 untested on this machine".
- [ ] **Step 3:** Write the two ADRs (context, decision, alternatives from spec §4 and §12, consequences).
- [ ] **Step 4:** Commit: `feat: profiles, launchers, component lockfile, ADRs`.
- [ ] **Step 5 (needs the user's yes):** `gh repo create ultimate-claude --private --source . --push`.

### Task 10: Live verification on the current machine (no global config changes)

**Files:**
- Create: `docs/verification/uc-core-<os>.md`

- [ ] **Step 1:** `npm test` and `node scripts/lint-plugin.mjs plugins/uc-core` → all green; paste the summaries into the verification doc.
- [ ] **Step 2:** In a scratch git repo, start `claude --plugin-dir "<repo>/plugins/uc-core"` (ask the user to run it if it must be interactive) and record: (a) the four agents and four skills are listed; (b) a prompt starting with `profil strict` produces the confirmation line and the session file; (c) an edit followed by stopping is blocked once with the STRICT message; (d) `rm -rf x` is blocked; (e) whether the `architect` agent can use the user-scope `codebase-design` skill — if not, record it and keep the body instruction as the fallback.
- [ ] **Step 3:** Ask the user for `/context all` from that session; record the tokens added by `uc-core` (skill descriptions + agent descriptions). This becomes the baseline budget.
- [ ] **Step 4:** Record what stayed unverified: the other operating system (on macOS: hooks under Git Bash/PowerShell and `uc.ps1`; on Windows: `bin/uc`), and desktop-app behaviour if only the terminal was tested.
- [ ] **Step 5:** Commit: `docs: uc-core verification`.

---

## Self-review notes

- Spec coverage for this plan's scope: §5.1 repo (T1, T9), §5.2 agents (T7), skills (T8), hooks (T3–T6), §7 profiles and verification proof (T4, T5, T9), lockfile §5.5 (T9), ADRs (T9). `database-reviewer` belongs to `uc-web` (Plan 3). CLAUDE.md block, RTK removal and moving the old hook belong to Plan 2. Installer = Plan 5.
- The design said the `uc-profile` skill writes the session marker; this plan uses a deterministic `UserPromptSubmit` hook instead (a skill cannot reliably know `session_id`). The skill only explains.
