# experiment-loop

Adds `experiment-loop:experiment-loop`, a skill that runs an optimize-and-measure loop on a dedicated git branch. `experiment-loop` is not in the `baseline` set. Install it where you want the loop, usually per project.

## What it adds

| Skill | Purpose |
| --- | --- |
| `experiment-loop:experiment-loop` | Bounded, unattended optimize-and-measure loop on a dedicated branch: one hypothesis per commit, a fixed metric command, keep-or-revert, and a results log |

It is for many experiments against a goal you can measure, such as benchmark time, bundle size, memory, or test pass rate. For one optimization, use `coding-core:coding` or `coding-core:problem-solving`. For planning the surrounding work, use `coding-core:planning`.

## How it runs

1. It checks that the repo is a git repository with a clean working tree. If there are uncommitted changes, it asks you to commit, stash, or use a separate worktree.
2. It creates a dedicated branch, `experiment/<tag>`, and does all its work there.
3. Each experiment is one hypothesis and one commit. The metric command decides whether the commit stays or is reverted, and each result goes into the results log.

## Requirements

- `git`, and a repo with a clean working tree.
- A command that measures the goal, which you can run in this environment.

## Install

```
claude plugin install experiment-loop@adminhead --scope local
```

To try it without installing:

```
claude --plugin-dir plugins/experiment-loop
```

## Verify

1. Validate the plugin.
   ```
   claude plugin validate --strict plugins/experiment-loop
   ```
2. Start a fresh session. The skill list should show `experiment-loop:experiment-loop`.

## Limits

- The loop runs unattended only after you confirm its setup table. Confirm the scope, budget, and boundary before you say yes, because the loop cannot ask mid-run.
- Its commits and reverts stay on the experiment branch, so they never mix with your work on another branch.

## Disable or uninstall

| Task | Command |
| --- | --- |
| Disable | `claude plugin disable experiment-loop@adminhead` |
| Uninstall | `claude plugin uninstall experiment-loop@adminhead` |

The plugin ships only a skill, so both commands remove it. Start a new session to be sure it is gone.
