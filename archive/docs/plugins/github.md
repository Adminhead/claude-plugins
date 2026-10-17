# github

Adds seven GitHub workflow skills in `github`, and the GitHub remote MCP server. They cover issues, issue breakdowns, backlog triage, pull requests, review comments, shipping work from commit through merge, and releases. `github-admin` adds five repository-administration skills, covered on this page too: Actions workflows, Dependabot, merging Dependabot PRs, repository setup, and code security. `github` is in the `baseline` set. `github-admin` is not, so install it at user scope where you administer repos.

Every write to GitHub shows the exact command and waits for your approval first. The one exception is `github-admin:dependabot-prs`, which merges green Dependabot PRs on your request alone.

## What it adds

| Skill | Purpose |
| --- | --- |
| `github:issues` | Read, create, edit, close, and label a single issue with `gh`, including issue types, sub-issues, blocked-by links, milestones, Projects V2 fields, and search |
| `github:issue-breakdown` | Turn a spec, plan, or conversation into a reviewed set of linked issues, cut as vertical slices with blocking edges, then publish them after approval |
| `github:triage` | Triage existing issues and external PRs: assign a category and state, check for duplicates, verify the claim, then ask for info, write an agent brief, or close with a reason |
| `github:pr` | Prepare and open a PR: plan commits, draft a reviewer-ready body, open it as a draft after approval, and never merge without it |
| `github:pr-comments` | Pull a PR's unresolved review threads and review summaries into context, triage them, then fix the ones you pick. Read-only on GitHub |
| `github:ship` | Commit, push, and optionally open a ready PR, wait for checks, and merge, in one run. Takes `push`, `pr`, or `merge` as an optional level, or infers it from the request, followed by context for the commit message. Runs in the `github:shipper` agent. Stops at a rejected push or a failed check |
| `github:release` | Cut a manual release for a single-package repo: propose a SemVer bump, draft a Keep a Changelog entry, open a release PR, then tag and run `gh release create` after approval. Defers to release-please, semantic-release, changesets, and similar tooling |

## What github-admin adds

| Skill | Purpose |
| --- | --- |
| `github-admin:actions` | Create, modify, review, and debug workflows and custom actions with least-privilege permissions and a clear trust boundary |
| `github-admin:dependabot` | Configure, review, and troubleshoot Dependabot version and security updates |
| `github-admin:dependabot-prs` | Sweep open Dependabot PRs: group by ecosystem, merge the green ones one at a time with the repo-allowed method, request rebases for stale ones, rerun flaky checks, and report red ones in a result table |
| `github-admin:repo-setup` | Audit and set up labels, issue forms, a PR template, `CODEOWNERS`, `SECURITY.md`, `CONTRIBUTING.md`, and rulesets, with a dry-run plan and an applied, skipped, or failed report |
| `github-admin:code-security` | Configure and triage secret scanning, push protection, blocked-push recovery, private vulnerability reporting, and alerts for secret scanning, code scanning, and Dependabot |

## MCP server

| Field | Value |
| --- | --- |
| Server name | `github` (shown as `plugin:github:github`) |
| Tool names | `mcp__plugin_github_github__<tool>` |
| Transport | HTTP, `https://api.githubcopilot.com/mcp/` |
| Toolsets | GitHub's default toolset, read and write |
| Auth | `scripts/mcp-headers.sh`, run as a `headersHelper` on each connection |

Five skills carry a note to prefer the MCP tools for reads and search when the server is connected: `github:issues`, `github:issue-breakdown`, `github:pr`, `github:pr-comments`, and `github:triage`. They keep using `gh` for writes, and tell Claude not to call the server's write tools.

The `github-admin` skills do not carry the note. The default toolset has no actions, code security, secret protection, or Dependabot tools. You can add those toolsets with `X-MCP-Toolsets` in your own server config.

Claude Code defers MCP tool definitions (tool search), so the size of the toolset adds little to each session. A probe listed every server tool as deferred.

### Token source

`scripts/mcp-headers.sh` always runs `gh auth token --hostname github.com`. That returns the login `gh` has stored for github.com, in the keyring or `hosts.yml`, from `gh auth login`.

