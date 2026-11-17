# uc-excel verification on macOS

Date: 2026-11-17. Plan: `docs/plans/04-uc-excel.md`. Machine: macOS 27.2.1 (arm64, M1), Claude Code 2.1.311,
Node v26.13.1, Homebrew Python 3.15.2. Executed inline on `main` in both repos.

## Installed (Task 6)

| Component | Version | Where |
|---|---|---|
| LibreOffice | 26.8.3.1 (`brew install --cask libreoffice`) | `/Applications/LibreOffice.app`, `soffice` in `/opt/homebrew/bin` |
| openpyxl / olefile / oletools | 3.1.5 / 0.47 / 0.60.2 | `Robot SAP/.venv`, pinned in `tools/requirements.txt` |

## Checks

| Check | Result |
|---|---|
| `npm test` (ultimate-claude) | 117 passed, 0 failed |
| `node scripts/lint-plugin.mjs plugins/uc-excel` | `OK: plugins/uc-excel` |
| `claude plugin validate .` and `plugins/uc-excel` | `Validation passed` |
| `tools/verifica.sh` (Robot SAP) | lint "nicio problema gasita"; build OK; compile check: `Flux.InRulare` OK, `Tema.Sym` LO-LIPSA; 7/7 tests "TOATE TESTELE AU TRECUT" (160 checks); exit 0 in 1 min 34 s |
| Mac build reproduces the archived build | `tools/vbaProject_v3.bin` and `vba/EditorPasi.bas` byte-identical to `Robot_SAP_proiect_v3.10.zip` |
| Tests leave the user's LibreOffice alone | LibreOffice opened first (pid 37313); `test_pasi_livrati.py` passed; the app was still running afterwards |
| Live: Robot SAP session (`claude -p`, project-scope plugins) | lists `uc-excel:excel-vba-reviewer`, `uc-excel:vba-workflow` and the uc-core agents and skills |
| Live: STRICT guard (scratch repo, `--plugin-dir` for security-guidance, uc-core, uc-excel) | `cp a.xlsm "Book 1.xlsm"` blocked with "uc-excel workbook-guard: back up Book 1.xlsm to backups/ first (vba-workflow step 1)."; the backup `cp -p … "backups/Book 1.<ts>.xlsm"` allowed; the same `cp` allowed afterwards; `shasum`/`ls` untouched |

## Found and fixed during execution

- **LibreOffice's Python cannot run from a terminal on this macOS** (`SIGKILL (Code Signature Invalid)`, "Launch
  Constraint Violation"; the crash reports the user saw came from these attempts). The Robot SAP tests and the compile
  check no longer use Python UNO: they run Basic macros through `soffice --headless "macro:///…"` in a separate profile
  (`tools/.lo-profile`). This also removed GNU `timeout` and `pkill soffice.bin`.
- **LibreOffice 26.8.3 lacks three Excel constants** used in `vba/` (`msoAutoSizeNone`, `msoAlignCenter`,
  `vbObjectError`; 56 probed). `unocheck.py` reports them as `LO-LIPSA` from `tools/lo_constante_lipsa.txt`; any other
  "Variable not defined" now fails the check (before, it was reported as runtime and passed).
- **workbook-guard blocked the backup itself in STRICT** (the backup is also a `.xlsm`) and asked for backups of
  workbooks that did not exist yet. Now only existing workbooks outside `backups/` need a backup.
- **A `cp -p` backup looked old** (it keeps the source's modification time), so STRICT kept blocking after a backup.
  Freshness now uses the later of mtime and ctime.

## Not verified

- Windows, Excel and SAP: running the built workbook is the user's check (DESIGN §5.4), not an acceptance criterion.
- Compile coverage: LibreOffice compiles a module only when one of its procedures is called. The check calls
  `Tema.Sym` and `Flux.InRulare`; other modules are compiled only as far as the tests load them. `Tema` stops at the
  first LibreOffice-missing constant, so the rest of `Tema` is not compile-checked here.
- `workbook-guard` on Windows (PowerShell commands): unit tests cover Bash-style commands; PowerShell `Copy-Item`
  calls are treated as "every workbook path is a target" and were not run live.
- The guard cannot see workbooks written by scripts that do not name them (`build_all.sh`); `tools/verifica.sh` and the
  `vba-workflow` skill make that backup.
- Desktop app: the live checks ran in headless terminal sessions.
- Testing uc-core or uc-excel with `--plugin-dir` alone fails silently: uc-core depends on security-guidance and is
  disabled when that plugin is missing (seen in `claude --debug`). Installed plugins pull the dependency in.
