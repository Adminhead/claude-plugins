---
name: experiment-loop
description: Run a bounded autonomous optimize-and-measure loop on a dedicated git branch, with one hypothesis per commit, a fixed metric command, keep-or-revert decisions, and a results log. Use when the user wants many unattended experiments against a measurable goal such as benchmark time, bundle size, memory, or test pass rate. Not for a single optimization (efficient:coding, efficient:problem-solving), planning the surrounding work (efficient:planning), pure polling or scheduling (the /loop and /schedule built-ins), or goals with no command that measures them.
---

# Experiment Loop

Iterate on a measurable goal without supervision: change one thing, measure, keep the change only if the metric improves, and log everything. The loop runs autonomously inside a scope, a budget, and a boundary that the user confirmed up front. The user keeps the last switch, so the loop ends with a branch and a report and never merges or ships.

## When a loop is worth it

Build a loop only when all four hold. If one fails, do the work by hand or fix the gap first.

- The task is worth repeating many times, not once.
- A command can measure the outcome without a person judging it.
- The token and time budget can absorb many runs.
- You can run the command and read its result in this environment.

## Setup

Settle these with the user before any experiment, then show them back as a table and wait for a yes. Autonomy starts only after that confirmation, because a loop can't ask mid-run and will carry a wrong assumption to the end.

| Item | What to pin down |
| --- | --- |
| Goal and metric | The exact command, how to extract one number from its output, and whether lower or higher is better |
| Scope | Files and directories the loop may edit, and files that are off limits |
| Boundary | What must not happen, such as tests staying green, none deleted or weakened, the public API unchanged, no new dependencies |
| Budget | Maximum experiments, a time limit per run, and any spend cap |
| Retry cap | How many failed fixes an experiment gets before it is abandoned (default 2) |
| Simplicity | Whether a small gain is worth added complexity (default no) |

Check that the goal is machine-decidable: someone who doesn't know the project can run one command and tell whether an experiment helped. "Make it faster" fails this test, and "p95 of `bench.sh` under 120 ms with `make test` green" passes. A done-criterion alone invites gaming, such as deleting the tests that fail, so always pair it with the boundary.

Keep the judge outside the loop's reach. The metric command, benchmark inputs, and acceptance tests sit outside the editable scope, so an experiment can't improve the number by changing how it is measured. Prefer a metric anchored to an external reference over one the code asserts about itself.

## Branch and baseline

1. Confirm this is a git repository with a clean working tree. If there are uncommitted changes, stop and ask whether to commit or stash them, or to run in a separate worktree (`git:worktree` if installed). The loop's commits and reverts must never mix with the user's work.
2. Create a dedicated branch (`git switch -c experiment/<tag>`, for example with today's date). All experiments happen there.
3. Create `results.tsv` and `run.log` in the repo root and add both names to the file at `"$(git rev-parse --git-path info/exclude)"` (in a linked worktree `.git` is a file, so don't hardcode the path), which keeps them untracked without touching a tracked file. Header for the log: `experiment`, `commit`, `metric`, `status`, `description`, separated by tabs.
4. Run the metric command on the unmodified code and log it as experiment 0, status `baseline`. For a noisy metric, run it several times and note the spread. A later gain only counts when it exceeds that noise.
5. Report the baseline to the user and start.

## The loop

For each experiment:

1. **Hypothesis.** Read the log and the code, then pick one idea that the results haven't already ruled out.
2. **Edit** the in-scope files with a small, focused change. Before editing, record the starting point with `pre=$(git rev-parse HEAD)`.
3. **Commit** with a short message (`experiment: <what changed>`) before measuring, so every attempt is a recoverable unit.
4. **Run** the metric command with output redirected to `run.log`, which keeps long output out of the context. Kill a run that exceeds twice its expected time and treat it as a crash.
5. **Measure.** Extract the number. If extraction fails, read the end of `run.log` for the error.
6. **Decide.**
   - Improved beyond noise, boundary intact: keep the commit and make it the new best.
   - Same, worse, or boundary broken: undo it with `git revert --no-edit "$pre"..HEAD`, which reverts only this experiment's commits. A revert adds a commit instead of discarding history, so it can't destroy anything the loop didn't create.
   - Crash: if the cause is trivial (a typo, a missing import), fix it in a new commit and rerun. After the retry cap, revert the experiment as above and log it as a crash.
7. **Log** a row in `results.tsv`, then go back to step 1.

Don't run `git reset --hard`, force-push, or rewrite history in this loop. Reverts keep the full record and can only undo commits the loop made.

## Choosing the next experiment

- Take the cheap, obvious ideas first, then follow directions that showed promise.
- After three to five failures in a row, change approach instead of tuning the same idea.
- Combine two kept changes that improved the metric separately.
- Try removing code now and then. If the metric holds, the simpler version wins.
- Save large architectural changes for last, and flag them to the user rather than attempting them unprompted when they cross the confirmed scope.

## Staying inside the confirmed scope

The loop doesn't pause to ask whether to continue. It does stop and ask when something falls outside what the user confirmed: editing an out-of-scope file, adding a dependency, changing the environment, a goal that turns out to be ambiguous, or any write to shared state such as pushing, publishing, or opening a pull request. A wrong answer here costs more than a pause.

## Report

When the budget runs out, the user interrupts, or ideas are exhausted, print the results table and summarize the number of experiments (kept, discarded, crashed), baseline against final metric with the percentage change, and the few changes that mattered most. Show `git diff --stat <start>..HEAD` and the `keep` rows from `results.tsv` for the kept work (the log also holds reverts), and suggest what a person might try next, including ideas that were too risky to run unattended. Leave merging to the user.

## Further reading

Read `references/loop-design.md` when the loop will run on a schedule or without anyone watching, or when reviewing a loop someone else wrote.
