# Efficiency

Read when the task is to cut CI time or cost, trim wasted runs, or review a workflow for waste. Measure first, change little, and report what you proved.

## Audit order

1. Inventory: `rg -n "on:|concurrency:|paths:|paths-ignore:|strategy:|matrix:|cache" .github/workflows`, plus any docs that state CI expectations (required checks, supported versions).
2. Evidence: `gh run list --workflow <file> --limit 20 --json databaseId,event,conclusion,createdAt,updatedAt` and `gh run view <id> --json jobs` for per-job durations. With no workflows yet, define a minimal baseline (required checks, runtimes, triggers) and add breadth only on need.
3. Look for waste in this order, cheapest and safest first:
   - dependency caches missing or keyed on the wrong file
   - missing `concurrency` cancellation on PR runs
   - triggers broader than the work (every push plus every PR, or whole-suite runs for docs-only changes)
   - the same check running in two workflows or jobs
   - expensive jobs that run regardless of what changed

If you only have pasted files and no `gh` access, say the audit is static and not confirmed against live runs.

## Guardrails

Check each proposed fix against these before recommending it:

1. **Keep required validation.** Drop any fix that removes release, schema, migration, or shared-library checks.
2. **Keep parallelism unless cost is the stated priority.** Merging jobs lengthens the critical path. Accept that only when the user ranked cost above latency, and say how much longer feedback gets.
3. **Keep documented matrix legs.** A leg with an explicit version or platform commitment stays. Drop only legs with no stated reason.
4. **Write-back jobs are opt-in.** A formatter or bot job that commits to a branch should run on a label, a manual dispatch, or a comment command. Flag an automatic one and suggest the opt-in instead of deleting it.
5. **Separate repo from org settings.** Split a recommendation that mixes workflow YAML with org or account settings (runner groups, cache limits, required workflows) into two, since they need different approvals.

## Pick the top three fixes

Candidates:

1. Dependency caching with lockfile-based keys
2. `concurrency` with `cancel-in-progress` for PR runs
3. Removing duplicate coverage before merging jobs
4. Narrower triggers
5. Matrix breadth matched to risk
6. Parallelizing independent jobs on the critical path

Keep the candidates that have audit evidence and pass the guardrails. Rank by estimated minutes saved per day (saving per run times runs per day) and propose at most three. A longer list dilutes the ones that matter.

## Trigger scoping

- Use `paths` or `paths-ignore` when a whole workflow should skip for some file classes. Use job-level gating when the event filter is too coarse, with explicit changed-file detection when reliability matters.
- A skipped workflow can leave a required check pending. Check the repo's required checks and merge queue before narrowing (see the failure patterns in SKILL.md).
- If a workflow-only change still runs the full suite, the gating is too broad.
- Keep a small change-detection job separate from the heavy jobs when that makes skipping visible.

## Matrix by event

Match breadth to the decision being made:

| Change | Matrix |
| --- | --- |
| Release or explicit compatibility check | Full matrix |
| Runtime, packaging, or framework-integration change | Reduced compatibility matrix |
| Ordinary code change | One representative leg on the newest supported version |
| Clearly non-runtime change (docs, copy) | No heavy test job, if lighter protection exists |

Derive supported versions from the project's own declared range (a manifest, `go.mod`, a support policy), not from habit.

## Label-triggered jobs

For a job that runs on a label, listen to `pull_request` with `types: [opened, synchronize, reopened, labeled, unlabeled]`. The default types exclude `labeled` and `unlabeled`, and without `unlabeled` removing the label never re-evaluates the job.

## Validate live

Static review proves little about triggers. When `gh` and a non-protected branch are available, and the user agrees to the extra runs:

- Trigger each `workflow_dispatch` workflow once.
- Prove stale-run cancellation with two quick pushes to the same PR.
- Prove path gating with a follow-up commit that touches only ignored files, on a branch that already has runs. A first push of a new branch is not a clean test, because GitHub diffs it against the parent of the deepest pushed commit, so the whole branch counts as changed. ([paths filter diffs](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#git-diff-comparisons))
- Confirm in the run UI that heavy jobs show as skipped.

Treat behavior that differs from the YAML as a real bug. If you cannot run live checks, say so.

## Report

Give four parts: the waste found, the fixes proposed with their evidence, what was proven live versus checked locally, and impact. For impact, separate expected from measured savings, and separate PR wall-clock time from total runner time. Measured means a before and after sample from real runs after caches warm. Without that, report the mechanism and not minutes saved. Name confounders such as cache warm-up, a changed matrix, a runner change, or unusually small PRs.

Cache and action examples take their `uses:` ref from the version policy in SKILL.md, not from other repos.
