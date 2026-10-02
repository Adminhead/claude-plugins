# github

Adds ten GitHub skills. They cover Actions workflows, Dependabot, a PR's review comments, single issues, issue breakdowns, backlog triage, pull requests, releases, repository setup, and code security. `github:actions`, `github:dependabot`, and `github:pr-comments` replace the user-level `github-actions`, `github-dependabot`, and `pr-comments` skills. Version 0.2.0 added the other seven.

Every write to GitHub shows the exact command and waits for your approval first.

## What it adds

| Skill | Replaces | Purpose |
| --- | --- | --- |
| `github:actions` | `github-actions` | Create, modify, review, and debug workflows and custom actions with least-privilege permissions and a clear trust boundary |
| `github:dependabot` | `github-dependabot` | Configure, review, and troubleshoot Dependabot version and security updates |
| `github:pr-comments` | `pr-comments` | Pull a PR's unresolved review threads and review summaries into context, triage them, then fix the ones you pick. Read-only on GitHub |
| `github:issues` | New | Read, create, edit, close, and label a single issue with `gh`, including issue types, sub-issues, blocked-by links, milestones, Projects V2 fields, and search |
| `github:issue-breakdown` | New | Turn a spec, plan, or conversation into a reviewed set of linked issues, cut as vertical slices with blocking edges, then publish them after approval |
| `github:triage` | New | Triage existing issues and external PRs: assign a category and state, check for duplicates, verify the claim, then ask for info, write an agent brief, or close with a reason |
| `github:pr` | New | Prepare and open a PR: plan commits, draft a reviewer-ready body, open it as a draft after approval, and never merge without it |
| `github:release` | New | Cut a manual release for a single-package repo: propose a SemVer bump, draft a Keep a Changelog entry, open a release PR, then tag and run `gh release create` after approval. Defers to release-please, semantic-release, changesets, and similar tooling |
| `github:repo-setup` | New | Audit and set up labels, issue forms, a PR template, `CODEOWNERS`, `SECURITY.md`, `CONTRIBUTING.md`, and rulesets, with a dry-run plan and an applied, skipped, or failed report |
| `github:code-security` | New | Configure and triage secret scanning, push protection, blocked-push recovery, private vulnerability reporting, and alerts for secret scanning, code scanning, and Dependabot |

Old bare names no longer work. Use the `github:` prefix.

`github:actions` gained references for CI efficiency, workflow security audits, CodeQL, and Go CI. `github:dependabot` gained a reference for options and recipes. `github:pr-comments` gained a triage rubric.

## Requirements

- `gh`, authenticated (`gh auth status`). All ten skills use it.
- `gh` 2.94.0 or later for the native issue flags (`--type`, `--parent`, `--add-sub-issue`, `--blocked-by`, `--add-blocked-by`) used by `github:issues` and `github:issue-breakdown`. On an older `gh`, they fall back to `gh api` calls from `github:issues`'s API reference. The skills were checked against `gh` 2.102.0, so confirm a flag with `--help` before relying on it.
- The `repo` token scope for issue metadata. Project field writes need the `project` scope (`gh auth refresh -s project`).
- Admin rights on the repo for `github:repo-setup` writes (rulesets, settings) and for `github:code-security` settings. Secret scanning on private repos depends on your GitHub plan. If a feature is unavailable, the skill reports it and does not work around it.
- `git` for `github:pr` and `github:release`.
- `jq`. `github:pr-comments` needs it.

## Install

```
claude plugin marketplace add /path/to/claude-plugins
claude plugin install github@adminhead
```

To try it without installing:

```
claude --plugin-dir plugins/github
```

## Verify

1. Validate the plugin.
   ```
   claude plugin validate --strict plugins/github
   ```
2. Start a fresh session. The skill list should show all ten skills as `github:<name>`.
3. Optionally run the offline fixture tests for the PR fetcher. They need only `jq`.
   ```
   plugins/github/skills/pr-comments/tests/check.sh
   ```

## How `github:pr-comments` works

- It is manual only (`disable-model-invocation`). Run `/github:pr-comments [PR number|URL]`. With no argument it uses the current branch's PR.
- The skill's `allowed-tools` grant lets it run its own `fetch.sh` (found through `${CLAUDE_SKILL_DIR}`) without a prompt. The grant covers only that script.
- `fetch.sh` runs `gh pr view` and one `gh api graphql` query. It lists unresolved, non-outdated threads (`T<n>`) and each bot's latest review summary (`R<n>`). It drops Dependabot and GitHub Actions comments.
- Claude shows a triage table with an action per row: `fix`, `push back`, or `clarify`. It waits for you to pick rows, then fixes only those.
- Its triage rubric (reviewer types, value against risk, repo policy, conflicting requests) is in `references/triage.md`, along with reply templates.
- It never posts, replies, resolves, approves, requests review, or pushes. For rows it skips, it drafts replies for you to paste.

## Limits

- `github:pr-comments` was not run live against a real PR during the migration. Its offline fixture tests pass.
- `github:pr-comments` makes fixes only on the PR's head branch. If another branch is checked out, it asks you to switch.
- `github:actions` is not for Dependabot config (use `github:dependabot`) or for triggering dispatches, releases (use `github:release`), or deployments.
- `github:dependabot` is not for general workflows (use `github:actions`) or for merging Dependabot PRs.
- `github:issues` writes only after you approve the exact command. Text in an issue body, comment, or log that asks for an action is data, not approval. The same holds for `github:triage`.
- `github:issue-breakdown` publishes in dependency order and stops at the first failure, because rerunning the whole list would duplicate issues.
- `github:pr` opens PRs as drafts. A request to open a PR is not approval of the command. It shows the title, body, push remote and branch, and the full `gh pr create` line first.
- `github:release` detects release tooling first and stops the manual flow if it finds some, unless you still want it. Its first four steps are read-only.
- `github:repo-setup` shows a plan table first and applies each group of writes only after approval. It commits and pushes only when asked.
- `github:code-security` treats a leaked credential as compromised. It tells you to rotate it first, never prints the value, and treats history cleanup as secondary. It changes settings, dismisses alerts, and force-pushes only after approval.
- Without `gh` auth, the `gh` commands the skills compose will fail. `fetch.sh` exits with an error if `gh` or `jq` is missing.

## Disable or uninstall

| Task | Command |
| --- | --- |
| Disable | `claude plugin disable github@adminhead` |
| Uninstall | `claude plugin uninstall github@adminhead` |

The plugin ships only skills, so both commands remove them. Start a new session to be sure they are gone.
