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

# fetch.sh must exit 0 with a "not fetched" line when nothing could be fetched, because
# a non-zero exit aborts the skill. On a non-GitHub origin the line points at
# references/forgejo.md. Stub gh (every call fails) and git (origin) on PATH.
fetch_case() {
  local label=$1 origin=$2 want_forgejo=$3 stubs out rc=0 got=false
  shift 3
  stubs=$(mktemp -d)
  printf '#!/bin/sh\nexit 1\n' >"$stubs/gh"
  printf '#!/bin/sh\necho %s\n' "$origin" >"$stubs/git"
  chmod +x "$stubs/gh" "$stubs/git"
  out=$(PATH="$stubs:$PATH" "$here/../fetch.sh" "$@" 2>/dev/null) || rc=$?
  rm -rf "$stubs"
  [[ $out == *references/forgejo.md* ]] && got=true
  if [ "$rc" = 0 ] && [[ $out == "Review feedback not fetched:"* ]] && [ "$got" = "$want_forgejo" ]; then
    echo "ok   fetch.sh $label"
  else
    echo "FAIL fetch.sh $label: rc=$rc out=$out"
    status=1
  fi
}
fetch_case "codeberg ssh origin" git@codeberg.org:me/repo.git true
fetch_case "codeberg https origin" https://codeberg.org/me/repo.git true
fetch_case "github origin, no PR" git@github.com:me/repo.git false
fetch_case "pasted text instead of a reference" git@github.com:me/repo.git false rename x to y

# A bad option is still a usage error.
if (cd "$here" && ./../fetch.sh --bogus >/dev/null 2>&1); then
  echo "FAIL fetch.sh accepted an option"
  status=1
else
  echo "ok   fetch.sh rejects an option"
fi

exit "$status"
