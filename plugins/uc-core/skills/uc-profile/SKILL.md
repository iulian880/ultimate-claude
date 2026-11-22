---
name: uc-profile
description: Explains the three uc-core rigor profiles (MINIMAL, STANDARD, STRICT) - what each one requires, which profile is active, how to switch, and what the STRICT verification gate enforces.
when_to_use: Use when the user asks about or switches the MINIMAL, STANDARD or STRICT profile, asks which profile is active, or asks why a stop was blocked with a "STRICT profile" message.
---

# UC profiles

A profile sets how much verification the work gets. It does not limit how carefully you think, and it does
not turn plugins on or off.

## The three profiles

| | MINIMAL | STANDARD (default) | STRICT |
|---|---|---|---|
| When | Local, reversible, immediately observable | Product behaviour with a representative test | Data, money, migrations, compatibility or irreversible effects |
| Process | Execute directly and check once | Execution chosen per plan; reproduce bugs first; plan when uncertainty warrants it | Use an architect between brainstorming and writing-plans for costly design decisions; QA for significant failure modes |
| Review | One focused check | Use Superpowers reviews if available or one combined review; add conformance before finishing the branch only for a named contract, ADR or compatibility obligation | Independent release-gate and the relevant domain checks |
| Enforced by hooks | `block-destructive` (+ `workbook-guard` warns) | `block-destructive` (+ `workbook-guard` warns) | `block-destructive` + the verification gate (+ `workbook-guard` blocks) |

The process and review rows are guidance that you follow. Only the last row is enforced by hooks.

## Which profile is active

The hooks resolve the profile in this order:

1. the session marker `<config dir>/uc/sessions/<session_id>.json`, written when a prompt starts with a
   profile command (see below);
2. `UC_PROFILE` in the environment, usually set by the project in `.claude/settings.json`;
3. otherwise STANDARD.

`<config dir>` is `CLAUDE_CONFIG_DIR` when it is set, otherwise `~/.claude`. A value other than `minimal`,
`standard` or `strict` is ignored.

For status in Desktop, run `node "${CLAUDE_PLUGIN_ROOT}/hooks/cli.mjs" status` from the project;
supply `--session ID` when the session ID is available. Use the confirmed session switch if the shell lacks that ID.
The CLI reports the source, local component inventory and current proof. An unknown component stays unknown.

A single invoice calculation can need STRICT; ten mechanical renames can be MINIMAL. Honour explicit STRICT.
Use inline execution for coupled changes. Delegate independent work when context isolation earns its cost;
give the agent its scope, criteria and evidence expected. Agent teams stay off by default.
Get the user's agreement before a separately billed batch. For long handoffs preserve decisions,
remaining criteria, evidence and the next action. Global personal rules can be updated independently.

## How to switch

- **For this session:** the user starts a prompt with `profil strict` (or `profile strict`, `uc profile minimal`,
  and so on). The words must be the first words of the prompt. A hook stores the choice and confirms with
  "UC profile for this session is now STRICT.". If the first line ends with "?" (a question about a profile), nothing
  is switched unless the name is followed by a period or a colon: `profil strict. Why is the gate blocking?`.
  You cannot switch the profile yourself: when the user asks
  for a switch in the middle of a sentence, ask them to send `profil <name>` as its own prompt.
- **For a project:** add this to the project's `.claude/settings.json`, then start a new session:

  ```json
  { "env": { "UC_PROFILE": "strict" } }
  ```

- **From a terminal:** `uc strict` (or `uc minimal`, `uc standard`) starts Claude Code with that profile.
  The launchers are `bin/uc` and `bin/uc.ps1` in the ultimate-claude repository.

## What the STRICT gate enforces

- When the session enters STRICT, a hook records a fingerprint of the code (in a git project: everything git would
  commit, excluding `.uc/` folders, `.claude/agent-memory/`, design documents - `docs/superpowers/`, `docs/specs/`,
  `docs/plans/`, `docs/adr/`, `GLOSSARY.md`, `GLOSSARY-MAP.md` - and worktree folders). Edits made with any tool,
  Bash and scripts included, change it. If the session already edited files before it switched to STRICT, the start
  is unknown and any stop needs a PASS. Bash-only edits made before the switch are not seen: start the session in
  STRICT to cover them.
- The gate also checks the worktrees of this repository that the session stopped in or edited, so plans executed in
  a Superpowers worktree are covered. A worktree created during the session counts from the main folder's state; one
  that already existed counts from the state the session first found it in. Other repositories are left alone.
- The `release-gate` agent writes its proof to `.uc/verification/<timestamp>.json` in the project root. It counts
  only when complete: PASS, every check passed, at least one criterion and all VERIFIED, nothing left unverified,
  the same fingerprint before and after the checks, and that fingerprint equal to the current code. Version 2 also binds the active acceptance criteria and platform.
  Use `uc verify --check` for the independent Git release decision.
- The fingerprint does not see changes inside git submodules or nested repositories, in files marked
  `assume-unchanged` or `skip-worktree`, or in ignored files. Verify those by hand.
- When you try to stop and the code changed with no such proof, the stop is blocked once with:
  "STRICT profile: the code changed in this session and no PASS verification matches it."
  Outside git the gate falls back to the time of the last Edit/Write against the newest PASS.
- What to do then: run the `release-gate` agent. If verification is not possible, write the delivery report
  (skill `delivery-report`) and list what remains unverified.
- The gate blocks once per code state: the next stop on the same state goes through, so there is never a loop.
  Work closed that way must be reported as not verified.

In MINIMAL and STANDARD the gate does nothing. `block-destructive` is active in every profile: it blocks
`rm -rf`, `git reset --hard`, `git push --force`, git commands that throw away work or branches (`git clean -f`,
`git checkout -- .`, `git restore .`, `git stash drop|clear`, `git branch -D`, `git push --delete|--mirror|--prune`),
recursive PowerShell deletes in any short form (`Remove-Item -r`, `ri`, `del`, `erase`), `rd /s /q` and `del /s`.
Text that only mentions such a command (a commit message, a grep pattern) is not blocked. If the guard itself cannot
run, the command is blocked too. The user can still run these commands by hand.
