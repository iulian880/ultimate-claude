---
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
---

Review the entire following change against its acceptance criteria. Return APPROVE or BLOCK and the evidence. Preserve order, preserve duplicate IDs, and ignore optional labels.

`const exportIds = rows => rows.map(row => row.id);`
