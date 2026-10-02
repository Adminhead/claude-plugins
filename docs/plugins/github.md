# github

Adds three GitHub skills: authoring and debugging Actions workflows, configuring Dependabot, and triaging a PR's review comments. They replace the user-level `github-actions`, `github-dependabot`, and `pr-comments` skills.

## What it adds

| Skill | Replaces | Purpose |
| --- | --- | --- |
| `github:actions` | `github-actions` | Create, modify, review, and debug workflows and custom actions with least-privilege permissions and a clear trust boundary |
| `github:dependabot` | `github-dependabot` | Configure, review, and troubleshoot Dependabot version and security updates |
| `github:pr-comments` | `pr-comments` | Pull a PR's unresolved review threads and review summaries into context, triage them, then fix the ones you pick. Read-only on GitHub |

Old bare names no longer work. Use the `github:` prefix.

## Requirements

- `gh`, authenticated (`gh auth status`). All three skills use it.
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
2. Start a fresh session. The skill list should show `github:actions`, `github:dependabot`, and `github:pr-comments`.
3. Optionally run the offline fixture tests for the PR fetcher. They need only `jq`.
   ```
   plugins/github/skills/pr-comments/tests/check.sh
   ```

## How `github:pr-comments` works

- It is manual only (`disable-model-invocation`). Run `/github:pr-comments [PR number|URL]`. With no argument it uses the current branch's PR.
- The skill's `allowed-tools` grant lets it run its own `fetch.sh` (found through `${CLAUDE_SKILL_DIR}`) without a prompt. The grant covers only that script.
- `fetch.sh` runs `gh pr view` and one `gh api graphql` query. It lists unresolved, non-outdated threads (`T<n>`) and each bot's latest review summary (`R<n>`). It drops Dependabot and GitHub Actions comments.
- Claude shows a triage table with an action per row: `fix`, `push back`, or `clarify`. It waits for you to pick rows, then fixes only those.
- It never posts, replies, resolves, approves, requests review, or pushes. For rows it skips, it drafts replies for you to paste.

## Limits

- `github:pr-comments` was not run live against a real PR during the migration. Its offline fixture tests pass.
- `github:pr-comments` makes fixes only on the PR's head branch. If another branch is checked out, it asks you to switch.
- `github:actions` is not for Dependabot config (use `github:dependabot`) or for triggering dispatches, releases, or deployments.
- `github:dependabot` is not for general workflows (use `github:actions`) or for merging Dependabot PRs.
- Without `gh` auth, the `gh` commands the skills compose will fail. `fetch.sh` exits with an error if `gh` or `jq` is missing.

## Disable or uninstall

| Task | Command |
| --- | --- |
| Disable | `claude plugin disable github@adminhead` |
| Uninstall | `claude plugin uninstall github@adminhead` |

The plugin ships only skills, so both commands remove them. Start a new session to be sure they are gone.