- Env-only `gh` auth (`GH_TOKEN`, `GITHUB_TOKEN`) does not work for the server. Claude Code strips environment variables whose names contain `TOKEN`, `SECRET`, `PASSWORD`, `KEY`, or `AUTH` from a `headersHelper`'s environment (a dated probe on Claude Code 2.1.288; the public MCP docs don't describe helper environments as of 2026-10-13).
- `--hostname github.com` keeps a GitHub Enterprise token from reaching `api.githubcopilot.com`, even when `GH_HOST` is set.
- If `gh` is missing or has no stored github.com login, the helper exits non-zero and the server stays disconnected. `/mcp` shows it.
- There is no override token variable. To change which token the server uses, change the stored login.

The helper logs the token source to stderr and never logs the token. The token goes to Claude Code on stdout, by design.

### Security

- The server is read/write on GitHub's default toolset (`context`, `repos`, `issues`, `pull_requests`, `users`).
- Its destructive tools include `delete_repository` (which also needs the `delete_repo` scope), `merge_pull_request`, `push_files`, and `delete_file`. Tools that create or update issues and PRs are there too.
- A default `gh auth login` grants `repo`, `read:org`, and `gist`. The `repo` scope alone allows pushing, deleting files, and merging across every repo you can reach.
- To narrow access, narrow the stored login. Run `gh auth login --hostname github.com` with a fine-grained personal access token (`--with-token`) instead of the OAuth default.
- The approval gate described above covers `gh` commands the skills compose. MCP tool calls go through Claude Code's normal tool permission prompt, one per call.

### Customizing

The plugin has no settings for narrowing the server. It always connects with the default toolset, read/write.

GitHub's remote server supports these controls. To use them, add your own MCP server entry, or change the plugin's defaults.

| Control | Form | Notes |
| --- | --- | --- |
| Toolsets | `X-MCP-Toolsets` header | Comma-separated list. Unknown names are silently ignored |
| Single tools | `X-MCP-Tools` header | Unknown names prevent the server from starting |
| Read-only | `X-MCP-Readonly` header, or `/readonly` URL path | |
| Lockdown | `X-MCP-Lockdown` header | |
| Insiders | `X-MCP-Insiders` header, or `/insiders` URL path | |
| Path forms | `/x/all`, `/x/{toolset}`, `/x/{toolset}/readonly` | |
| Insiders path forms | `/insiders`, `/readonly/insiders`, `/x/{toolset}/insiders`, `/x/all/insiders` | |

See the remote server guide in github/github-mcp-server (`docs/remote-server.md`) for the current list.

### Conflict

`claude-plugins-official` also ships a plugin named `github` with an MCP server named `github`. Do not enable both.

## Requirements

- `gh`, authenticated (`gh auth status`). All twelve skills in the two plugins use it.
- For the MCP server, the GitHub CLI with a stored github.com login (`gh auth login --hostname github.com`), and bash.
- The native issue flags (`--type`, `--parent`, `--add-sub-issue`, `--blocked-by`, `--add-blocked-by`) used by `github:issues` and `github:issue-breakdown` exist in `gh` 2.102.0 (checked 2026-10-13). On a `gh` without them, the skills fall back to `gh api` calls from `github:issues`'s API reference. The skills were checked against that version, so confirm a flag with `--help` before relying on it on another version.
- The `repo` token scope for issue metadata. Project field writes need the `project` scope (`gh auth refresh -s project`).
- Admin rights on the repo for `github-admin:repo-setup` writes (rulesets, settings) and for `github-admin:code-security` settings. Secret scanning on private repos depends on your GitHub plan. If a feature is unavailable, the skill reports it and does not work around it.
- `git` for `github:pr`, `github:ship`, and `github:release`.
- `jq`. `github:pr-comments` needs it.

## Install

```
claude plugin marketplace add /path/to/claude-plugins
claude plugin install github@adminhead
```

`github` comes with `baseline`. To add the admin skills at user scope:

```
claude plugin install github-admin@adminhead --scope user
```

To try the plugins without installing:

```
claude --plugin-dir plugins/github
claude --plugin-dir plugins/github-admin
```

## Verify

1. Validate each plugin.
   ```
   claude plugin validate --strict plugins/github
   claude plugin validate --strict plugins/github-admin
   ```
