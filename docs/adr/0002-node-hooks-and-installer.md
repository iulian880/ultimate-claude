# 0002. Write hooks and the installer in Node.js

Date: 2026-11-17   Status: accepted

## Context

Hooks must behave the same on macOS and on native Windows. On Windows, hooks run through Git Bash, or
through PowerShell when Git Bash is missing, and there is no sandbox: `deny` rules and hooks are the only
guarantees. The existing `block-destructive` hook is a bash script that calls `/usr/bin/python3`, which does
not exist on Windows. The original brief asked for a PowerShell installer. Node.js 22 or newer is already
required by other components of the setup (Context7 CLI, Playwright CLI).

## Decision

Hooks, the plugin linter and the installer are written in Node.js as ES modules (`.mjs`), with zero npm
dependencies, and are tested with `node:test`. Each hook is a pure function wrapped by a thin command-line
entry that reads JSON from stdin and sets the exit code. Paths go through `node:path` and `node:os`. The
installer gets two thin entry points, `install.ps1` and `install.sh`, that only check for Node and call the
Node program.

## Alternatives considered

**Bash hooks plus a PowerShell port.** Two implementations of every rule that would drift apart, and a
regex dialect difference between `grep -E` and .NET for the most safety-critical code.

**Pure PowerShell, as the brief asked.** PowerShell 7 is not installed by default on macOS, and Windows
PowerShell 5.1 differs from it; the same script would still need testing on three runtimes.

**Python.** Not present on a default Windows install, and versions and launchers (`python`, `python3`,
`py`) differ between machines.

## Consequences

- One code path and one test suite for both operating systems; the hook logic is unit-tested without
  starting Claude Code.
- Node 22 or newer becomes a hard requirement. A machine without Node has no guard hooks, so the installer
  must check for it before enabling the plugin.
- Each hook call starts a Node process. The cost is small but not zero, and it applies to every Bash call
  and every prompt.
- Hook commands are `node "${CLAUDE_PLUGIN_ROOT}/hooks/<file>.mjs"`. `node` is a real executable on Windows,
  not a `.cmd` shim, so it works in both hook shells. This is verified on macOS only; Windows behaviour is
  listed as unverified until Plan 6.
- The PowerShell launcher `bin/uc.ps1` exists for the terminal on Windows and is untested until a machine
  with PowerShell is available.
