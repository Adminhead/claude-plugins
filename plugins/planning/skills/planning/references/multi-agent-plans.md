# Plans that several agents execute

Read this when a plan will be executed by more than one agent in parallel, or when each step must be executable cold by a fresh agent in a later session. A single implementer needs only the main plan shape. To carry out the finished plan, use `implement-plan` if installed.

## Task brief

Give each agent a brief it can act on without your conversation or the other steps. A fresh agent reading only its brief should be able to start.

- Objective, in one sentence
- Context: the files to read first, the decisions already made that it must not reopen, and the interfaces it consumes
- Files or directories it owns (its write boundary)
- Requirements and the interface contract it must meet or consume
- Acceptance criteria, the exact command that proves them, and the invariants that must still hold afterwards (for example "existing tests pass", "no provider imports in core")
- Rollback: how to undo the step if it lands broken
- What is out of scope, and when to stop and report

State the contract between lanes explicitly, since a mismatch there is the usual integration failure. Give the strongest model the steps that set an interface or carry the most design risk; routine implementation steps can run on the default.

## Lane matrix

Parallelize only lanes whose write surfaces don't collide.

| Lane | Write surface | Risk | Verification | Depends on |
| --- | --- | --- | --- | --- |
| | | | | |

- Two lanes that edit the same file, table, or service run in sequence, or in separate worktrees with a named merge step.
- Gate destructive commands, migrations, and live deploys behind an explicit step instead of running them in a parallel lane.
- Shared contracts, types, and schemas land before the lanes that use them.

## Dependency graph

Prefer a wide, shallow graph. Name the critical path, because it sets the minimum time, and put the riskiest or least certain lane on it early so a failure surfaces while there is still room to adjust.

## Changing the plan mid-run

When a lane finds a blocker that changes the plan, pause the dependent lanes, update the matrix, and record the change (what changed, why, and which lanes it affects). Split, insert, skip, or reorder steps through that record rather than silently. A short change log keeps every agent working from the same plan.

---

The cold-start brief fields, per-step rollback, invariants, and model-tier guidance are adapted from the blueprint skill in ECC (Affaan Mustafa), MIT. See `LICENSE` in this plugin.
