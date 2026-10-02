# Plans that several agents execute

Read this when a plan will be executed by more than one agent in parallel. A single implementer needs only the main plan shape. For phased plans meant for `/do` execution, `claude-mem:make-plan` (if installed) applies instead.

## Task brief

Give each agent a brief it can act on without your conversation.

- Objective, in one sentence
- Files or directories it owns (its write boundary)
- Requirements and the interface contract it must meet or consume
- Acceptance criteria and the check that proves them
- What is out of scope, and when to stop and report

State the contract between lanes explicitly, since a mismatch there is the usual integration failure.

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

When a lane finds a blocker that changes the plan, pause the dependent lanes, update the matrix, and record the change (what changed, why, and which lanes it affects). A short change log keeps every agent working from the same plan.
