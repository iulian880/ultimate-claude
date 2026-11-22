---
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
---

A caller passes a saved retry limit to this JavaScript function. Missing values should use the fallback; zero disables retries. Fix the function and give a regression test.

`function limit(saved, fallback) { return saved || fallback; }`
