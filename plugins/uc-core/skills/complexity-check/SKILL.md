---
name: complexity-check
description: Decision guide for how much structure a design deserves (Intelligent Complexity). Tests whether an abstraction, layer, service or dependency is justified by a named driver, and records the decision in a few lines.
when_to_use: Use when choosing between a simpler and a more elaborate design, when adding an abstraction, layer, queue, cache, service or dependency, or when YAGNI or simplicity is cited as the reason for or against a design.
---

# Complexity check

Simplicity and YAGNI are decision tools, not prohibitions. The goal is the design that fits this project:
sometimes that is one function, sometimes it is a layer with a clear seam. Both "always the simplest thing"
and "build it properly from the start" are ways of skipping the decision.

## The eight criteria

Added structure has to pay for itself on at least one of these, for this project:

| Criterion | The question to answer |
|---|---|
| Scalability | Which load, data size or team size is expected, and where does the simple design stop coping? |
| Maintainability | Who changes this later, how often, and what do they have to understand first? |
| Reliability | What fails, how is it noticed, and what state is left behind? |
| Security | Which trust boundary does this cross, and what is exposed if it is wrong? |
| Performance | Which measured or required number is at stake? |
| Extensibility | Which change is already expected, by whom, and when? |
| UX | What does the user see or wait for differently? |
| Testability | Can the behaviour be checked without the real database, network or clock? |

## The justification test

For each piece of added structure, answer all three. If one answer is missing, the structure is not justified
yet.

1. **Driver.** Name the concrete requirement it serves, the failure it prevents, or the change it prepares
   for. "It might be needed" is not a driver; "the spec requires a second payment provider in the next
   release" is.
2. **Cost.** Say what it costs: more code to read, another moving part, slower tests, a concept every
   reader must learn, a dependency to keep updated.
3. **Alternative.** Describe the simpler design and say exactly where it breaks, or what adding the
   structure later would cost compared with adding it now.

## Usually justified

- A seam at a real boundary: an external service, the database, the clock, the file system, a payment provider.
- Validation and error handling where data enters the system or crosses a trust boundary.
- Structure that makes an irreversible action safe: backup, dry run, confirmation, idempotency.
- A second implementation that already exists or is scheduled, not merely imagined.
- Anything a stated requirement, a regulation or a measured number demands.

## Not justified

- Speculative generality with no named driver: plugin systems, configuration options and generic base
  classes for a single known case.
- An interface with one implementation and no test double that needs it.
- A layer that only forwards calls.
- A cache, queue or worker before a measurement shows the need.
- A new dependency for something a few lines of standard library do.
- Flexibility on an axis nobody has asked about.

Removing structure needs the same test in reverse: do not collapse a seam that a requirement, a test or an
expected change relies on only because the code would be shorter.

## Output: the decision record

Write three to six lines, in the plan, the ADR or the answer to the user:

```
Decision: <what will be built, in one line>
Driver: <requirement, failure or expected change>
Criteria served: <one to three of the eight>
Cost accepted: <what this adds>
Rejected: <the simpler or the more elaborate alternative, and why>
Revisit when: <the signal that would change the decision>
```

For a decision that is expensive to reverse, hand it to the `architect` agent, which compares candidates on
the same eight criteria and writes an ADR.
