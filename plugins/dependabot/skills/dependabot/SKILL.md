---
name: dependabot
description: Configures and troubleshoots GitHub Dependabot (.github/dependabot.yml ecosystems, groups, cooldown, ignore rules, private registries) and sweeps open Dependabot PRs, merging only green ones. Use when editing dependabot.yml, diagnosing missing Dependabot PRs or alerts, or asked to "merge the dependabot PRs" or clear a Dependabot backlog. Not for Forgejo or Codeberg (`renovate`).
---

# GitHub Dependabot

Two jobs: change Dependabot config, or sweep the open Dependabot PRs ([Sweep open PRs](#sweep-open-prs)). Use the `gh` CLI throughout.

Not for Forgejo repos or Renovate config (`renovate`), general Actions workflows or failing-check diagnosis (`gh-actions`), alert triage and dismissal (`gh-code-security`), or reviewing non-Dependabot PRs (`gh-triage`).

**Forge gate.** Proceed when the `origin` host is github.com or one `gh auth status --hostname <host>` knows; otherwise stop with "not a GitHub remote; on Forgejo or Codeberg use renovate if installed".

## Configure

Change `.github/dependabot.yml` from evidence in the repo's manifests and GitHub's own logs. Read [official docs index](references/official-github-docs.md) before using an unfamiliar option or ecosystem. Read [options and recipes](references/options-and-recipes.md) for cooldown, grouping, `directories` globs, security-only mode, cron schedules, less common ecosystem values, and example configs.

### Safety boundary

- Enabling alerts or security updates, changing repo or org settings, and creating or rotating Dependabot secrets are admin actions. Don't do them without explicit authorization.
- Never put credential values in `dependabot.yml`, commits, logs, or output. Reference secrets as `${{secrets.NAME}}`.
- There is no local validator or dry run. GitHub evaluates the file only once it is on the default branch, so don't claim it was validated locally.

### Workflow

1. **Classify the request.** Version updates keep dependencies current on a schedule. Security updates remediate alerts. Decide whether the task is to configure, change policy, diagnose, or verify.
2. **Inspect.** Find the default branch, the existing `.github/dependabot.yml` or `.yaml`, and every manifest and lockfile with its directory. Check existing entries, open Dependabot PRs, and alerts:

   ```bash
   gh repo view --json defaultBranchRef --jq .defaultBranchRef.name
   gh pr list --app dependabot --state all --limit 20
   gh api repos/{owner}/{repo}/dependabot/alerts --jq '.[] | {number,state,dependency: .dependency.package.name}'
   gh api repos/{owner}/{repo}/vulnerability-alerts -i   # 204 = alerts enabled, 404 = disabled
   ```

   The alerts endpoints need a token with security-events access. Report a permission error rather than working around it.
3. **Map manifests to entries.** Write one `updates` entry per ecosystem and manifest directory (or use `directories`), under `version: 2`. Confirm each ecosystem value and directory layout in GitHub's supported-ecosystems table rather than guessing from a file extension.
4. **Start minimal.** Keep established repo policy. A new entry looks like this:

   ```yaml
   version: 2
   updates:
     - package-ecosystem: "npm"
       directory: "/"
       schedule:
         interval: "weekly"
   ```

   Agree the schedule with the user. Set `open-pull-requests-limit` only when PR volume calls for it.
5. **Apply policy deliberately.**
   - `allow` narrows candidates and `ignore` applies after it, so a dependency matching both is ignored.
   - Prefer narrow ignores with a stated reason over broad or permanent ones.
   - Set labels, reviewers, assignees, `commit-message`, and `target-branch` only to match the existing workflow. If the repo uses release-please or commitlint, set `commit-message.prefix` so Dependabot commits parse.
   - Use `groups` for batching. Grouping security updates needs `applies-to: security-updates`. Use `multi-ecosystem-groups` only for coordinated cross-ecosystem updates.
6. **Private registries.** Declare them under top-level `registries` and reference them per entry. Credentials live in Dependabot secrets, and creating those needs authorization.
7. **Review the diff.** Check `version: 2`, directories, ecosystems, and that no credentials appear. Make sure policy changes don't block all desired updates, flood PRs, or alter unrelated entries.
8. **Verify after merge.** Confirm through PRs and the Dependabot logs (Insights → Dependency graph → Dependabot → Recent update jobs). Record the PR or log URL and time. If Dependabot hasn't run yet, report verification as pending.

### Diagnosis

- **No version-update PRs.** Check the config is on the default branch, the ecosystem and directory match real manifests, the schedule has elapsed, and PR limits or `allow`/`ignore` aren't suppressing updates. Then read the update job logs.
- **No security-update PRs.** This is separate from version updates. Check that the dependency graph, alerts, and security updates are enabled, and that the dependency appears in a manifest or lockfile. Ask before enabling anything.
- **Config rejected or ignored.** Compare keys, values, paths, and group syntax with the options reference, using the exact error from the logs.
- **Private registry auth failure.** Identify the registry and GitHub's reported error. Never put a token in YAML. Ask before touching secrets.
- **Unexpected or grouped PRs.** Check `allow`/`ignore` interplay, PR limits, schedule, groups, and target branch before changing a rule.

### Report

State version versus security scope, the branch, manifests, and directories inspected, the diff, any admin action left pending authorization, and post-merge evidence or its pending status.

## Sweep open PRs

Merge the open Dependabot PRs that are safe to merge, and report the rest. The user's request authorizes merging green PRs and nothing else. It does not authorize fixing red ones, editing code, or changing branch protection.

### Never

- Pass `--admin` or any flag that skips checks or branch protection.
- Merge a PR whose checks are failing, pending, or missing a required check.
- Fix a red PR (code changes, lockfile edits, pushing to the Dependabot branch) unless the user asks after seeing the report.
- Merge a PR not authored by Dependabot, even if it sits in the same list.

### Steps

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
   - **Flaky** (a failed check whose log shows a transient error, per the `gh-actions` skill's failure classes if installed): rerun it once with `gh run rerun <run-id> --failed`, watch it, and merge if it turns green.
   - **Red** (a real failure after at most one rerun): leave it alone and report the failing check and the first error line.
5. **Report** a table with one row per PR and no PR left out:

   | PR | Ecosystem | Update | Result | Note |
   | --- | --- | --- | --- | --- |
   | #12 | npm | lodash 4.17.20 to 4.17.21 | merged | squash |
   | #15 | pip | requests 2.31 to 2.32 | red | `test_api` fails: ... |

   Results are `merged`, `rebase requested`, `rerun`, `red`, or `skipped` with the reason. End by offering to fix the red ones (`gh-actions` for workflow causes).
