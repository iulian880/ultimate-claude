---
name: product-discovery
description: Find an additional skill for a project when its required capability is missing from the available skills, project tooling and built-in abilities. Check the gap and recommend a verified match.
when_to_use: Use when an identified project requirement exceeds what the current setup can deliver. Clarify ambiguous requirements first. Use a sufficient existing capability directly.
---

# Find a skill for a capability gap

1. Name the required result and a concrete acceptance check. If the result is unclear, ask the smallest question that would settle it.
2. Check the session's available skills and tools, the project's scripts and the system's built-in abilities against that check. If one suffices, use it and stop searching. Distinguish a missing skill from a missing credential, device or permission.
3. For a remaining capability gap, search available skill catalogs or upstream repositories by the required operation, file format and platform. Start with the project's preferred sources. Inspect the candidate's actual SKILL.md and prerequisites. Compare its supported inputs, outputs and limits with the project's acceptance check.
4. Recommend the smallest sufficient candidate. Give its name, source, what it adds beyond the current setup and a representative way to verify it. If no candidate fits or the catalog is unavailable, report what was checked and what remains missing. Keep discovery read-only unless the user also requested installation.
5. When the skill is available and its use is in scope, run the representative check and report the observed result. Label a candidate assessed only from documentation as a recommendation.
