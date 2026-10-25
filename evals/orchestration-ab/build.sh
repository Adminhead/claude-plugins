#!/usr/bin/env bash
# Usage: build.sh OUT_DIR
# Generates, inside OUT_DIR (never in the repo tree):
#   arm-b-append.md  committed (HEAD) orchestrator body (no frontmatter) + router-table.md
#   arm-c-append.md  working-tree orchestrator body + router-table.md
#   arm-l-append.md  working-tree orchestrator body, no table (arm L; agent-router adds it live)
#   system_override.md  arm A's prompt, from git history (c67e66c); only when ARMS (env, space-separated) has A
#   skill-plugin/    arm D's throwaway plugin (routing-decisions skill)
#   settings.json    PreToolUse hook settings pointing at this directory's hook.py
#   fixture-base/    git repo (one commit) made from fixture/
set -euo pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SRC/../.." && pwd)"
OUT="${1:?usage: build.sh OUT_DIR}"
AGENT="$ROOT/plugins/orchestration/agents/orchestration.md"
[[ -f "$AGENT" ]] || { echo "missing $AGENT" >&2; exit 1; }
mkdir -p "$OUT"

REL=plugins/orchestration/agents/orchestration.md
# frontmatter ends at the second '---' line; drop leading blanks
body() { awk 'BEGIN{n=0} n>=2{print} /^---$/{n++}' | awk 'NF||started{started=1;print}'; }

# B (control) and D use the committed body; C uses the working-tree body.
git -C "$ROOT" show "HEAD:$REL" | body > "$OUT/arm-b-append.md"
cat "$SRC/router-table.md" >> "$OUT/arm-b-append.md"
body < "$AGENT" > "$OUT/arm-c-append.md"
cat "$SRC/router-table.md" >> "$OUT/arm-c-append.md"

# L: the shipped route. Working-tree body only; agent-router supplies the table live.
body < "$AGENT" > "$OUT/arm-l-append.md"

# A (historical, only when requested via ARMS): system_override.md was retired from the plugin;
# read the last copy from history, so a clone without c67e66c can still run the other arms.
if [[ " ${ARMS:-} " == *" A "* ]]; then
  git -C "$ROOT" show c67e66c:plugins/orchestration/prompts/system_override.md > "$OUT/system_override.md" 2>/dev/null \
    || { echo "arm A needs plugins/orchestration/prompts/system_override.md from commit c67e66c, which this clone lacks; drop A from --arms" >&2; exit 1; }
fi

# D: throwaway plugin with an on-demand skill built from the working-tree text.
SK="$OUT/skill-plugin"
rm -rf "$SK"; mkdir -p "$SK/.claude-plugin" "$SK/skills/routing-decisions"
printf '{\n  "name": "ab-routing",\n  "version": "0.0.1",\n  "description": "A/B test skill: routing decisions"\n}\n' > "$SK/.claude-plugin/plugin.json"
RULE="$(grep -m1 '^- Do it yourself' "$AGENT")"
EXAMPLES="$(awk '/^Routing examples/{p=1} /^Escalation rules/{p=0} p' "$AGENT")"
[[ -n "$RULE" && -n "$EXAMPLES" ]] || { echo "working-tree orchestration.md lacks the do-it-yourself rule or Routing examples" >&2; exit 1; }
{
  cat <<'EOF'
---
name: routing-decisions
description: Decides whether to do a piece of work yourself or delegate it, and which agent type and model to route it to. Use when you are about to start work, edit files, or call the Agent tool and must choose between doing it inline and delegating, or between coder tiers, debugger, architect, scribe, plugin-vetter and other agents.
---

# Routing decisions

## Do it yourself or delegate

EOF
  printf '%s\n\n## Examples\n\n' "$RULE"
  printf '%s\n' "$EXAMPLES"
} > "$SK/skills/routing-decisions/SKILL.md"

python3 -I - "$SRC/hook.py" "$OUT/settings.json" <<'PY'
import json, sys
hook, out = sys.argv[1:3]
json.dump({"hooks": {"PreToolUse": [{"matcher": "Agent|Task|Bash", "hooks": [
    {"type": "command", "command": "python3 " + json.dumps(hook), "timeout": 10}]}]}},
    open(out, "w"), indent=2)
PY

rm -rf "$OUT/fixture-base"
cp -a "$SRC/fixture" "$OUT/fixture-base"
cd "$OUT/fixture-base"
git init -q -b main
git config user.name "AB Harness"
git config user.email ab@example.invalid
git add -A
git commit -qm "initial fixture"
