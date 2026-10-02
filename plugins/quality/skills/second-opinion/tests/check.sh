#!/usr/bin/env bash
# Offline checks for consult.sh guards and agy-gate.sh. No model calls.
set -uo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
S=$here/../scripts/consult.sh
G=$here/../scripts/agy-gate.sh
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# Hermetic: ignore the user's global gitignore, and stub the CLIs so a guard that
# fails to fire exits 99 instead of calling a model.
export GIT_CONFIG_GLOBAL=/dev/null
mkdir "$tmp/bin"
for c in codex agy; do printf '#!/bin/sh\nexit 99\n' >"$tmp/bin/$c"; chmod +x "$tmp/bin/$c"; done
export PATH=$tmp/bin:$PATH

repo=$tmp/repo
git init -q "$repo"
printf 'x = 1\n' >"$repo/a.py"
git -C "$repo" add a.py
git -C "$repo" -c user.email=t@t -c user.name=t commit -qm init
printf 'x = 2\n' >"$repo/a.py"
mkdir "$tmp/nogit"

fails=0
expect() {
  local want=$1 label=$2 got
  shift 2
  "$@" >/dev/null 2>"$tmp/err" </dev/null
  got=$?
  if [[ $got == "$want" ]]; then
    echo "ok   $label"
  else
    echo "FAIL $label (want $want, got $got): $(head -c 200 "$tmp/err")"
    fails=$((fails + 1))
  fi
}

base=(--tool codex --mode diff --repo "$repo")
expect 2 "missing --model" "$S" "${base[@]}" --effort high
expect 2 "missing --effort" "$S" "${base[@]}" --model gpt-6-sol
expect 2 "flag without value" "$S" "${base[@]}" --model gpt-6-sol --effort
expect 2 "codex ultra rejected" "$S" "${base[@]}" --model gpt-6-sol --effort ultra
expect 2 "agy non-gemini rejected" "$S" --tool agy --mode diff --repo "$repo" --model claude-sonnet-4-6 --effort high
expect 2 "agy xhigh rejected" "$S" --tool agy --mode diff --repo "$repo" --model gemini-3.1-pro-high --effort xhigh
expect 2 "plan mode needs --input" "$S" --tool codex --mode plan --repo "$repo" --model gpt-6-sol --effort high
expect 2 "--base with --commit" "$S" "${base[@]}" --model gpt-6-sol --effort high --base main --commit HEAD
expect 5 "diff mode outside git" "$S" --tool codex --mode diff --repo "$tmp/nogit" --model gpt-6-sol --effort high

mkdir "$repo/.claude"
touch "$repo/.claude/no-external-review"
expect 3 "opt-out marker" "$S" "${base[@]}" --model gpt-6-sol --effort high
rm -r "$repo/.claude"

printf 'K=1\n' >"$repo/.env"
expect 4 "untracked .env blocked" "$S" "${base[@]}" --model gpt-6-sol --effort high
mv "$repo/.env" "$repo/.env.example"
git -C "$repo" add .env.example
git -C "$repo" -c user.email=t@t -c user.name=t commit -qm example
printf 'x = 3\n' >"$repo/a.py"
touch "$repo/server.pem"
expect 4 "untracked .pem blocked" "$S" "${base[@]}" --model gpt-6-sol --effort high
rm "$repo/server.pem"
expect 99 "clean diff reaches the tool (stub)" "$S" "${base[@]}" --model gpt-6-sol --effort high

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
