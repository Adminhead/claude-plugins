#!/usr/bin/env bash
# Ask codex or agy for a read-only second opinion on a diff or a plan.
#
#   consult.sh --tool codex|agy --mode diff|plan --model M --effort E
#              [--input FILE|-] [--repo DIR] [--base REF | --commit SHA] [--timeout SECS]
#
# --input: plan mode, the plan plus what to scrutinize (required);
#          diff mode, optional focus notes. "-" reads stdin.
# Exit: 0 ok · 2 usage · 3 repo opted out · 4 secret-like file in diff · 5 no git repo
#       124 timeout · other = tool failure (log tail on stderr).
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

die() { echo "consult.sh: $2" >&2; exit "$1"; }

if [[ ${1-} == -h || ${1-} == --help ]]; then
  sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
fi

tool='' mode='' model='' effort='' input='' repo='' base='' commit='' timeout_s=600
while (($#)); do
  (($# >= 2)) || die 2 "missing value for $1"
  case $1 in
    --tool) tool=$2 ;;
    --mode) mode=$2 ;;
    --model) model=$2 ;;
    --effort) effort=$2 ;;
    --input) input=$2 ;;
    --repo) repo=$2 ;;
    --base) base=$2 ;;
    --commit) commit=$2 ;;
    --timeout) timeout_s=$2 ;;
    *) die 2 "unknown argument: $1" ;;
  esac
  shift 2
done

[[ $tool == codex || $tool == agy ]] || die 2 "--tool must be codex or agy"
[[ $mode == diff || $mode == plan ]] || die 2 "--mode must be diff or plan"
[[ -n $model ]] || die 2 "--model is required (see the matrix in SKILL.md)"
[[ -n $effort ]] || die 2 "--effort is required (see the matrix in SKILL.md)"
[[ -z $base || -z $commit ]] || die 2 "--base and --commit are mutually exclusive"
[[ $timeout_s =~ ^[0-9]+$ ]] || die 2 "--timeout must be whole seconds"

case $tool in
  codex)
    [[ $effort =~ ^(low|medium|high|xhigh|max)$ ]] ||
      die 2 "codex effort must be low|medium|high|xhigh|max (ultra is not allowed)"
    ;;
  agy)
    [[ $effort =~ ^(low|medium|high|max)$ ]] || die 2 "agy effort must be low|medium|high|max"
    [[ $model == gemini-* ]] || die 2 "agy model must be a gemini-* model (a different family from Claude)"
    ;;
esac

if [[ -z $repo ]]; then
  repo=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
fi
repo=$(cd "$repo" && pwd)

[[ ! -e $repo/.claude/no-external-review ]] ||
  die 3 "external review disabled for this repo ($repo/.claude/no-external-review)"

notes=''
if [[ $input == - ]]; then
  notes=$(cat)
elif [[ -n $input ]]; then
  [[ -r $input ]] || die 2 "cannot read --input file: $input"
  notes=$(<"$input")
fi
[[ $mode == diff || -n $notes ]] || die 2 "plan mode needs the plan via --input"

git_() { git -C "$repo" "$@"; }

if [[ $mode == diff ]]; then
  git_ rev-parse --git-dir >/dev/null 2>&1 || die 5 "diff mode needs a git repo: $repo"
  if [[ -n $base ]]; then
    target="the changes on this branch relative to $base (git diff $base...HEAD)"
    files=$(git_ diff --name-only "$base...HEAD")
  elif [[ -n $commit ]]; then
    target="the changes introduced by commit $commit"
    files=$(git_ show --name-only --format= "$commit")
  else
    target="the uncommitted changes (git diff HEAD plus untracked files)"
    files=$(git_ diff --name-only HEAD; git_ ls-files --others --exclude-standard)
  fi
  [[ -n $files ]] || die 2 "no changes found for $target"

  secret_re='(^|/)(\.env(\.[^/]*)?|id_(rsa|ed25519|ecdsa)[^/]*|[^/]*\.(pem|key|p12|pfx)|[^/]*(secret|credential)[^/]*)$'
  allow_re='(^|/)\.env\.(example|sample|template)$'
  blocked=$(grep -Ei "$secret_re" <<<"$files" | grep -Evi "$allow_re" || true)
  [[ -z $blocked ]] || die 4 "diff touches secret-like files, not sending: $(tr '\n' ' ' <<<"$blocked")"

  preamble="You are an independent code reviewer from a different model family than the author. Review $target in the repository at $repo. Report only real defects: correctness, security, data loss, concurrency, broken contracts, missing error handling. For each, give file:line, severity (high/medium/low), and a concrete failure scenario. Skip style nits. Do not modify any files. If you find nothing significant, say so."
