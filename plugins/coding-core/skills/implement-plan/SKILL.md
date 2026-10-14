---
name: implement-plan
description: Execute an approved multi-slice implementation plan file end to end. Mirrors the slices as tasks, runs independent slices in parallel worktrees, and after each slice checks, reviews, commits when per-slice commits were approved, and updates a Status block in the plan, then continues to the next slice without asking. Use when the user says "implement this plan", "continue implementing", or points at a plan file to carry out. Not for writing or revising the plan (coding-core:planning), a single bounded edit (coding-core:coding), claude-mem plans written by make-plan (`claude-mem:do`, if installed), or review-only passes (review:second-opinion).
---

# Implement Plan

Carry a plan file through to done, one slice at a time, without waiting for a "continue" between slices. Takes `<path>` to the plan.

Contract: "Once the user approves a multi-slice plan that includes per-slice commits, commit each slice after its checks and review pass, then start the next one without asking. Stop only when blocked, on a decision the user owns, or before a destructive step."

For plans written by `claude-mem:make-plan`, use `claude-mem:do` (if installed) instead.

## Procedure

1. **Read the plan.** Extract the slices, their write surfaces, dependencies, acceptance checks, and whether it approves per-slice commits. If the plan is missing slices or checks, or contradicts itself, ask the user (AskUserQuestion) before starting.
2. **Mirror the slices.** Create one task per slice with TaskCreate, ordered by dependency, and mark each in progress and completed as you go. Add a `## Status` block to the plan if it has none: slices done, in progress, and what's left.
3. **Run slices.** Run slices with disjoint write surfaces in parallel, each in its own worktree (Agent with `isolation: "worktree"`), then merge their results in plan order. A worktree subagent sees only committed files, so quote the slice in its brief when the plan file is uncommitted or ignored. Run dependent slices in sequence. Brief each implementer with the slice text, its write boundary, acceptance checks, and a stop rule. Use `coding-core:coding` for the work itself.
4. **Close each slice.**
   - Run the slice's checks, and read the output instead of trusting the agent's claim.
   - Review the diff against the slice's acceptance criteria. Use `review:review-loop` for anything non-trivial, or a single reviewer subagent for a small diff.
   - Commit if the plan or the user approved per-slice commits. Otherwise leave changes uncommitted and say so in Status.
   - Update the Status block in the plan file: slice done, commit, and what's left.
5. **Continue.** Start the next slice immediately.

## When to stop

- A check still fails after three materially different attempts. Report what was tried, the evidence, and the blocker.
- A decision the user owns: scope change, a design fork the plan doesn't settle, or spending money.
- Before a destructive step: data deletion, history rewrites, force-pushes, dropping resources.

Pushing is out of scope unless the user asks. When stopped, record the reason in the Status block so a later session can resume from the file.

## Report

At the end or at a stop, list slices done, commits made, checks run, review outcomes, and what is left.
