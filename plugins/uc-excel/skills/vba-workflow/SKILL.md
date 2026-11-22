---
name: vba-workflow
description: The fixed order of work for any change to Excel VBA code kept as text sources - back up the workbook, edit only the sources, lint, build, compile check, tests, user documentation, then the VBA review. Commands come from the project's CLAUDE.md.
when_to_use: Use before and while changing VBA sources (.bas, .cls) or anything that builds an Excel workbook (.xlsm, .xlsb, .xlam), in every profile, including MINIMAL-sized fixes. Also use when the workbook-guard hook reports a missing backup.
---

# VBA workflow

In these projects the VBA code lives as text in git and the workbook is built from it. Every change follows the same
seven steps, in order, whatever the profile: a one-line fix in a macro still gets built, compiled and tested. The
project's `CLAUDE.md` gives the exact commands; this skill gives the order and what each step must prove.

## The seven steps

1. **Backup.** Before anything can write a workbook (a build, a copy, an import), copy the current file to
   `backups/<base name>.<YYYYMMDD-HHMMSS><ext>`, for example
   `backups/Robot SAP v3.20261117-143005.xlsm`. The `workbook-guard` hook checks for this backup in the current
   session; in STRICT it blocks a workbook write without one.
2. **Edit the sources, never directly the workbook.** Change only the `.bas` and `.cls` files (and the project's
   build inputs). A change made inside an `.xlsm` is lost at the next build and is not in git.
3. **Lint.** Run the project's VBA linter. Fix what it reports before going on.
4. **Build.** Build only the variant the project declares as the deliverable (its `CLAUDE.md` names it). A build that
   fails stops the workflow.
5. **Compile check.** Run the project's compile check on the built workbook. A syntax or compile error stops the
   workflow. A check that only reads the workbook belongs in the project's `UC_EXCEL_READ_ONLY` setting, so the
   `workbook-guard` hook does not treat it as a write.
6. **Tests.** Run every existing test. New behaviour gets a new test; tests whose expected behaviour changed are
   updated, never weakened to pass. Write tests following superpowers:test-driven-development when it is installed.
7. **User documentation.** Update the single user documentation file the project names (for example `GHID.md`).
   Do not create or maintain a second file that says the same thing.

When the project has one command that runs steps 3 to 6 (for example `tools/verifica.sh`), use it and read its
whole output.

## After the seven steps

- Run the `excel-vba-reviewer` agent on the change, in every profile.
- Then the review the session profile asks for: nothing more in MINIMAL; in STANDARD and STRICT the Superpowers code
  review where applicable. Add uc-core conformance review for a named contract, ADR or compatibility obligation.
  The VBA reviewer's report goes to that review.
- The delivery report lists the commands of steps 3 to 6 with their real results.

## What "verified" means here

Lint, build, compile check and tests, run on this machine after the last edit. For a contract that requires native Windows Excel or SAP, the user or authorized tester supplies that evidence.
Until then, mark the criterion unverified and keep the release gate open.

## Rules

- Never open, run or automate Excel or SAP.
- Never put real business data in fixtures or tests; use anonymised values.
- Never lower the macro security of LibreOffice or Excel to make a check pass.
- If a step cannot run (a tool is missing), stop and say which step and why; do not skip to the next one.
