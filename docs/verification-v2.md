# Evidence and release decisions

Use the same project directory for all steps, including in linked worktrees and monorepos.
A worktree has one active contract per project folder. Parallel tasks with different contracts use separate worktrees.
Bind a repository-relative Markdown spec that contains one H2 named `Acceptance criteria`, with one single-line bullet per criterion. Its path and ordered bullets identify the task. Use a separate H2 for other notes. For a prompt-only task the default is `.uc/criteria.md`.

```sh
uc verify --bind docs/specs/export.md
uc verify --snapshot > .uc/before.json
uc verify --capture .uc/check-1.json node --test
uc verify --record .uc/before.json .uc/report.json
uc verify --check
uc verify --check --platform win32
```

The binding creates .uc/. Use unique scratch filenames for concurrent verifications. The report supplies verdict, checks, criteria and unverified. Copy capture records verbatim into checks. Each criterion supplies its exact text, status and zero-based evidence indexes. Manual evidence uses type inspection, a named artifact and an observation. The release-gate agent contains a complete report example. A human or agent interprets whether each observation actually establishes the criterion. Use a trusted producer and trusted CI artifacts for a release.

The recorder adds schemaVersion 2, current platform, timestamp and the before/after Git fingerprints. Matching compares the acceptance digest, code and platform. A newer failure for the same identity invalidates earlier passes. Legacy records remain readable as files; a fresh v2 run is required for release. Exit 0 from --check approves that identity. Exit 1 means missing, invalid, failed or stale evidence. Independent release checks require Git. Outside Git the conversational gate uses observed edit times.

For CI on a fresh checkout, bind the same spec there and generate a proof during the job, or restore the verification directory from a trusted run of that exact tree and platform. A proof from LibreOffice on macOS cannot satisfy --platform win32. Windows by itself does not establish Excel or SAP behaviour; include the relevant runtime in the criteria and observations.

Use `uc status` to see the effective profile sources visible to the CLI, component inventory, configured security review and most recent matching PASS. Outside a running session, pass `--session ID` to include a session marker. The actual host environment takes precedence over settings inferred from disk. Additional managed policies or launch flags may affect a separately launched session.

Session updates serialize a short read/merge/rename operation. If the host is forcibly terminated while it owns a session lock, close processes using that session and remove only its abandoned `<session>.json.lock` directory under the Claude configuration directory before resuming. Retain the session JSON.

Reviewer and QA write limits in their prompts describe their roles. Host permissions and plugin-level hooks enforce the specific actions they cover. An interactive Stop reminder can be acknowledged; release automation uses the independent check.
