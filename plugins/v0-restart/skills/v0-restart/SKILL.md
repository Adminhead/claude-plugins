---
name: v0-restart
description: Manual command that plans a restart from v0, keeping only the contracts, gates, vocabulary, tests and failure notes the previous attempt proved, and dropping its accidental architecture.
disable-model-invocation: true
---

# V0 restart

Start over from what the previous attempt proved, not from what it happened to build. A restart is not amnesia: contracts, schemas, vocabulary, real-surface tests, quality gates and the negative corpus survive when they earned it. Scaffold, explanatory UI, debug panels, shallow generated content and code whose only value was learning what not to do do not.

Adapted from the `re0-work` skill in LilMGenius/paperthin (MIT).

## Not for

- Metric-driven iteration on a working approach: use `experiment-loop`.
- Rewriting commit history: use `git-history`.

## Workflow

1. Read the current plan, any retro or `session-retro` notes, local domain notes, QA evidence and the complaint that triggered the restart.
2. Decide what to keep: contracts, schemas that survived QA, quality gates, vocabulary, reusable services, real-surface tests and the negative corpus. Give evidence for each item.
3. Decide what to drop: explanatory UI, debug panels, scaffold, shallow generated content, accidental abstractions and code that only taught what not to do. Give the reason for each.
4. Name the first quality gate before planning any code.
5. Write a v0 plan with one complete vertical loop. For multi-slice work, put the plan in `docs/plans/` through the `planning` skill.
6. Build only that loop until it clears the gate.

## Rules

- No copy-forward unless the artifact earned it.
- One complete vertical loop beats many shallow surfaces.
- Keep provenance in local docs, not in the shipped product.
- Do not rebuild around a vague lesson. Turn it into a gate or leave it out.
- Archive failed paths, never delete them. Move them to a branch or a `docs/` note where the next cycle will see them.
- When a reusable module survives, name the contract that proves it survives.

## Before finishing

1. The keep/drop split is explicit and backed by evidence.
2. The v0 plan has one vertical loop and a named first gate.
3. No old architecture is carried over merely because it exists.
4. A fresh builder can start without rereading the failed codebase.
