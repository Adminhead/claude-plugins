#!/usr/bin/env bash
# Print a GitHub PR's unresolved review threads and review summaries as compact Markdown.
# Usage: fetch.sh [PR number|URL]   (default: the current branch's PR)
# Read-only: runs only `gh pr view` and a `gh api graphql` query.
#
# The skill runs this on load, and a non-zero exit aborts the whole invocation. So
# anything that only means "nothing was fetched" (a Forgejo or Codeberg origin, no gh,
# no PR, pasted text instead of a reference) prints a "Review feedback not fetched"
# line on stdout and exits 0, and the skill decides what to do next. Only a bad
# option exits 2.

set -euo pipefail

dir=$(cd "$(dirname "$0")" && pwd)

fail() {
  echo "error: $1" >&2
  exit 2
}

unavailable() {
  echo "Review feedback not fetched: $1"
  exit 0
}

[[ ${1:-} != -* ]] || fail "expected a PR number or URL, not an option: $1"
[ $# -le 1 ] || unavailable "the arguments are not a single PR number or URL. Use any review text the user pasted; otherwise ask for a PR number or URL."

# Host of origin, used only to tell GitHub from other forges. A URL argument names its
# own host, so origin does not matter then.
host=
if [[ ${1:-} != *://* ]]; then
  host=$(git remote get-url origin 2>/dev/null || true)
  host=${host#*://}
  host=${host#*@}
  host=${host%%[:/]*}
fi

if [ -n "$host" ] && [ "$host" != github.com ] &&
  ! { command -v gh >/dev/null && gh auth status --hostname "$host" >/dev/null 2>&1; }; then
  unavailable "origin host $host is not a GitHub host gh knows. For Forgejo, Codeberg or Gitea fetch with references/forgejo.md; with several remotes, ask which forge."
fi

for tool in gh jq; do
  command -v "$tool" >/dev/null || unavailable "$tool is not installed."
done

# gh pr view accepts a number, a URL, or nothing (the current branch).
url=$(gh pr view ${1:+"$1"} --json url --jq .url) ||
  unavailable "could not find the pull request (see gh's message above)."

# https://github.com/OWNER/REPO/pull/N
IFS=/ read -r _ _ _ owner repo _ pr <<<"$url"
[[ $pr =~ ^[0-9]+$ ]] || unavailable "unexpected PR URL: $url"

pages=$(gh api graphql --paginate -f owner="$owner" -f repo="$repo" -F pr="$pr" \
  -F query=@"$dir/threads.graphql") ||
  unavailable "the GraphQL query failed (see gh's message above)."

jq -rs -f "$dir/format.jq" <<<"$pages"
