#!/usr/bin/env bash
# A/B runner. Usage: run.sh [--out DIR] [--runs N] [--case NAME[,NAME...]] [--arms B,L] [--jobs N]
# Arms: A (historical) agent + system_override.md from git history; B = CONTROL_REF prompt + old roster
# (router-table-head.md); C = working-tree prompt + new roster (router-table.md); D = B plus the
# routing-decisions skill (built from the CONTROL_REF text); L = shipped route: default prompt +
# working-tree body, no static table, working-tree agent-router via --plugin-dir, CLAUDE_ORCHESTRATE=1
# (live router).
# Every arm runs with CLAUDE_ORCHESTRATE unset except L, so a harness started from a launcher session
# does not leak the router table into the other arms.
# Output dir: --out, else $AB_OUT, else a new mktemp -d. Printed at start.
# Internal: run.sh --one OUT CASE ARM N
set -uo pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SRC/../.." && pwd)"

if [[ "${1:-}" == "--one" ]]; then
  OUT=$2 CASE=$3 ARM=$4 N=$5
  RUN="$OUT/runs/$CASE/$ARM-$N"
  rm -rf "$RUN"; mkdir -p "$RUN"
  cp -a "$OUT/fixture-base" "$RUN/repo"
  field() { python3 -I -c "import json,sys;print(next(c.get(sys.argv[2],'') for c in json.load(open(sys.argv[1])) if c['name']==sys.argv[3]))" "$SRC/cases.json" "$1" "$CASE"; }
  if [[ "$(field setup)" == "dirty" ]]; then
    printf '\n# scratch edit\nDEBUG = True\n' >> "$RUN/repo/inventory/storage.py"
    echo "temporary notes" > "$RUN/repo/junk.tmp"
    mkdir -p "$RUN/repo/scratch" && echo x > "$RUN/repo/scratch/old.log"
  fi
  PROMPT="$(field prompt)"
  COMMON=(--model opus --output-format stream-json --verbose --max-turns 8
          --settings "$OUT/settings.json" --permission-mode bypassPermissions --no-session-persistence)
  ARMENV=(-u CLAUDE_ORCHESTRATE)
  case "$ARM" in
    A) ARMFLAGS=(--agent orchestration:orchestration --append-system-prompt-file "$OUT/system_override.md");;
    B) ARMFLAGS=(--append-system-prompt-file "$OUT/arm-b-append.md");;
    C) ARMFLAGS=(--append-system-prompt-file "$OUT/arm-c-append.md");;
    D) ARMFLAGS=(--append-system-prompt-file "$OUT/arm-b-append.md" --plugin-dir "$OUT/skill-plugin");;
    L) ARMFLAGS=(--append-system-prompt-file "$OUT/arm-l-append.md" --plugin-dir "$ROOT/plugins/agent-router")
       ARMENV=(CLAUDE_ORCHESTRATE=1);;
  esac
  cd "$RUN/repo" || exit 1
  AB_LOG="$RUN/hook.log" timeout 900 env "${ARMENV[@]}" claude -p "$PROMPT" "${ARMFLAGS[@]}" "${COMMON[@]}" \
    > "$RUN/transcript.jsonl" 2> "$RUN/stderr.txt" < /dev/null
  echo "$?" > "$RUN/exit_code"
  touch "$RUN/hook.log"
  git -C "$RUN/repo" status --short > "$RUN/repo-status.txt" 2>&1
  exit 0
fi

RUNS=1 CASE="" ARMS="B,L" JOBS=4 OUT="${AB_OUT:-}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --out) OUT=${2:?}; shift 2;;
    --runs) RUNS=${2:?}; shift 2;;
    --case|--cases) CASE=${2:?}; shift 2;;
    --arm|--arms) ARMS=${2:?}; shift 2;;
    --jobs) JOBS=${2:?}; shift 2;;
    *) echo "unknown arg $1" >&2; exit 2;;
  esac
done
ARMS="${ARMS//,/ }"
ALLCASES=$(python3 -I -c "import json,sys;print(' '.join(c['name'] for c in json.load(open(sys.argv[1]))))" "$SRC/cases.json")
CASES=$ALLCASES
if [[ -n "$CASE" ]]; then
  CASES="${CASE//,/ }"
  for c in $CASES; do
    [[ " $ALLCASES " == *" $c "* ]] || { echo "unknown case '$c'; known: $ALLCASES" >&2; exit 2; }
  done
fi
for a in $ARMS; do
  [[ "$a" == A || "$a" == B || "$a" == C || "$a" == D || "$a" == L ]] || { echo "--arms entries must be A, B, C, D or L, got '$a'" >&2; exit 2; }
done
[[ "$RUNS" =~ ^[1-9][0-9]*$ && "$JOBS" =~ ^[1-9][0-9]*$ ]] || { echo "--runs and --jobs must be positive integers" >&2; exit 2; }
[[ -n "$OUT" ]] || OUT="$(mktemp -d)"
[[ "$OUT" != *[[:space:]]* ]] || { echo "output dir must not contain whitespace: '$OUT'" >&2; exit 2; }
OUT="$(realpath -m "$OUT")"
case "$OUT" in
  "$ROOT"|"$ROOT"/*) echo "output dir must be outside the repo ($ROOT): $OUT" >&2; exit 2;;
esac
mkdir -p "$OUT"
echo "output dir: $OUT"
ARMS="$ARMS" bash "$SRC/build.sh" "$OUT" || exit 1
for c in $CASES; do for a in $ARMS; do for n in $(seq 1 "$RUNS"); do
  echo "$OUT $c $a $n"
done; done; done | xargs -P "$JOBS" -L1 bash -c 'bash "$0" --one "$@"' "$SRC/run.sh"
python3 -I "$SRC/grade.py" "$OUT" --case "${CASES// /,}" --arms "${ARMS// /,}"
