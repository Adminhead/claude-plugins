#!/usr/bin/env bash
# Render fixture pages through format.jq and diff against the expected Markdown.
# Each case is "<expected .md> <fixture pages...>"; pages are concatenated the
# way `gh api graphql --paginate` prints them.

set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
fixtures="$here/fixtures"
status=0

check() {
  local expected=$1
  shift
  if diff -u "$fixtures/$expected" <(cd "$fixtures" && cat "$@" | jq -rs -f "$here/../format.jq"); then
    echo "ok   $expected"
  else
    echo "FAIL $expected"
    status=1
  fi
}

check paged.md page1.json page2.json
check empty.md empty.json
check fence.md fence.json

exit "$status"