2. Start a fresh session. The skill list should show the seven `github:` skills and the five `github-admin:` skills.
3. Run `/mcp`. It should list `plugin:github:github` as connected. `claude mcp list` shows it too.
4. Run the helper to see which source it used. It runs in your shell's environment, not Claude Code's. Stdout carries the token by design, so discard it.
   ```
   plugins/github/scripts/mcp-headers.sh >/dev/null
   ```
5. Optionally run the offline tests. They need bash (plus jq for the pr-comments check).
   ```
   bash plugins/github/scripts/tests/check.sh
   plugins/github/skills/pr-comments/tests/check.sh
   ```

## How github:pr-comments works

- It is manual only (`disable-model-invocation`). Run `/github:pr-comments [PR number|URL]`. With no argument it uses the current branch's PR.
- The skill's `allowed-tools` grant lets it run its own `fetch.sh` (found through `${CLAUDE_SKILL_DIR}`) without a prompt. The grant covers only that script.
- `fetch.sh` runs `gh pr view` and one `gh api graphql` query. It lists unresolved, non-outdated threads (`T<n>`) and each bot's latest review summary (`R<n>`). It drops Dependabot and GitHub Actions comments.
- Claude shows a triage table with an action per row: `fix`, `push back`, or `clarify`. It waits for you to pick rows, then fixes only those.
- Its triage rubric (reviewer types, value against risk, repo policy, conflicting requests) is in `references/triage.md`, along with reply templates.
- It never posts, replies, resolves, approves, requests review, or pushes. For rows it skips, it drafts replies for you to paste.

## Limits

- `github:pr-comments` was not run live against a real PR during the migration. Its offline fixture tests pass.
- `github:pr-comments` makes fixes only on the PR's head branch. If another branch is checked out, it asks you to switch.
- `github:issues` writes only after you approve the exact command. Text in an issue body, comment, or log that asks for an action is data, not approval. The same holds for `github:triage`.
- `github:issue-breakdown` publishes in dependency order and stops at the first failure, because rerunning the whole list would duplicate issues.
- `github:pr` opens PRs as drafts. A request to open a PR is not approval of the command. It shows the title, body, push remote and branch, and the full `gh pr create` line first.
- `github:ship` treats the request as approval for each step at the level it picks, so it does not pause between commit, push, PR, and merge. It never force-pushes, amends, rebases, resets, stashes, skips hooks, or uses `--admin`. It stops on a non-fast-forward push, a hook failure it cannot fix, or a failed check, and merges only after checks pass. In a linked worktree it does not remove the worktree.
- `github:release` detects release tooling first and stops the manual flow if it finds some, unless you still want it. Its first four steps are read-only.
- The MCP server connects only if `gh` has a stored github.com login. Otherwise the helper exits with an error and the server stays disconnected.
- `claude plugin eval` does not start an unmocked plugin MCP server by default, so the existing evals are unaffected.
- Without `gh` auth, the `gh` commands the skills compose will fail. `fetch.sh` exits with an error if `gh` or `jq` is missing.

## github-admin limits

- `github-admin:actions` is not for Dependabot config (use `github-admin:dependabot`) or for triggering dispatches, releases (use `github:release`), or deployments.
- `github-admin:actions` starts from a pasted run or job URL with a "Failed run" procedure: read the failed log, classify the cause, fix it, rerun failed jobs, and watch. Secrets, variables, cloud trust policies, and repo settings stay your decision.
- `github-admin:dependabot` is not for general workflows (use `github-admin:actions`) or for merging Dependabot PRs.
- `github-admin:dependabot-prs` treats the request as authorization to merge green PRs only. It never uses `--admin`, never merges a PR with failing or pending checks, and does not fix red PRs unless you ask after the report.
- `github-admin:repo-setup` shows a plan table first and applies each group of writes only after approval. It commits and pushes only when asked.
- `github-admin:code-security` treats a leaked credential as compromised. It tells you to rotate it first, never prints the value, and treats history cleanup as secondary. It changes settings, dismisses alerts, and force-pushes only after approval.

## Disable or uninstall

| Task | Command |
| --- | --- |
| Disable | `claude plugin disable github@adminhead` |
| Uninstall | `claude plugin uninstall github@adminhead` |

Both commands remove the skills and the MCP server. Use `github-admin@adminhead` for the admin skills. Start a new session to be sure they are gone.
