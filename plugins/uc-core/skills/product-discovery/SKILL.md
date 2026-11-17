---
name: product-discovery
description: Product questions to settle before brainstorming a solution - who the user is, the problem, what they do today, the success criterion, the smallest valuable version and what would make it fail. Ends with a short brief and hands off to brainstorming.
when_to_use: Use before brainstorming a new product, a new app or a major feature, when the request describes a solution but not the user or the problem it solves. Not for bug fixes, refactors or small changes to something that already exists.
---

# Product discovery

Brainstorming answers "how could we build this?". This skill comes first and answers "what is worth
building, and for whom?". It takes a few minutes and it does not replace brainstorming.

## How to run it

- Ask one question at a time and wait for the answer. Do not hand over a questionnaire.
- Skip a question that the user's request or the project documents already answer; say what you took from
  where.
- Ask for specifics: a real person, a real recent situation, a number. When an answer is general, ask for
  the last time it happened.
- If the user does not know, write "unknown" in the brief. Never invent an answer for them.
- Stop when the brief can be written. Six questions is the ceiling, not the target.

## The questions

1. **Who is the user?** One concrete kind of person, in their situation: role, what they are trying to get
   done, how often. "Everyone" and "businesses" are not answers. If the user and the person who pays are
   different, name both.
2. **What is the problem?** What goes wrong for them today and what it costs: time, money, errors, stress.
   Describe the problem without mentioning the solution.
3. **What do they do today?** The current workaround: a spreadsheet, another product, doing it by hand, or
   nothing. This is the real competitor. If they do nothing and it does not hurt, the problem may be too small.
4. **How will we know it worked?** One observable success criterion: a measurable change, or something the
   user can do that they could not do before. "Users like it" is not observable.
5. **What is the smallest valuable version?** The least that already solves the problem for that one user.
   Name what is deliberately left out.
6. **What would make it fail?** The riskiest assumption: something that, if false, makes the rest
   worthless. Say how it could be checked cheaply before building everything.

## Warning signs to raise

Say these plainly when you see them; the user decides what to do about them.

- The solution was decided before the problem was described.
- There is no current workaround, and nobody seems to be bothered by its absence.
- The success criterion cannot be observed.
- The smallest version is not small: it needs every feature to be useful.
- The user of the product is the builder alone. That is fine, but then say so and size the work accordingly.

## Output: the brief

```
User: <who, in which situation>
Problem: <what goes wrong and what it costs>
Today: <the current workaround>
Success: <the observable criterion>
Smallest valuable version: <in scope> / <deliberately out of scope>
Riskiest assumption: <the assumption, and how to check it>
Unknown: <questions left open>
```

Show the brief to the user and ask whether it is right.

## Hand-off

After the user confirms the brief, continue with `superpowers:brainstorming` and give it the brief as the
starting point. If that skill is not installed, say so and continue with an ordinary brainstorm of two or
three approaches. This skill never produces a design, a plan or code.
