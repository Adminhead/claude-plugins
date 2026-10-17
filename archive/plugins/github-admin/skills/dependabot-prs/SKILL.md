---
name: dependabot-prs
description: "Sweep a repo's open Dependabot pull requests: group them by ecosystem, merge the green ones one at a time, ask Dependabot to rebase stale ones, rerun flaky checks, and report red ones with a result table. Use when asked to \"merge the dependabot PRs\", \"run through the dependabot PRs\", or clear a Dependabot backlog. Merges only PRs whose checks pass. Not for Dependabot config (`github-admin:dependabot`), failing-check diagnosis (`github-admin:actions`), or reviewing non-Dependabot PRs (`github:triage`)."
---

# Dependabot PR sweep

Merge the open Dependabot PRs that are safe to merge, and report the rest. The user's request authorizes merging green PRs and nothing else. It does not authorize fixing red ones, editing code, or changing branch protection.

## Never

- Pass `--admin` or any flag that skips checks or branch protection.
- Merge a PR whose checks are failing, pending, or missing a required check.
- Fix a red PR (code changes, lockfile edits, pushing to the Dependabot branch) unless the user asks after seeing the report.
- Merge a PR not authored by Dependabot, even if it sits in the same list.

## Steps

1. **List.** Run `gh pr list --app dependabot --state open --json number,title,headRefName,mergeable,statusCheckRollup,url --limit 100`. Group by ecosystem, read from the title or branch (`dependabot/npm_and_yarn/...`, `dependabot/github_actions/...`, `dependabot/pip/...`). Show the grouped list before merging.
2. **Pick the merge method.** Run `gh repo view --json squashMergeAllowed,mergeCommitAllowed,rebaseMergeAllowed` and use the first allowed of squash, merge, rebase. Use it for every merge.
3. **Merge one at a time.** For each PR, oldest first, security updates before version updates:
   - Re-read it just before merging: `gh pr view <n> --json state,mergeable,statusCheckRollup`. Earlier merges change the base.
   - Count `SUCCESS`, `NEUTRAL`, and `SKIPPED` conclusions as passing. `FAILURE`, `CANCELLED`, `TIMED_OUT`, or a check still running is not.
   - If `mergeable` is `UNKNOWN`, GitHub is still computing it. Wait a few seconds, re-check, and don't merge until it reads `MERGEABLE`.
   - If every check passed (no checks configured counts as passing) and the PR is `MERGEABLE`, run `gh pr merge <n> --<method> --delete-branch`. A refusal is a stop for that PR, not a reason to retry with other flags.
   - After each merge, go on to the next PR and re-check it from scratch. Don't merge from the initial listing.
4. **Handle the rest, per PR:**
   - **Stale** (`mergeable` is `CONFLICTING`, or the branch is behind and the repo requires up-to-date branches): comment `@dependabot rebase` with `gh pr comment <n> --body "@dependabot rebase"`. Re-check it after the other PRs. If it is still not ready, report it.
   - **Flaky** (a failed check whose log shows a transient error, per `github-admin:actions` `references/failure-classes.md` if installed): rerun it once with `gh run rerun <run-id> --failed`, watch it, and merge if it turns green.
   - **Red** (a real failure after at most one rerun): leave it alone and report the failing check and the first error line.
5. **Report** a table with one row per PR and no PR left out:

   | PR | Ecosystem | Update | Result | Note |
   | --- | --- | --- | --- | --- |
   | #12 | npm | lodash 4.17.20 to 4.17.21 | merged | squash |
   | #15 | pip | requests 2.31 to 2.32 | red | `test_api` fails: ... |

   Results are `merged`, `rebase requested`, `rerun`, `red`, or `skipped` with the reason. End by offering to fix the red ones (`github-admin:actions` for workflow causes).
