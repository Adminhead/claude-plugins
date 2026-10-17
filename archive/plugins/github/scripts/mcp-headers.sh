#!/usr/bin/env bash
# headersHelper for the GitHub remote MCP server. Prints the Authorization header
# as JSON on stdout, using gh's stored github.com login. Claude Code strips
# TOKEN/SECRET/KEY/AUTH env vars from helper environments, so no env override
# exists. Logs to stderr, never the token.
set -euo pipefail
set +x

if ! command -v gh >/dev/null 2>&1; then
  echo "github-mcp: gh not found; install GitHub CLI and run 'gh auth login'" >&2
  exit 1
fi

# Always github.com: a GH_HOST or Enterprise-only config must not send its token
# to api.githubcopilot.com. gh's stderr is dropped so it can't reach our logs.
token=$(gh auth token --hostname github.com 2>/dev/null) || token=
if [[ -z $token ]]; then
  echo "github-mcp: no github.com login found; run 'gh auth login --hostname github.com' (env tokens are not visible to this helper)" >&2
  exit 1
fi

if ! LC_ALL=C bash -c '[[ $1 =~ ^[A-Za-z0-9_]+$ ]]' _ "$token"; then
  echo "github-mcp: token has whitespace or invalid characters; refusing to build headers" >&2
  exit 1
fi

echo "github-mcp: using gh login for github.com" >&2
printf '{"Authorization":"Bearer %s"}\n' "$token"
