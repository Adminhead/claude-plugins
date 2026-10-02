#!/usr/bin/env bash
# Print the /test-harness scope: changed source files with their hunks, covering
# branch commits since the default branch plus uncommitted and untracked changes.
# An argument overrides the computed scope. Always exits 0 so the skill loads;
# any fallback is stated in the output.

set -euo pipefail

max_files=40
max_hunks=5
max_defs=10

src_re='\.(py|go|rs|js|jsx|mjs|cjs|ts|tsx|java|kt|rb|php|c|h|cc|cpp|hpp|cs|swift|scala|ex|exs|sh)$'
skip_re='(^|/)(tests?|__tests__|spec|testdata|fixtures|vendor|node_modules|third_party|dist|build|\.venv)/'
skip_re+='|(^|/)(test_[^/]*|[^/]*_test\.[a-z]+|[^/]*\.(test|spec)\.[a-z]+|conftest\.py|[^/]*Tests?\.(java|kt)'
skip_re+='|[^/]*\.pb\.go|[^/]*_pb2\.py|[^/]*\.min\.js|[^/]*\.d\.ts|[^/]*(\.gen|_generated)\.[a-z]+)$'

# Added lines that look like a function, method, or type definition.
def_re='^[+][[:space:]]*((export|default|pub([(][a-z]+[)])?|async|static|public|private|protected|final|override)[[:space:]]+)*'
def_re+='(def|func|fn|function|class|interface|struct|impl)[[:space:]]'
def_re+='|^[+][[:space:]]*(export[[:space:]]+)?(const|let)[[:space:]]+[A-Za-z_$][A-Za-z0-9_$]*[[:space:]]*=[[:space:]]*(async[[:space:]]*)?([(]|function)'

if (($#)); then
  echo "scope: argument override: $*"
  echo "A path means the functions in that file or directory; a symbol means its definition."
  exit 0
fi

if ! command -v git >/dev/null || ! root=$(git rev-parse --show-toplevel 2>/dev/null); then
  echo "scope: no git repository at $PWD, so no changes can be computed."
  exit 0
fi
cd "$root"

# Map extensions to git's built-in diff drivers so hunk headers name the
# enclosing function, including indented methods. Repo .gitattributes still win.
attrs=$(mktemp)
trap 'rm -f "$attrs"' EXIT
printf '%s\n' '*.py diff=python' '*.go diff=golang' '*.rs diff=rust' '*.java diff=java' \
  '*.kt diff=kotlin' '*.rb diff=ruby' '*.php diff=php' '*.cs diff=csharp' '*.ex diff=elixir' \
  '*.exs diff=elixir' '*.sh diff=bash' '*.c diff=cpp' '*.h diff=cpp' '*.cc diff=cpp' \
  '*.cpp diff=cpp' '*.hpp diff=cpp' >"$attrs"
g() { git -c core.quotePath=false -c core.attributesFile="$attrs" "$@"; }

base=
if ! head=$(git rev-parse -q --verify HEAD); then
  base=$(git hash-object -t tree /dev/null)
  label="no commits yet; scope is every staged and untracked file"
else
  for ref in origin/HEAD origin/main origin/master main master; do
    git rev-parse -q --verify "$ref^{commit}" >/dev/null || continue
    mb=$(git merge-base HEAD "$ref" 2>/dev/null) || continue
    base=$mb
    if [[ $mb == "$head" ]]; then
      label="no branch commits ahead of $ref; scope is uncommitted and untracked changes only"
    else
      label="branch commits since $ref (merge-base ${mb:0:10}) plus uncommitted and untracked changes"
    fi
    break
  done
  if [[ -z $base ]]; then
    base=HEAD
    label="no default branch found (tried origin/HEAD, origin/main, origin/master, main, master); scope is uncommitted and untracked changes only"
  fi
fi

mapfile -t entries < <(
  g diff --name-status --find-renames --diff-filter=d "$base" | awk -F'\t' '{print substr($1, 1, 1) FS $2 FS $NF}'
  g ls-files --others --exclude-standard | awk '{print "?" "\t" $0 "\t" $0}'
)

kept=()
skipped=0
for entry in "${entries[@]}"; do
  path=${entry##*$'\t'}
  if [[ $path =~ $src_re ]] && ! [[ $path =~ $skip_re ]]; then
    kept+=("$entry")
  else
    skipped=$((skipped + 1))
  fi
done

echo "scope: $label"
echo "root: $root"
echo "files: ${#kept[@]} changed source files ($skipped others skipped: tests, docs, config, lockfiles, generated, vendored)"

shown=0
for entry in "${kept[@]}"; do
  if ((shown == max_files)); then
    echo "… $((${#kept[@]} - max_files)) more files not shown"
    break
  fi
  shown=$((shown + 1))
  IFS=$'\t' read -r status old path <<<"$entry"
  case $status in
    A) kind=added ;;
    R) kind="renamed from $old" ;;
    '?') kind=untracked ;;
    *) kind=modified ;;
  esac
  echo "$path ($kind)"
  if [[ $status == '?' ]]; then
    g diff --no-index -U0 --no-color --no-ext-diff -- /dev/null "$path" || true
  else
    g diff -U0 --no-color --no-ext-diff --find-renames "$base" -- "$old" "$path"
  fi | awk -v max_hunks="$max_hunks" -v max_defs="$max_defs" -v def_re="$def_re" '
    /^@@/ {
      hunks++
      if (hunks > max_hunks) next
      match($0, /[+][0-9]+(,[0-9]+)?/)
      split(substr($0, RSTART + 1, RLENGTH - 1), r, ",")
      n = (r[2] == "") ? 1 : r[2] + 0
      range = (n == 0) ? "L" r[1] " (lines removed)" : (n == 1) ? "L" r[1] : "L" r[1] "-" r[1] + n - 1
      ctx = $0
      sub(/^@@[^@]*@@ ?/, "", ctx)
      print "  " range (ctx == "" ? "" : "  in " ctx)
      next
    }
    hunks > 0 && hunks <= max_hunks && /^[+]/ && $0 ~ def_re {
      if (++defs > max_defs) next
      line = substr($0, 2)
      sub(/^[ \t]+/, "", line)
      print "    + " substr(line, 1, 100)
    }
    END {
      if (hunks > max_hunks) print "  … " hunks - max_hunks " more hunks"
      if (defs > max_defs) print "  … " defs - max_defs " more definitions"
    }'
done
