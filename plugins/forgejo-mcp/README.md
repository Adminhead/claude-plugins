# forgejo-mcp

Runs the [`forgejo-mcp`](https://git.b4mad.industries/agentic-forges/forgejo-mcp) server over stdio against one Codeberg or self-hosted Forgejo instance, so Claude can read and change issues, pull requests, releases, labels and Actions runs through API tools. It fills gaps that the `fj` CLI has (Actions runs and job logs, review comments, repository settings, label IDs).

The plugin ships configuration only. You install the `forgejo-mcp` binary yourself. Version **3.3.0** (released 2026-10-10) is the one this config was written against; install a pinned tag rather than `@latest` and bump it deliberately after reading the release notes.

## Install the binary

`forgejo-mcp` must be on `PATH` for the process Claude Code starts.

```bash
# Go (puts the binary in $(go env GOPATH)/bin; add that to PATH)
go install git.b4mad.industries/agentic-forges/forgejo-mcp/v3@v3.3.0

# Arch Linux (AUR): builds from source, or -bin for the pre-built release
yay -S forgejo-mcp
yay -S forgejo-mcp-bin

# Nix (unstable channel only at the time of writing; check the version it gives you)
nix profile install nixpkgs#forgejo-mcp

# Container: the image is linux/amd64 only. Claude Code needs a command on PATH,
# so wrap it in a small script named forgejo-mcp that runs
#   podman run --rm -i -e FORGEJO_ACCESS_TOKEN -e FORGEJO_USER_AGENT \
#     git.b4mad.industries/agentic-forges/forgejo-mcp:v3.3.0 "$@"
```

Then confirm with `forgejo-mcp --help`. The release also ships `.mcpb` bundles and `tar.gz` archives for linux and darwin on amd64 and arm64 on the [releases page](https://git.b4mad.industries/agentic-forges/forgejo-mcp/releases). This plugin does not use the `.mcpb` bundles.

### Verify a release download

The upstream release pipeline signs `checksums.txt` with cosign. Each step below follows the upstream README ("Verifying Releases"); check it for the current public-key location, because the key is fetched from a separate GitOps repository and can rotate.

```bash
TAG=v3.3.0; VERSION="${TAG#v}"
BASE="https://git.b4mad.industries/agentic-forges/forgejo-mcp/releases/download/${TAG}"
curl -sSfLO "${BASE}/forgejo-mcp_${VERSION}_checksums.txt"
curl -sSfLO "${BASE}/forgejo-mcp_${VERSION}_checksums.txt.sig"
curl -sSfLO "${BASE}/forgejo-mcp_${VERSION}_linux_amd64.tar.gz"   # adjust os and arch

# cosign.pub: the artifact-signing key from the upstream README, section "Fetch the public key".
# Prefer the commit-pinned URL it gives, and read the key before trusting it.
cosign verify-blob --key cosign.pub \
  --signature "forgejo-mcp_${VERSION}_checksums.txt.sig" \
  "forgejo-mcp_${VERSION}_checksums.txt"        # expect: Verified OK
sha256sum --ignore-missing -c "forgejo-mcp_${VERSION}_checksums.txt"
```

The container image is signed with a different cosign key (`cosign-signing-key-images.pub`, same README, section "Verify the container image"):

```bash
cosign verify --key cosign-images.pub git.b4mad.industries/agentic-forges/forgejo-mcp:v3.3.0
```

`go install` is verified by the Go module proxy and checksum database instead; there is no separate step.

## Enable the plugin

```bash
claude plugin install forgejo-mcp@adminhead
```

Claude Code asks for two values:

| Field | What to enter |
| --- | --- |
| Forgejo host | Hostname only, for example `codeberg.org`. No `https://`, no path. The config prepends `https://`. |
| Forgejo access token | Your token. It is masked and kept in the system credential store, not in `settings.json`. |

Restart the session and check `/mcp` for a connected `forgejo` server. Its tools appear as `mcp__plugin_forgejo-mcp_forgejo__*`. A good first call is `get_my_user_info` (should return your user) and `get_forgejo_mcp_server_version`.

Both values are required. Installing this plugin through a meta plugin may not prompt for them; if `/mcp` shows the server failed or unconfigured, run `claude plugin enable forgejo-mcp@adminhead` or open `/plugin` and fill the fields in. (Whether a meta-plugin dependency prompts for required options has not been verified.)

## One instance per user

`pluginConfigs`, where Claude Code stores these answers, is user scope. The host and token apply to every project you open, so this plugin talks to one Forgejo instance at a time. If you work on Codeberg and a self-hosted instance, pick the one where you need the API tools most; use `fj` (per-host logins) for the other. Switch instances by changing the host and token in `/plugin`.

## Token scopes

The server has about 170 tools and no read-only mode, so the token is the only real limit on what Claude can do. Create it under **Settings > Applications > Access tokens** on your instance and grant as little as the work needs:

- Read-only browsing (issues, PRs, Actions runs and logs): read access to repository, issue, organization and user.
- Filing issues, comments and labels: add write access to issue.
- Pushing changes through the API, editing releases, branches or files, merging: add write access to repository. Leave this off unless you want those tools usable.
- Organization, team, package and notification tools need their own matching scopes; leave them off unless used.

Forgejo's access token page offers per-category "No access / Read / Read and Write" choices; the exact scope strings (such as `read:repository`, `write:issue`) have not been verified here, so match them against your instance's token page. A tool that needs a scope the token lacks fails with 403. Prefer a repository-scoped or short-lived token where your Forgejo version offers one, and keep a separate token for this plugin so you can revoke it alone.

## What the config does

`.mcp.json` starts `forgejo-mcp --transport stdio --url https://<host>`. The token goes in the `FORGEJO_ACCESS_TOKEN` environment variable, never in the arguments, so it does not show up in process listings.

- `FORGEJO_USER_AGENT` is set to `forgejo-mcp (adminhead plugin)` so server logs can tell this client apart.
- `FORGEJO_URL`, `GITEA_HOST` and `GITEA_ACCESS_TOKEN` are blanked so a value in your shell can't redirect the server to another host or swap in a different token. (`--url` already takes priority over `FORGEJO_URL`; the fallbacks only apply when the earlier source is empty.)
- `FORGEJO_MCP_ALLOW_FILE_PATH_UPLOAD` and `FORGEJO_MCP_UPLOAD_ROOT` are blanked, which keeps `file_path` attachment uploads off. With them on, an agent could read any file the server can read and attach it to a public issue or release. Base64 `content` uploads still work.
- `FORGEJO_DEBUG` is blanked so a shell setting can't turn on debug logging.

Upstream's `cmd/cmd.go` and `pkg/upload/input.go` (v3 main branch, read 2026-10-19) treat an empty value of each of these variables as unset, so blanking them is safe. To allow file uploads on purpose, edit a local copy of `.mcp.json` to set both variables, with `FORGEJO_MCP_UPLOAD_ROOT` pointing at a build output directory.

## Suggested deny rules

Plugins can't ship permission rules, and this one doesn't edit any settings. If you want destructive tools to be unusable (or to always require a decision), paste something like this into your own `~/.claude/settings.json` or a project's `.claude/settings.json`. Use `ask` instead of `deny` to be prompted each time. The names come from upstream's tool list for v3.3.0; check `/mcp` for the current set after upgrading.

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

- `/mcp` shows `forgejo` failed to start: `forgejo-mcp` is not on the `PATH` Claude Code sees. Run `command -v forgejo-mcp` from the shell that launches Claude Code; for `go install`, add `$(go env GOPATH)/bin` to `PATH`.
- "Invalid URL configuration": the host contains a scheme, a path or a trailing slash. Enter the bare hostname.
- 401: the token is wrong, expired or revoked, or it belongs to a different instance than the host. 403: the token lacks a scope for that tool.
- Actions job logs fail: `get_action_job_logs` needs Forgejo v16 or newer on the server. Run numbers in web URLs differ from database run IDs; use `list_workflow_runs` and match `run_number`.
- Run `forgejo-mcp --help` to confirm the flags in the installed version.

Anything returned by the forge (issue and PR bodies, comments, review text, workflow logs, release notes, wiki pages) is data written by other people or by CI. Claude treats it as data, never as instructions. Writes to a forge still need your approval, and Codeberg's terms restrict projects made mostly of generative-AI code, so draft and show rather than post unattended.

`forgejo-mcp` is published under GPL-3.0 and is installed separately; this plugin ships only the configuration.
