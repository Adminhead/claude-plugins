#!/usr/bin/env bash
# Offline check of scripts/agy-gate.sh. Run: bash plugins/consult/tests/agy-gate-check.sh. A mod test cannot run a script, so this one stays a shell check.
set -uo pipefail

G=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../scripts/agy-gate.sh
fails=0

gate() { jq -nc --arg n "$1" '{toolCall: {name: $n, args: {}}}' | "$G" | jq -r .decision; }
for t in view_file grep_search find_by_name list_dir; do
  if [[ $(gate "$t") == allow ]]; then echo "ok   gate allows $t"; else echo "FAIL gate allows $t"; fails=$((fails + 1)); fi
done
for t in write_to_file replace_file_content run_command read_url_content mcp_github_create_issue; do
  if [[ $(gate "$t") == deny ]]; then echo "ok   gate denies $t"; else echo "FAIL gate denies $t"; fails=$((fails + 1)); fi
done

expect_deny() {
  local label=$1 out
  shift
  out=$("$@" 2>&1)
  if [[ $? == 0 && $(jq -r .decision <<<"$out" 2>/dev/null) == deny ]]; then echo "ok   $label"; else echo "FAIL $label: $out"; fails=$((fails + 1)); fi
}
for bad in '' 'not json' '{' '{"toolCall":{}}' '{"toolCall":{"name":5}}' '{"toolCall":{"name":""}}' '[]'; do
  expect_deny "gate denies malformed input: ${bad:-empty}" bash -c 'printf "%s" "$1" | "$2"' _ "$bad" "$G"
done
# A PATH with no jq: the gate must deny, not crash. Only the symlinks it needs (bash, cat) are on it.
nojq=$(mktemp -d)
trap 'rm -rf "$nojq"' EXIT
for c in bash cat; do ln -s "$(command -v $c)" "$nojq/$c"; done
expect_deny "gate denies when jq is missing" env PATH="$nojq" "$(command -v bash)" "$G" <<<'{"toolCall":{"name":"view_file"}}'

if ((fails > 0)); then
  echo "$fails failed"
  exit 1
fi
echo "all passed"
