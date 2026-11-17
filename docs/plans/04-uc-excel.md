# uc-excel (Plan 4 of 6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `uc-excel` plugin (VBA reviewer, fixed VBA workflow, workbook backup guard, project template) and put
`Robot SAP` on it: sources in git, build and all tests running on this Mac.

**Architecture:** `uc-excel` is a second plugin in the `ultimate-claude` marketplace, depending on `uc-core`. Its hook
reuses uc-core's two hook libraries as byte-identical copies (a plugin is installed alone, so it cannot import files of
another plugin). The build and test toolchain stays inside `Robot SAP/tools/`; uc-excel only reads its commands from
the project's `CLAUDE.md`.

**Tech Stack:** Node.js ≥ 22 (`node:test`, no dependencies); Python 3 + `openpyxl`, `olefile`, `oletools` in a project
venv; LibreOffice (Homebrew cask) with its bundled Python for UNO; Claude Code 2.1.311.

**Spec:** `docs/DESIGN.md` §5.4 (approved 2026-11-17), §7, §12 (uc-core/Superpowers roles). Robot SAP facts:
`robot_sap_src/REZUMAT_PROIECT.md` and `robot_sap_src/tools/README.md` inside `Robot SAP/Robot_SAP_proiect_v3.10.zip`.

## Global Constraints

- Two repos: `ultimate-claude` (Tasks 1–5, 9) and `Robot SAP` = `/Users/iulianpetcu/Documents/AI is the future/Robot SAP`
  (Tasks 6–8). Paths contain spaces: always quote them.
- uc-excel: Node ≥ 22, zero npm dependencies, `.mjs`, macOS and Windows safe (`node:path`, `node:os`).
- Profiles: MINIMAL and STANDARD warn, STRICT blocks (DESIGN §5.4). `excel-vba-reviewer` uses `model: inherit`.
- Robot SAP rules (from `REZUMAT_PROIECT.md`): no real business data in fixtures; never write passwords; do not lower
  LibreOffice macro security; messages and comments in the VBA stay Romanian without diacritics.
- Python scripts stay runnable where they ran before: every Mac-specific path has a fallback to the old behaviour.
- Installing LibreOffice and the Python packages was requested by the user; nothing else is installed.
- Backup naming used by the skill and checked by the hook: `backups/<workbook base name>.<YYYYMMDD-HHMMSS><ext>`.
- Commit only when the full test command of that repo passes (`npm test`; in Robot SAP `tools/verifica.sh`).

## Review Focus

1. A workbook path with spaces inside quotes (`cp a.xlsm "livrabile/Robot SAP v3.xlsm"`) → the guard sees the whole
   path (Task 2 test).
2. A backup older than the session start → does not count (Task 2 test).
3. Read-only commands on a workbook (`unzip -l`, `zipinfo`, `shasum`, `cmp`, `ls`) → no warning, no block (Task 2 test).
4. Tests run while the user has LibreOffice open → their window and their profile are not touched (Task 7: isolated
   profile, no `pkill`; checked by opening LibreOffice before the run).
5. Missing venv or LibreOffice → `tools/verifica.sh` stops with one readable line, not a traceback (Task 7 check).

---

### Task 1: uc-excel scaffold and marketplace entry

**Files:** Create `plugins/uc-excel/.claude-plugin/plugin.json`; modify `.claude-plugin/marketplace.json`; test
`tests/uc-excel-manifest.test.mjs`.

- [ ] **Step 1: Failing tests:** `marketplace lists uc-excel at ./plugins/uc-excel`; `uc-excel depends on uc-core`
  (`dependencies` equals `["uc-core"]`); `lintPlugin('plugins/uc-excel')` returns `[]`.
- [ ] **Step 2:** `npm test` → FAIL. **Step 3:** write the manifest (name `uc-excel`, version `0.1.0`, description,
  author `ultimate-claude`, license `UNLICENSED`, dependencies) and the marketplace entry. **Step 4:** PASS;
  `claude plugin validate .` and `claude plugin validate plugins/uc-excel` → passed. **Step 5:** commit
  `feat(uc-excel): plugin scaffold`.

### Task 2: `workbook-guard` and session-start hooks

**Files:** Create `plugins/uc-excel/hooks/{hooks.json,session-start.mjs,workbook-guard.mjs}`,
`plugins/uc-excel/hooks/lib/{hook-io.mjs,state.mjs}` (copies); test `tests/workbook-guard.test.mjs`.

**Interfaces:**
- `session-start.mjs` CLI: `updateSession(session_id, {startedAt: now})` only when `startedAt` is missing; exit 0.
- `workbookTargets(toolName: string, toolInput: object): string[]` — workbook paths (`.xlsm|.xlsb|.xlam`, any case) the
  call may write. Write/Edit/NotebookEdit: `file_path` / `notebook_path`. Bash/PowerShell: tokenise the command with
  quotes respected, split on `; && || |`; per segment: read-only first words (`ls`, `zipinfo`, `shasum`, `md5`, `cmp`,
  `diff`, `file`, `stat`, `unzip` with `-l`/`-p`/`-v`/`-t`) → none; `cp`, `rsync` → the last argument only; a `>`/`>>`
  redirect target → that path; anything else (`mv`, `rm`, scripts) → every workbook path in the segment.
