# UC pilot

Prepare eight isolated Git workspaces with `node scripts/prepare-pilot.mjs NEW_DIRECTORY`.
Preparation only calls Git and writes files. The two repetitions of each task use identical starting commits and alternate arm order. All run IDs are opaque.
The pilot compares Superpowers alone with Superpowers plus UC and its required security-guidance dependency. Its LLM review setting is off in both environments.

For a separately authorised live experiment, use the per-run project, config directory, environment and argv in plan.json. Supply the same pinned model and plugin directories and a working authentication method for the isolated configuration. Inspect loaded plugins before scoring; discard a run if dependencies or account policy changed its arm. Keep model effort and permissions equal. Never run model invocations during preparation or CI.

Give the grader only the prompt, result, anonymised diff and the task rubric. For the regression task copy the hidden check beside subject.mjs after the run and execute it with Node, then verify the new regression test fails against the original and passes against the submitted version. For the review task score the seeded defect and the clean labels function separately. Record interventions including permission prompts. Save usage, cached tokens, elapsed time and dependency costs separately; use unknown for missing measurements. Compare cost per accepted task and list each failure before aggregating. Eight runs are a pilot.

The plugin also ships native prompt/graders cases for a clean review, a defective review, a regression and a design choice. A future `claude plugin eval plugins/uc-core --runs 2 --no-publish` consumes model quota and measures its own installed baseline. Its scores are distinct from the paired Superpowers pilot.
