# 0001. Ship the setup as plugins in a private marketplace

> Actualizare 22.11.2026. Repository-ul este public. Pentru politica actuală de profiluri, review și dovezi v2, vezi [README](../../README.md). Documentul păstrează contextul deciziei inițiale.


Date: 2026-11-17   Status: accepted

## Context

The setup has to be the same on macOS and on native Windows, pinned to versions, and removable without
leaving traces. The previous setup (v3) lived as hand-edited files in `~/.claude` and could not be reproduced
on a second machine. Claude Code already provides versioning, scopes (user, project, local), enabling per
project and uninstalling for plugins that come from a marketplace.

## Decision

We package our own agents, skills and hooks as Claude Code plugins (`uc-core`, later `uc-web` and `uc-excel`)
in one git repository that is also a private marketplace (`.claude-plugin/marketplace.json`). The installer
(Plan 5) stays thin: it checks dependencies, registers the marketplace and proposes sensitive changes as
diffs that the user accepts one by one. Third-party components are not vendored; they are listed, pinned, in
`components.lock.json`.

## Alternatives considered

**An installer that copies files into `~/.claude`.** Full control over every file, but backup, rollback,
detection and uninstall would all be our code, on two operating systems. The most fragile part of the system
would be ours.

**Evolving the v3 setup in place, with no package.** Cheapest today, but not reproducible on Windows and with
no project templates.

## Consequences

- Install, update, scope and uninstall come from Claude Code and need no code from us.
- Activation per project type is native: `enabledPlugins` in the project's `.claude/settings.json`.
- Plugin agents ignore the `hooks`, `mcpServers` and `permissionMode` frontmatter fields, so guarantees
  must live in plugin-level hooks, not in agents.
- Individual skills of a plugin cannot be hidden; every skill description is always-on context and has to
  earn its place. The budget is measured in Plan 1, Task 10.
- A plugin cannot ship a `CLAUDE.md`. The short philosophy block stays in the user's global `CLAUDE.md`
  and is only proposed, never written silently (Plan 2).
- The repository is private. Each machine needs access to it (`gh auth login`), or a local clone
  registered as a directory marketplace.