- `hasFreshBackup(workbook: string, projectDir: string, startedAt: string|undefined): boolean` — true when
  `<projectDir>/backups/` holds a file named `<base>.<YYYYMMDD-HHMMSS><ext>` with mtime ≥ `startedAt`;
  `startedAt` missing → only backups from the last 12 hours count.
- `workbook-guard.mjs` CLI: targets without a fresh backup → STRICT: exit 2, stderr `uc-excel workbook-guard: back up
  <file> to backups/ first (vba-workflow step 1).`; MINIMAL/STANDARD: exit 0 with the same text as a non-blocking
  warning to Claude, in the form `code.claude.com/docs/en/hooks.md` documents for PreToolUse (check before writing;
  note the form used in the commit). Null input → exit 0.
- hooks.json: `SessionStart` → session-start; `PreToolUse` matcher `Write|Edit|NotebookEdit|Bash|PowerShell` → guard.

- [ ] **Step 1: Failing tests:**
```js
test('lib copies are byte-identical to uc-core', ...)
test('Write to a .xlsm is a target; Write to a .bas is not', ...)
test('quoted path with spaces is one target: cp a.xlsm "livrabile/Robot SAP v3.xlsm"', ...) // only the destination
test('read-only commands are not targets', ...)       // unzip -l, zipinfo, shasum, cmp, ls on "X.xlsm"
test('mv, rm, redirect and python script arguments are targets', ...)
test('backup older than startedAt does not count; newer does; wrong name does not', ...)
test('CLI: strict blocks without backup, passes with fresh backup; standard warns and exits 0', ...)
test('session-start keeps the first startedAt', ...)
```
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS; lint `plugins/uc-excel` → OK. **Step 5:** commit
  `feat(uc-excel): workbook backup guard`.

### Task 3: `excel-vba-reviewer` agent and `vba-workflow` skill

**Files:** Create `plugins/uc-excel/agents/excel-vba-reviewer.md`, `plugins/uc-excel/skills/vba-workflow/SKILL.md`;
test `tests/uc-excel-content.test.mjs`.

- [ ] **Step 1: Failing tests:** agent frontmatter `name`, `description`, `tools` (Read, Grep, Glob, Bash), `model:
  inherit`; body ≤ 80 lines, contains `ScreenUpdating`, `On Error`, `ActiveSheet`, `confidence`, `APPROVE`, `BLOCK`,
  `rtk bypass <command>`, does not contain `64-bit`; skill name equals directory, listing ≤ 1536 chars, ≤ 120 lines,
  contains the seven steps in order (`backups/`, `never directly`, `lint`, `build`, `compil`, `tests`, `GHID`/
  `user documentation`), `CLAUDE.md` (commands come from there), `excel-vba-reviewer`, and states that Excel or SAP
  behaviour on Windows is the user's check, not a criterion.
- [ ] **Step 2:** FAIL. **Step 3:** write both from DESIGN §5.4. The agent checks only the four VBA categories, reports
  like uc-core `code-reviewer` (file:line, severity, confidence ≥ 80, verdict) and says its report goes to the
  conformance review; read-only. The skill: the seven steps, the backup naming rule, MINIMAL included, then the
  reviewer, then Superpowers review and `code-reviewer`. **Step 4:** PASS. **Step 5:** commit
  `feat(uc-excel): VBA reviewer and workflow`.

### Task 4: `excel-vba` template

**Files:** Create `plugins/uc-excel/templates/excel-vba/{CLAUDE.md,.claude/settings.json,.gitignore}`; extend
`tests/uc-excel-content.test.mjs`.

- [ ] **Step 1: Failing tests:** `settings.json` parses and has `enabledPlugins` true for `uc-core@ultimate-claude` and
  `uc-excel@ultimate-claude`, `env.UC_PROFILE === "standard"`; `.gitignore` contains `backups/`; `CLAUDE.md` has the
  sections `## What this is`, `## Commands` (lint, build, compile check, tests, full check), `## User documentation`,
  `## Rules`.
- [ ] **Step 2:** FAIL. **Step 3:** write the three files with placeholders in angle brackets. **Step 4:** PASS.
  **Step 5:** commit `feat(uc-excel): project template`.

### Task 5: lockfile, structure, design record

**Files:** Modify `components.lock.json`, `tests/profiles-lock.test.mjs`, `STRUCTURE.md`.

- [ ] **Step 1: Failing test:** lockfile has no `xlflow`, `xlwings`, `pester`, `psscriptanalyzer`, `mcp-server-excel`;
  has `libreoffice`, `openpyxl`, `olefile`, `oletools`, each `scope: "project"`.
