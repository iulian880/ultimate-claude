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
| When | typo, rename, a bug fix inside one function | everyday development | critical systems, migrations, important VBA, security, data |
| Process | do it directly, then one check | brainstorm -> plan -> execution chosen per plan -> verify | STANDARD + `architect` agent and an ADR between brainstorming and writing-plans, a persistent plan, `qa-engineer` agent |
| Review | none | Superpowers reviews, then the `code-reviewer` conformance review before finishing the branch | STANDARD + `/security-review` + the domain reviewer + `release-gate` agent |
| Enforced by hooks | `block-destructive` | `block-destructive` | `block-destructive` + the verification gate |

The process and review rows are guidance that you follow. Only the last row is enforced by hooks.

## Which profile is active

The hooks resolve the profile in this order:

1. the session marker `<config dir>/uc/sessions/<session_id>.json`, written when a prompt starts with a
   profile command (see below);
2. `UC_PROFILE` in the environment, usually set by the project in `.claude/settings.local.json`;
3. otherwise STANDARD.

`<config dir>` is `CLAUDE_CONFIG_DIR` when it is set, otherwise `~/.claude`. A value other than `minimal`,
`standard` or `strict` is ignored.

When the user asks which profile is active: if a line "UC profile for this session is now ..." appeared in
this session, that is the answer. Otherwise check `UC_PROFILE` and the project's `.claude/settings.local.json`,
and if neither sets it, the profile is STANDARD.

## How to switch

- **For this session:** the user starts a prompt with `profil strict` (or `profile strict`, `uc profile minimal`,
  and so on). The words must be the first words of the prompt. A hook stores the choice and confirms with
  "UC profile for this session is now STRICT.". You cannot switch the profile yourself: when the user asks
  for a switch in the middle of a sentence, ask them to send `profil <name>` as its own prompt.
- **For a project:** add this to the project's `.claude/settings.local.json`, then start a new session:

  ```json
  { "env": { "UC_PROFILE": "strict" } }
  ```

- **From a terminal:** `uc strict` (or `uc minimal`, `uc standard`) starts Claude Code with that profile.
  The launchers are `bin/uc` and `bin/uc.ps1` in the ultimate-claude repository.

## What the STRICT gate enforces

- A hook notes the time of every file edit in the session.
- The `release-gate` agent writes its proof to `.uc/verification/<timestamp>.json` with a PASS or FAIL verdict.
- When you try to stop in STRICT and a file was edited after the newest PASS, the stop is blocked once with:
  "STRICT profile: files changed after the last PASS verification."
- What to do then: run the `release-gate` agent. If verification is not possible, write the delivery report
  (skill `delivery-report`) and list what remains unverified.
- The gate blocks only once per edit: the next stop goes through, so there is never a loop. Work closed
  that way must be reported as not verified.

In MINIMAL and STANDARD the gate does nothing. `block-destructive` is active in every profile: it blocks
`rm -rf`, `git reset --hard`, `git push --force`, `Remove-Item -Recurse -Force` and `rd /s /q`; the user can
still run those commands by hand.
