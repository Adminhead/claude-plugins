#!/usr/bin/env bash
# Runs every crew check: the agent checker and its tests, both read-only gate suites, the guard
# suite and the bash replay. Runs all of them, then exits nonzero if any failed.
set -uo pipefail

tests="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$tests/../../../.." && pwd)"
cd "$repo" || exit 1

failed=()
step() { # step <label> <command...>
  local label="$1"
  shift
  printf '== %s\n' "$label"
  "$@" || failed+=("$label")
}

step 'agent-tools' python3 scripts/agent-tools.py
step 'agent-tools tests' bash scripts/agent-tools.test.sh
step 'readonly-bash tests (readonly-gate.py)' bash plugins/crew/scripts/tests/readonly-bash.test.sh
step 'readonly-bash tests (readonly-gate.ts)' env HOOK="$repo/plugins/crew/scripts/readonly-gate.ts" bash plugins/crew/scripts/tests/readonly-bash.test.sh
step 'orchestration-guard tests' bash plugins/crew/scripts/tests/orchestration-guard.test.sh

# The replay reads local transcripts, so a machine without any skips it visibly.
if [[ -d "$HOME/.claude/projects" ]]; then
  step 'bash replay (walker)' bun --no-env-file --config=/dev/null scripts/bash-replay.ts
else
  printf '== bash replay (walker)\nSKIPPED: no %s\n' "$HOME/.claude/projects"
fi

if ((${#failed[@]})); then
  printf 'FAILED: %s\n' "${failed[*]}" >&2
  exit 1
fi
echo 'all crew checks passed'