- [ ] **Step 2:** FAIL. **Step 3:** edit entries; versions are the ones Task 6 installs (do Task 6 first if needed);
  install strings: `brew install --cask libreoffice` (version recorded, not pinnable by the cask), `pip install
  <pkg>==<ver>` inside the project venv. STRUCTURE: uc-excel tree as built; drop Pester harness and Windows-only notes.
  **Step 4:** PASS. **Step 5:** commit `chore: lockfile and structure for uc-excel`.

### Task 6: Mac toolchain (Robot SAP)

**Files:** Create `Robot SAP/tools/requirements.txt`; creates `Robot SAP/.venv/` (ignored).

- [ ] **Step 1:** `brew install --cask libreoffice`; record `soffice --version` (or the app's version) and the path of
  LibreOffice's bundled Python (`/Applications/LibreOffice.app/Contents/Resources/python`); check it runs
  `import uno`.
- [ ] **Step 2:** `python3 -m venv .venv`; `.venv/bin/pip install openpyxl olefile oletools`; write the exact installed
  versions to `tools/requirements.txt` as `==` pins; check `.venv/bin/python -c "import openpyxl, olefile, oletools"`.

### Task 7: Robot SAP repository and Mac-ready tests

**Files (Robot SAP repo):** extract `robot_sap_src/{vba,tools,livrabile}` to the repo root; create `CLAUDE.md` from
`REZUMAT_PROIECT.md` plus the template sections; `.gitignore`; `.claude/settings.json` (merge with the existing one);
modify `tools/test_interpretor_util.py`, `tools/unocheck.py`, the seven `tools/test_*.py`; create `tools/verifica.sh`.

- [ ] **Step 1:** Extract into a scratch folder first, compare, then copy into the repo. The root `GHID.md` (older copy
  of `livrabile/GHID.md`) and root `Robot SAP v3.10.xlsm` (same SHA-1 as `livrabile/Robot SAP v3.10.xlsm`) move to
  `backups/`; the zip and `Pasted *.textClipping` stay, ignored.
- [ ] **Step 2:** `.gitignore`: `backups/`, `.venv/`, `*.zip`, `.DS_Store`, `*.textClipping`, `tools/.lo-profile/`,
  `tools/vbaProject_fl.bin`, `livrabile/Robot SAP v3.xlsm` (the build output). Released `livrabile/*.xlsm` are tracked.
- [ ] **Step 3: RED:** run one test as it is (`.venv/bin/python tools/test_licenta.py`) → fails on this Mac
  (`timeout` missing / `uno` not importable). Record the error.
- [ ] **Step 4:** in `test_interpretor_util.py` add `lo_python() -> str` (env `LO_PYTHON`, else the macOS app path if
  present, else `python3`), `profil_lo() -> str` (`tools/.lo-profile`, passed to soffice as
  `-env:UserInstallation=file://...`), `LIB` inside that profile (created on first use), and
  `ruleaza_uno(scr_dir: str, target: str, secunde: int = 150) -> subprocess.CompletedProcess` using
  `subprocess.run(..., timeout=secunde)`; remove the `pkill`. Each `test_*.py` calls `ruleaza_uno` instead of
  `['timeout', '150', 'python3', ...]`. `unocheck.py` uses the same profile and is run with `lo_python()`.
- [ ] **Step 5:** `tools/verifica.sh`: stop with one line if `.venv` or LibreOffice is missing; activate `.venv`; run
  `build_all.sh`; run the compile check `unocheck.py "../livrabile/Robot SAP v3.xlsm" "Tema.Sym(65)" Flux.InRulare`
  (any `SYNTAX?` line fails); run the seven tests; exit non-zero on the first failure.
- [ ] **Step 6: GREEN:** with a LibreOffice window open, run `tools/verifica.sh` → build OK, compile OK, 7/7 tests OK,
  and the window is still open.
- [ ] **Step 7:** `CLAUDE.md` (≤ 80 lines): what it is, the commands (`tools/verifica.sh` = full check), GHID.md as the
  single user documentation, the REZUMAT rules. `.claude/settings.json`: `enabledPlugins` for `uc-core`,
  `security-guidance` (already there) and `uc-excel`; `env.UC_PROFILE = "standard"`. `claude plugin install
  uc-excel@ultimate-claude --scope project`. Commit `chore: sources in git, Mac toolchain, uc-excel` in Robot SAP.

### Task 8: Live check in Robot SAP

- [ ] **Step 1:** headless session in Robot SAP (`claude -p --model haiku`): lists `uc-excel:excel-vba-reviewer` and
  `uc-excel:vba-workflow`.
- [ ] **Step 2:** in a scratch copy with `UC_PROFILE=strict`: a `cp` onto a `.xlsm` without backup is blocked with the
  guard's message; after a backup in `backups/`, it passes.

### Task 9: Verification record

- [ ] Write `docs/verification/uc-excel-macos.md` (ultimate-claude): versions installed, `npm test`, lint, validate,
  `verifica.sh` summary, live checks, what stays unverified (Windows/Excel/SAP behaviour — the user's check; whether
  the compile check covers every module). Commit; push both repos only with the user's yes.
