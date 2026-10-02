#!/usr/bin/env bash
# Print a PR's unresolved review threads and review summaries as compact Markdown.
# Usage: fetch.sh [PR number|URL]   (default: the current branch's PR)
# Read-only: runs only `gh pr view` and a `gh api graphql` query.

set -euo pipefail

dir=$(cd "$(dirname "$0")" && pwd)

fail() {
  echo "error: $1" >&2
  exit 2
}

for tool in gh jq; do
  command -v "$tool" >/dev/null || fail "$tool is not installed"
done
[ $# -le 1 ] || fail "expected at most one argument: a PR number or URL"

# gh pr view accepts a number, a URL, or nothing (the current branch).
url=$(gh pr view ${1:+"$1"} --json url --jq .url) ||
  fail "could not find the pull request (see gh's message above)"

# https://github.com/OWNER/REPO/pull/N
IFS=/ read -r _ _ _ owner repo _ pr <<<"$url"
[[ $pr =~ ^[0-9]+$ ]] || fail "unexpected PR URL: $url"

pages=$(gh api graphql --paginate -f owner="$owner" -f repo="$repo" -F pr="$pr" \
  -F query=@"$dir/threads.graphql") ||
  fail "GraphQL query failed (see gh's message above)"

jq -rs -f "$dir/format.jq" <<<"$pages"
