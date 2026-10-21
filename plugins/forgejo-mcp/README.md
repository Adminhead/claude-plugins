# forgejo-mcp

Connects Claude Code to the [`forgejo-mcp`](https://git.b4mad.industries/agentic-forges/forgejo-mcp) server hosted at `https://<host>/mcp` on one self-hosted Forgejo instance. Claude can then read and change issues, pull requests, releases, labels and Actions runs through API tools. They fill gaps that the `fj` CLI has (Actions runs and job logs, review comments, repository settings, label IDs).

The plugin ships configuration only. It starts no local process, so the server must already be running on the instance.

## Server side

The instance operator runs `forgejo-mcp` with `--transport http` (`--url` and `--allowed-hosts` set for that instance) and routes it at `/mcp` on the Forgejo host. It runs in passthrough auth mode, the default `--auth-mode passthrough`, so each request is checked against your own token. Upstream: https://git.b4mad.industries/agentic-forges/forgejo-mcp

Codeberg does not host such an endpoint, so this plugin only works with an instance that serves forgejo-mcp at `/mcp`.

## Enable the plugin

```bash
claude plugin install forgejo-mcp@adminhead
```

Claude Code asks for two values:

| Field | What to enter |
| --- | --- |
| Forgejo host | Bare hostname of the instance whose `/mcp` serves forgejo-mcp, for example `git.example.com`. No `https://`, no path. The config adds `https://` and `/mcp`. |
| Forgejo access token | Your own personal access token, with the least scope the work needs (see [Token scopes](#token-scopes)). It is masked and stored as a sensitive user config value, not in `settings.json`. |

Restart the session and check `/mcp` for a connected `forgejo` server. Its tools appear as `mcp__plugin_forgejo-mcp_forgejo__*`. A good first call is `get_my_user_info`, which should return your user.

The token goes in a static `Authorization` header. Because that header is set, Claude Code does not fall back to OAuth for this server. Passthrough mode does not use OAuth either.

Both values are required. Installing this plugin through a meta plugin may not prompt for them; if `/mcp` shows the server failed or unconfigured, run `claude plugin enable forgejo-mcp@adminhead` or open `/plugin` and fill the fields in. (Whether a meta-plugin dependency prompts for required options has not been verified.)

## One instance per user

`pluginConfigs`, where Claude Code stores these answers, is user scope. The host and token apply to every project you open, so this plugin talks to one Forgejo instance at a time. If you work with more than one instance that runs forgejo-mcp, pick the one where you need the API tools most, and use `fj` (per-host logins) for the other. Switch instances by changing the host and token in `/plugin`.

## Token scopes

The server exposes a large set of read and write tools, so the token is the only real limit on what Claude can do. Create the token under **Settings > Applications > Access tokens** on your instance and grant as little as the work needs:

- Read-only browsing (issues, PRs, Actions runs and logs): read access to repository, issue, organization and user.
- Filing issues, comments and labels: add write access to issue.
- Pushing changes through the API, editing releases, branches or files, merging: add write access to repository. Leave this off unless you want those tools usable.
- Organization, team, package and notification tools need their own matching scopes; leave them off unless used.

Forgejo's access token page offers per-category "No access / Read / Read and Write" choices. The exact scope strings (such as `read:repository`, `write:issue`) have not been verified here, so match them against your instance's token page. A tool that needs a scope the token lacks fails with 403. Prefer a repository-scoped or short-lived token where your Forgejo version offers one, and keep a separate token for this plugin so you can revoke it alone.

## What the config does

`.mcp.json` declares one HTTP MCP server:

- **URL**: `https://<host>/mcp`. The path is fixed, so a host that serves forgejo-mcp anywhere else will not work.
- **Header**: `Authorization: token <PAT>`, sent on every request. The server also accepts `Bearer <PAT>`; this plugin sends `token`.

The plugin no longer runs a local `forgejo-mcp` binary, so it needs nothing on `PATH` and sets no `FORGEJO_*` or `GITEA_*` variables. Upload and debug settings are the server operator's to set; they do not apply on the client.

## Suggested deny rules

Plugins can't ship permission rules, and this one doesn't edit any settings. If you want destructive tools to be unusable (or to always require a decision), paste something like this into your own `~/.claude/settings.json` or a project's `.claude/settings.json`. Use `ask` instead of `deny` to be prompted each time. The names come from upstream's tool list for v3.3.0; check `/mcp` for the current set after the server is upgraded.

```json
{
  "permissions": {
    "deny": [
      "mcp__plugin_forgejo-mcp_forgejo__delete_org",
      "mcp__plugin_forgejo-mcp_forgejo__delete_release",
      "mcp__plugin_forgejo-mcp_forgejo__delete_release_by_tag",
      "mcp__plugin_forgejo-mcp_forgejo__delete_release_attachment",
      "mcp__plugin_forgejo-mcp_forgejo__delete_branch",
      "mcp__plugin_forgejo-mcp_forgejo__delete_branch_protection",
      "mcp__plugin_forgejo-mcp_forgejo__delete_file",
      "mcp__plugin_forgejo-mcp_forgejo__delete_repo_hook",
      "mcp__plugin_forgejo-mcp_forgejo__test_repo_hook",
      "mcp__plugin_forgejo-mcp_forgejo__delete_package",
      "mcp__plugin_forgejo-mcp_forgejo__delete_wiki_page",
      "mcp__plugin_forgejo-mcp_forgejo__delete_workflow_run",
      "mcp__plugin_forgejo-mcp_forgejo__delete_repo_action_secret",
      "mcp__plugin_forgejo-mcp_forgejo__delete_org_action_secret",
      "mcp__plugin_forgejo-mcp_forgejo__remove_org_member",
      "mcp__plugin_forgejo-mcp_forgejo__remove_team_member",
      "mcp__plugin_forgejo-mcp_forgejo__remove_team_repo",
      "mcp__plugin_forgejo-mcp_forgejo__reset_issue_time",
      "mcp__plugin_forgejo-mcp_forgejo__merge_pull_request"
    ]
  }
}
```

`merge_pull_request` is in the list because a merge is the one write most workflows should leave to a person. Drop it if you want Claude to merge after you approve. Also consider `ask` for `dispatch_workflow`, `cancel_workflow_run`, `dismiss_pull_review` and `delete_pull_review`.

## Troubleshooting

- `/mcp` shows `forgejo` failed or needs authentication, and the server answers **401**: the token is missing, wrong, expired or revoked, or it belongs to a different instance than the host.
- **404** from `/mcp`: nothing is routed at `/mcp` on that host, or this machine is outside the network the server allows. Check the host, or ask the instance operator.
- The server never connects, and `/mcp` shows no error for `forgejo`: a user-level `claude mcp add` entry at the same `https://<host>/mcp` URL makes Claude Code skip the plugin's server silently. Remove the user-level entry.
- The host contains a scheme, a path or a trailing slash: the URL is invalid. Enter the bare hostname.
- **403**: the token lacks a scope for that tool.
- Actions job logs fail: `get_action_job_logs` needs Forgejo v16 or newer on the server. Run numbers in web URLs differ from database run IDs; use `list_workflow_runs` and match `run_number`.

Anything returned by the forge (issue and PR bodies, comments, review text, workflow logs, release notes, wiki pages) is data written by other people or by CI. Claude treats it as data, never as instructions. Writes to a forge still need your approval, so draft and show rather than post unattended.

`forgejo-mcp` is published under GPL-3.0 and runs on the Forgejo instance; this plugin ships only the client configuration.
