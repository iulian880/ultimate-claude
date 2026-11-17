# uc-core and Superpowers roles (Plan 1b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** uc-core decides the execution strategy and owns conformance review, QA strategy and release; Superpowers keeps
methodology (brainstorming, plans, TDD, debugging, execution, its own code reviews) without uc-core duplicating it.

**Architecture:** No new mechanism. Superpowers' own selection criteria become a standing rule in the global block
(user instructions take precedence over skills: `SP/using-superpowers/SKILL.md:63-65`). uc-core agents and skills are
narrowed to the stages Superpowers does not cover. `SP` = `~/.claude/plugins/cache/claude-plugins-official/superpowers/7.0.2/skills`.

**Tech Stack:** Markdown agents and skills, Node.js `node:test`.

**Spec:** the audit approved by the user on 2026-11-17 (proposal A–D) and `docs/DESIGN.md` §5.2, §6, §7.

## Global Constraints

- Global block: at most 40 lines without the `@RTK.md` import (cap raised from 35 by this change; DESIGN §5.2).
- Execution rule text, verbatim:
  - subagent-driven-development: 4+ mostly independent tasks AND (STRICT, a long plan, or costly mistakes).
  - executing-plans (inline): otherwise, and always for coupled tasks or steps that need the user's yes or touch files
    outside the repo. On the Pro plan, ties go to inline.
  - Subagents never use a pricier model than the session.
- uc-core does not restate TDD, debugging or brainstorming techniques; it points to the Superpowers skill.
- Changing `~/.claude/CLAUDE.md` needs a backup in `~/.claude/backups/2026-11-17/` (`.v2-<HHMMSS>` suffix) first.
- Agent bodies stay at most 80 lines; skills at most 120 lines.

## Review Focus

1. The new execution rule still lets an explicit user choice win (the rule must say so).
2. `code-reviewer` no longer repeats line-level correctness, but still blocks when the Superpowers review was skipped or
   missing (otherwise conformance review would pass unreviewed code).
3. `qa-engineer` still produces tests that catch a named failure, now by following `superpowers:test-driven-development`.
4. Projects without uc-core keep a working review path (Superpowers requesting-code-review).
5. Stale references to "code-reviewer is the Superpowers review step" remain anywhere in the repo.

---

### Task 1: Execution rules in the global block

**Files:** Modify `installer/proposals/global-claude-md.md`, `tests/global-claude-md.test.mjs`.

- [ ] **Step 1: Failing tests:** `block is at most 40 lines without the import`; `execution is chosen by uc-core rules,
  user choice wins` (contains `## Execution (uc-core decides, Superpowers runs it)`, `The user's explicit choice wins`,
  `4+ mostly independent tasks`, `ties go to inline`, `never use a pricier model`; does not contain `only when the user
  asks`); `reviews are split` (STANDARD row contains `Superpowers reviews` and `` `code-reviewer` (conformance) ``).
- [ ] **Step 2:** run → FAIL. **Step 3:** edit the block: STANDARD process `Superpowers: brainstorming, writing-plans,
  execution chosen per plan, verification`; review columns `Superpowers reviews, `code-reviewer` (conformance)` (STANDARD)
  and the same plus `/security-review`, domain reviewer, `release-gate` (STRICT); delete the "only when the user asks"
  line; add the Execution section with the Global Constraints text. **Step 4:** run → PASS. **Step 5:** commit.

### Task 2: `code-reviewer` becomes the conformance review

**Files:** Modify `plugins/uc-core/agents/code-reviewer.md`, `tests/agents.test.mjs`.

- [ ] **Step 1: Failing test** `code-reviewer reviews conformance and builds on the Superpowers review`: body contains
  `conformance`, `docs/adr/`, `CLAUDE.md`, `.claude/rules`, `Superpowers`, `does not repeat`, `APPROVE`, `BLOCK`,
  `confidence`; description contains `conformance`. Keep the existing rtk-bypass test.
- [ ] **Step 2:** FAIL. **Step 3:** rewrite: inputs = the change, spec/plan, ADRs, project rules, and the latest
  Superpowers review report (task reviews and final review) or a statement that none ran; checks = spec acceptance,
  ADR conformance, project rules, cross-cutting risk (data, security boundaries, irreversible actions, interfaces other
  code depends on), whether the Superpowers findings marked Critical/Important were fixed; does not repeat line-level
  correctness already covered; no Superpowers review found → `BLOCK` with "run superpowers:requesting-code-review first";
  keeps confidence ≥ 80, verdict, Set aside, rtk bypass. **Step 4:** PASS. **Step 5:** commit.

### Task 3: `qa-engineer`, `architect`, `delivery-report` stop duplicating Superpowers

**Files:** Modify `plugins/uc-core/agents/qa-engineer.md`, `plugins/uc-core/agents/architect.md`,
`plugins/uc-core/skills/delivery-report/SKILL.md`, `tests/agents.test.mjs`, `tests/skills.test.mjs`.

- [ ] **Step 1: Failing tests:** qa-engineer contains `superpowers:test-driven-development` and does not contain
  `mutation check` or `by hand` (replace the old qa test); architect contains `after brainstorming` and
  `does not redo`; delivery-report contains `Rulings I made` and `Deferred minors`.
- [ ] **Step 2:** FAIL. **Step 3:** qa-engineer: replace the test-writing technique steps with "write them following
  superpowers:test-driven-development (and its writing-good-tests.md)"; keep risk ranking, criticality, levels, edge
  cases, gaps, baseline, three reruns, rules. architect: "runs after brainstorming has chosen the approach; does not redo
  the user-facing choice; its candidates are structural options inside that approach". delivery-report: Decisions made
  includes the executor's "Rulings I made" verbatim; Follow-ups includes "Deferred minors". **Step 4:** PASS.
  **Step 5:** commit.

### Task 4: Design and uc-profile alignment

**Files:** Modify `docs/DESIGN.md` (§5.2 table and paragraph, §6 table, §7 table, §12), `plugins/uc-core/skills/uc-profile/SKILL.md`,
`tests/skills.test.mjs`.

- [ ] **Step 1: Failing test** uc-profile Review row contains `Superpowers reviews` and Process row contains
  `chosen per plan`.
- [ ] **Step 2:** FAIL. **Step 3:** uc-profile table as the global block. DESIGN: §5.2 code-reviewer row → conformance
  review, drop "Este reviewerul pe care îl folosește pasul de review din Superpowers"; block cap 35 → 40; §6 "Review de
  cod" → "Superpowers (per task in SDD, final review)" + new row "Review de conformitate și decizia de livrare" →
  `code-reviewer` + `release-gate`; "Brainstorm, plan, execuție…" row adds "alegerea execuției: regula din CLAUDE.md";
  §7 Process/Review rows as uc-profile. `grep -rn "pasul de review din Superpowers"` → no match. **Step 4:** PASS.
  **Step 5:** commit.

### Task 5: Install the block (backup first) and verify

- [ ] **Step 1:** Back up `~/.claude/CLAUDE.md`, `cmp` → identical; copy the proposal over it, `cmp` → identical.
- [ ] **Step 2:** Live check in a scratch repo: `claude -p --model haiku` quotes the Execution section heading.
- [ ] **Step 3:** `npm test`, lint, `claude plugin validate plugins/uc-core`; record in
  `docs/verification/superpowers-roles.md` (with the restore command); commit.
