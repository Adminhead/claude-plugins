#!/usr/bin/env bash
# Offline check of agy-gate.sh. A mod test cannot run a script, so this one stays a shell check.
set -uo pipefail

G=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../scripts/agy-gate.sh
fails=0

gate() { jq -nc --arg n "$1" '{toolCall: {name: $n, args: {}}}' | "$G" | jq -r .decision; }
for t in view_file grep_search find_by_name list_dir; do
  if [[ $(gate "$t") == allow ]]; then echo "ok   gate allows $t"; else echo "FAIL gate allows $t"; fails=$((fails + 1)); fi
done
for t in write_to_file replace_file_content run_command read_url_content mcp_codegraph_explore; do
  if [[ $(gate "$t") == deny ]]; then echo "ok   gate denies $t"; else echo "FAIL gate denies $t"; fails=$((fails + 1)); fi
done

if ((fails > 0)); then
  echo "$fails failed"
  exit 1
fi
echo "all passed"
