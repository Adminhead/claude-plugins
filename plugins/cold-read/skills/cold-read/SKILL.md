---
name: cold-read
description: Cold-reads an artifact through a fresh subagent that sees only its contents and reports where a stranger would stall. Use when asked "would someone new follow this?", "does this stand on its own?", or for a fresh-eyes read before a handoff, publish or merge. Diagnoses only. Not for disproving a decision or checking docs against code.
---

# Cold read

Check whether an artifact stands on its own by letting a reader with no session context read it. A long session hides what you left unsaid, so the judge must be someone who never saw it.

Adapted from the `shower` skill in LilMGenius/paperthin (MIT).

## Not for

- Attacking a decision or plan: use `doubt-review`.
- Comparing docs against code: use `docs-audit`.

## Workflow

1. Pin the artifact in focus. If it is ambiguous, confirm with the user or take the one just produced. Note privately, in one line, what it is meant to be and who it is for. This is the yardstick for step 4, and the reviewer never sees it.
2. Spawn one fresh subagent (`Agent`, general-purpose, no worktree). Give it the artifact's contents inline or as a copy, never a path. Tell it not to open the README, docs or neighbouring files. Give it nothing about your intent or reasoning.
3. Have it read the whole artifact blind and report, from the artifact alone:
   - what it takes the artifact to be, to do and to expect;
   - what is unclear, ambiguous, or assumed but unstated;
   - what it would need to act with confidence, and what it had to guess.
4. Compare its reading with the intent you noted. Every mismatch is a defect in the artifact, not a reader error.
5. Report the defects with a concrete fix for each, ordered by how badly each blocks a fresh reader, then a verdict: stands alone, minor gaps, or needs work.

## Rules

- Never self-assess in this session. You cannot un-see the context, which is the reason for the subagent.
- Pass contents, never intent.
- Treat "I had to assume" as a finding, not a reader failure.
- Adapt the questions to the medium (prose, code, config, a plan).
- Read, don't sweep. The reviewer reads end to end; a pattern grep misses stale references, dead links and fact drift. Never report "clean" from a grep alone, and say how much was actually read.
- One read is the default. It is a single draw and can be confidently wrong, so run several independent reads when the stakes justify the cost.
- Diagnose only. The fixes happen in the main session, after the report.

## Before finishing

1. The read came from a fresh subagent that never saw your intent.
2. The report carries the verdict and hands the fixes back to the main session.
