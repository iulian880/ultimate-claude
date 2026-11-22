# Evaluating component selection

The SessionStart hook supplies the [component rules](../plugins/uc-core/component-routing.md) at startup and after context resets. CI checks delivery and scorer behaviour with synthetic events. To measure Claude, use the fifteen [Romanian cases](../evals/component-routing.json) in fresh disposable projects. Each prompt has an independently reviewable output criterion. Give Claude only the prompt. Record the model, plugin commit, inventory, project profile, enabled MCP servers and any permission denials. Keep transcripts outside the test project and out of Git.

Example for one case in a POSIX shell. Set REPO to the absolute marketplace checkout and RUN to a private existing directory. From an empty temporary working directory with the intended companion skills available:

```sh
claude plugin install security-guidance@claude-plugins-official --scope local
id=api
prompt=$(node "$REPO/scripts/grade-routing.mjs" "$id")
claude -p --plugin-dir "$REPO/plugins/uc-core" --output-format stream-json --verbose "$prompt" > "$RUN/$id.jsonl"
node "$REPO/scripts/grade-routing.mjs" "$id" "$RUN/$id.jsonl"
```

For local-bug seed subject.mjs with `export const limit = (x, fallback) => x || fallback;`. For browser create index.html with a visible button covered by an absolutely positioned overlay and enable browser tooling. For VBA use a disposable copy of a working Excel fixture with documented commands and enable uc-excel. Enable the relevant specialists before testing their selection. For architecture retain the child trace or mark child behaviour unverified. For the lesson case seed subject.mjs with the supplied function. For the handoff criterion open a fresh session from the same project and check whether the receiver recovers the pending Windows action. Retain that second observation with the review. Use an empty project for each unrelated case. Give identical permissions and tool availability to each comparison arm. To compare a change, run the same prompts on the previous revision, alternate arm order and repeat. Record unavailable components separately and inspect the fallback; exclude those runs from claims about selection among available skills.

Confirm the init event lists uc-core and the applicable companion. A missing uc-core invalidates the run, including negative cases. The scorer reads assistant tool calls. A mention in prose earns no credit. The first pass prints the capture digest and an ungraded outcome. A reviewer checks the captured prompt assignment, actual tool results, order, changed files and final response against the criterion. Record a private JSON review with id, sha256, timing and outcome (each pass or fail), and evidence identifying the relevant event, command or artifact. Pass the review as the third argument. Exit zero requires a complete run, expected route, no listed unnecessary route, correct timing and verified outcome. A failed or truncated run stays incomplete. Manually inspect shell wrappers or alternate tool spellings before interpreting a missing call.

Report counts per case for missed selections, unnecessary selections, wrong timing and failed outcomes, with incomplete runs separate. Treat a single successful run as one observation. Change a trigger only after inspecting the misses and rerun its nearest negative example as well.