else
  preamble="You are an adversarial reviewer from a different model family than the author. Critique the plan below. Find flaws, wrong assumptions, missing risks, unverified claims, and cheaper or simpler alternatives. You may read files in $repo to check claims, but do not modify anything. Output a numbered list; each item gives severity (high/medium/low), the problem, evidence, and the change you recommend. If the plan is sound, say so and name its weakest point."
fi
work=$(mktemp -d "${TMPDIR:-/tmp}/second-opinion.XXXXXX")
trap 'rm -rf "$work"' EXIT
log=$work/log out=$work/out

echo "second-opinion: $tool $model/$effort mode=$mode repo=$repo"

run_codex() {
  local prompt=$preamble
  [[ -z $notes ]] || prompt+=$'\n\n'"--- Notes from the requester ---"$'\n'"$notes"
  local common=(-m "$model" -c "model_reasoning_effort=\"$effort\"" --ephemeral -o "$out")
  if [[ $mode == diff ]]; then
    (cd "$repo" && timeout "$timeout_s" codex exec review "$prompt" -c 'sandbox_mode="read-only"' "${common[@]}") \
      </dev/null >"$log" 2>&1
  else
    timeout "$timeout_s" codex exec - -s read-only --skip-git-repo-check -C "$repo" "${common[@]}" \
      <<<"$prompt" >"$log" 2>&1
  fi
}

# agy has no read-only mode, so it runs in an empty workspace whose PreToolUse hook
# allows only file-reading tools. agy ignores stdin in print mode, so the notes and
# any diff go in a file inside that workspace, and the prompt points at it.
run_agy() {
  local ws=$work/ws
  local input_file=$ws/review-input.md
  mkdir -p "$ws/.agents"
  jq -n --arg cmd "$SCRIPT_DIR/agy-gate.sh" \
    '{"second-opinion-readonly":{"PreToolUse":[{"matcher":"*","hooks":[{"type":"command","command":$cmd,"timeout":10}]}]}}' \
    >"$ws/.agents/hooks.json"

  {
    [[ -z $notes ]] || printf '%s\n\n%s\n\n' "--- Notes from the requester ---" "$notes"
    if [[ $mode == diff ]]; then
      echo "--- Diff under review ---"
      if [[ -n $base ]]; then
        git_ diff "$base...HEAD"
      elif [[ -n $commit ]]; then
        git_ show "$commit"
      else
        git_ diff HEAD
        git_ ls-files --others --exclude-standard -z |
          while IFS= read -r -d '' f; do git_ diff --no-index -- /dev/null "$f" || true; done
      fi
    fi
  } >"$input_file"

  local agy_prompt=$preamble
  [[ ! -s $input_file ]] ||
    agy_prompt+=$'\n\n'"Before anything else, read $input_file in full (use as many view_file calls as it takes). It holds the requester's notes and any diff under review. Shell commands are disabled; read repository files with view_file."

  (cd "$ws" && timeout "$timeout_s" agy --add-dir "$repo" --model "$model" --effort "$effort" -p "$agy_prompt") \
    </dev/null >"$out" 2>"$log"
}

status=0
"run_$tool" || status=$?
if ((status != 0)); then
  ((status == 124)) && echo "consult.sh: $tool timed out after ${timeout_s}s" >&2
  tail -n 20 "$log" >&2
  exit "$status"
fi
cat "$out"
