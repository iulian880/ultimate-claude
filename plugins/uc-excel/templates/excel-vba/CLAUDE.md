# <Project name>

## What this is
<One paragraph: what the workbook does, who uses it, on which systems it runs.>
VBA code lives as text in `<sources dir>/` (`.bas`, `.cls`); the workbook is built from it. Follow the
`uc-excel:vba-workflow` skill for every code change.

## Commands
- Lint: `<command>`
- Build (deliverable only: `<deliverable name>`): `<command>`
- Compile check: `<command>`
- Tests: `<command>`
- Full check (lint, build, compile check, tests): `<command>`
- Backups go to `backups/<base name>.<YYYYMMDD-HHMMSS><ext>` before any workbook write.
- Tools that only read the workbook (for example the compile check script) are listed, comma-separated, in
  `env.UC_EXCEL_READ_ONLY` in `.claude/settings.json`, so the backup guard does not treat them as writes.

## User documentation
`<file>` is the single user guide. Update it with every change users can notice; do not keep a second copy.

## Rules
- Edit only the sources, never the built workbook.
- No real business data in fixtures or tests; never write passwords to files.
- Do not lower macro security to make a check pass.
- When the contract requires native Windows Excel or SAP, record the native result separately. Keep that criterion unverified until the evidence is available.
