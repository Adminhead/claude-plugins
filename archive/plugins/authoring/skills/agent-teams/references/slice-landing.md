# Slice landing

Read this when teammates or subagents work on slices in separate git worktrees and their branches must merge into one parent branch. Two slices that land at once can each pass their check against an old parent and then break it together. Landing one slice at a time, over the current parent, removes that race.

## Contract file

Write one file at `.agents/plans/<slug>-contract.md` before spawning, owned by the lead, and quote its path in every brief. Teammates read it and never edit it. Adapt this template:

```markdown
# Slice rules

Parent branch: <branch>
Land command: <path>/land-slice.sh <parent-branch> "<check command>"

## Ownership
| Slice | Branch | Owns (files or directories) |
| --- | --- | --- |
| <name> | <slice-branch> | <paths> |

## Shared files
<Files several slices must touch, each with one named owner. Others send the owner the change they need.>

## Read-only
<Files nobody edits: lockfiles, generated output, encrypted secrets, shared state.>

## Checks
<The command each slice runs before landing. It must pass on the rebased branch.>
```

For shared infrastructure state (Terraform or OpenTofu), add the rule that applies are targeted at the slice's own module, use a lock timeout, and apply a saved plan file.

## Land protocol

A slice lands only through `land-slice.sh`, run from the slice's worktree with its branch checked out and its changes committed:

```
${CLAUDE_PLUGIN_ROOT}/scripts/land-slice.sh <parent-branch> "<check command>"
```

The script does these steps under an exclusive `flock` on `<git-common-dir>/slice-land.lock`:

1. Rebase the slice branch on the parent. On a conflict it aborts the rebase and refuses.
2. Run the check command in the slice worktree. A non-zero exit refuses.
3. Fast-forward the parent to the slice, in the parent's worktree if it is checked out.
4. Release the lock by exiting.

The lock queues a second lander until the first has finished, so each check runs against the parent as it will be.

## When it refuses

Exit code 1 means the parent did not move. The slice branch is rebased in place after a failed check, or unchanged after a conflict.

- Conflict: the slice and the parent changed the same lines. Resolve it in the slice worktree by rebasing by hand, or ask the owner of the other change. Then land again.
- Failed check: fix the slice and land again. Do not weaken the check to get past it.

Exit code 2 means a usage problem, such as a detached HEAD or uncommitted tracked changes.
