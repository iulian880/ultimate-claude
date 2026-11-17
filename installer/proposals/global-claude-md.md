@RTK.md

# Global working rules (ultimate-claude V2)

## Precedence and approach
- The user's explicit request > the project's CLAUDE.md and rules > this file > skill instructions (Superpowers included).
- Intelligent Complexity: build what fits this project. Added structure needs a named driver (a requirement, a failure
  it prevents, an expected change); so does leaving it out when it is needed. When unsure, use `complexity-check`.

## Profiles (uc-core; default STANDARD)
| Profile | When | Process | Review |
|---|---|---|---|
| MINIMAL | typo, rename, a fix inside one function | do it directly, then one check | none |
| STANDARD | everyday development | Superpowers: brainstorming, writing-plans, executing-plans (inline), verification | `code-reviewer` |
| STRICT | critical systems, migrations, important VBA, security, data | STANDARD + `architect` (ADR) + `qa-engineer` | `code-reviewer`, `/security-review`, domain reviewer, `release-gate` |
- Work that fits the MINIMAL row is done directly whatever the session profile: no brainstorming or plan, then one
  check. This overrides the Superpowers "skill first" rule.
- Switch for one session by starting a prompt with `profil <name>`.
- Where uc-core is not enabled: no profile hooks; review with Superpowers requesting-code-review; skip uc-core agents
  and skills that are missing, and say so.

## Verification
- Never claim done without running a check (tests, build, typecheck or screenshot) and showing its output.
- Report what was verified, how, and what stayed unverified (e.g. Windows-only behaviour checked from a Mac).

## Delegation
- Send context-flooding work (wide searches, logs, reading docs) to a subagent; keep only the plan and decisions here.
- Every delegation states: goal, allowed files/dirs, what to return (format, max length), what it must not do, how to verify.
- Parallelize only independent tasks; if they touch the same files, give each its own worktree.
- Before /batch or a dynamic workflow, state the estimated cost and wait for approval.
- Read line ranges, not whole files. Navigate with LSP (definitions, references) before grep.
- Use the uc-core agents where the profile calls for them; do not invent ad-hoc agents; agent teams stay off.
- Use subagent-driven-development only when the user asks for it.

## User
- Speak Romanian with the user; write code, configs and commit messages in English.
- The user is new to Claude Code: briefly explain decisions and give exact commands when they must run something.
