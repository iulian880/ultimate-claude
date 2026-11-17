---
name: delivery-report
description: The final report for a piece of work - what was done, what was verified and how, what was not verified and why, decisions made and follow-ups. Keeps "done" tied to evidence.
when_to_use: Use at the end of STANDARD or STRICT work, before claiming that a task, a plan or a feature is done, and whenever the profile gate blocked a stop because files changed after the last verification.
---

# Delivery report

A report the user can act on without re-reading the session. Every claim in it is either backed by a
command that was run, or listed as not verified.

## Before writing

1. Run the project's checks now (tests, build, lint, type check), unless they ran after the last edit. A
   result from before the last edit does not count.
2. In the STRICT profile, run the `release-gate` agent and read the newest file in `.uc/verification/`.
   Cite its path, its verdict and its `at` time in the report. If the gate was not run, or its verdict is
   FAIL, say so in the first line of the report.
3. Collect the decisions you made without asking the user, so they can overrule them.

## The report

Use these five sections, in this order. Leave a section out only if it is truly empty, except
"Not verified", which is always present.

```
## Done
- <what changed, in terms of behaviour, one line each, with the main files>

## Verified
- `<command>` -> <result: counts, exit code, or what was observed>

## Not verified
- <what> - <why: needs another OS, an account, a manual step, or was not run>

## Decisions made
- <decision> - <reason>; <what the alternative was>

## Follow-ups
- <work left out on purpose, problems noticed in passing, the suggested next step>
```

When a Superpowers plan was executed (executing-plans or subagent-driven-development), its final message has two
exhaustive lists. Carry them over, do not summarise them: "Rulings I made" goes verbatim under Decisions made, each
with what it costs if wrong; "Deferred minors" goes verbatim under Follow-ups.

## Rules

- **Done** describes results, not effort. "Login rejects expired tokens", not "worked on the auth module".
- **Verified** contains only checks that were run in this session after the last edit, with the real
  result. Paste the summary line of the output; do not paraphrase a pass. A screenshot or a manual check
  counts if you say exactly what was looked at.
- **Not verified** is never left out. If everything was verified, write "Nothing: every claim above has a
  check". Typical entries: behaviour on another operating system, anything that needs real credentials or
  real data, performance under load, the desktop app when only the terminal was used.
- A failing check is reported as failing, with the output. It is never moved to Follow-ups to make the
  report look clean.
- If the profile gate blocked a stop and the work was closed without a PASS, state it under
  "Not verified": "STRICT gate: files changed after the last PASS; closed without a new verification".
- No praise and no filler. If the work is partly done, the first line says which part.

## Length

MINIMAL work does not need this report: one line with the check that was run is enough. In STANDARD, keep
it under about twenty lines. In STRICT, add the verification file reference and the unverified list from
the `release-gate` proof.
