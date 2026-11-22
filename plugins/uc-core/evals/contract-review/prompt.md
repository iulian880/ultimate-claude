---
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
---

Review this export change. The approved contract requires original order, duplicate IDs and legacy empty labels. Return a verdict, concrete counterexample and the missing test.

`const exportIds = rows => [...new Set(rows.map(row => row.id))];`

Labels are optional and never emitted.
