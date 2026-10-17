#!/usr/bin/env bash
# Bootstrap a machine from a clone: link the claude-tmux launcher, register the
# adminhead marketplace, and install the user-scope plugin set. Safe to rerun; never deletes.
set -Eeuo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/install.sh [--dry-run]

Links ~/.local/bin/claude-tmux and ~/.local/bin/claude-crew to this clone's launchers,
registers the adminhead marketplace and the third-party ones, and installs baseline
(the everyday plugin set) at user scope.
--dry-run prints every command that would change something.
EOF
}

dry=0
rc=0
die() { printf 'error: %s\n' "$*" >&2; exit 1; }
warn() { printf 'warning: %s\n' "$*" >&2; }
run() { # run CMD...: execute, or only print under --dry-run
  if ((dry)); then printf '+'; printf ' %q' "$@"; echo; else "$@"; fi
}

for arg in "$@"; do
  case $arg in
    --dry-run) dry=1 ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; die "unknown argument: $arg" ;;
  esac
done

if [[ -n ${CLAUDE_CONFIG_DIR:-} && $CLAUDE_CONFIG_DIR != "$HOME/.claude" ]]; then
  die "CLAUDE_CONFIG_DIR=$CLAUDE_CONFIG_DIR; ship-plugin and the docs assume ~/.claude"
fi

missing=()
for tool in claude git jq python3 bun node npm; do
  command -v "$tool" >/dev/null 2>&1 || missing+=("$tool")
done
((${#missing[@]} == 0)) || die "missing required tools: ${missing[*]}"
for tool in codegraph gh rg; do
  command -v "$tool" >/dev/null 2>&1 || warn "$tool not found (some plugins need it)"
done

repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)

markets=$(claude plugin marketplace list --json)
other=$(jq -r --arg repo "$repo" '.[] | select(.name == "adminhead")
  | select(.source != "directory" or .path != $repo)
  | "\(.source) \(.path // .repo // .url // "")"' <<<"$markets")
if [[ -n $other ]]; then
  die "marketplace adminhead already points at: $other (this clone is $repo). Fix it by hand; 'claude plugin marketplace remove adminhead' would uninstall every adminhead plugin."
fi
has_adminhead=$(jq -r '[.[] | select(.name == "adminhead")] | length' <<<"$markets")

# Launcher links, backing up whatever sits at each target.
for launcher in claude-tmux claude-crew; do
  src=$repo/scripts/$launcher.sh
  target=$HOME/.local/bin/$launcher
  bak=
  if [[ -e $target && $(realpath "$target") == "$src" ]]; then
    echo "ok $target"
  else
    run mkdir -p "$(dirname "$target")"
    if [[ -e $target || -L $target ]]; then
      if ((dry)); then
        echo "+ back up $target to $target.bak-*/"
      else
        bak=$(mktemp -d "$target.bak-$(date +%Y%m%d-%H%M%S).XXXX")
        mv "$target" "$bak/"
        echo "backed up existing $target to $bak/"
      fi
    fi
    if ! run ln -s "$src" "$target"; then
      if [[ -n $bak ]]; then mv "$bak/$launcher" "$target"; fi
      die "could not link $target"
    fi
  fi
done

for d in agents hooks prompts; do
  if [[ -e $HOME/.claude/$d || -L $HOME/.claude/$d ]]; then
    warn "legacy ~/.claude/$d exists; left alone. Remove it at slice 8 of docs/plans/marketplace-native-config.md"
  fi
done

if ((has_adminhead)); then
  echo "update adminhead"
  run claude plugin marketplace update adminhead
else
  run claude plugin marketplace add "$repo"
fi

# baseline depends on the everyday plugins, so one install pulls them in. Re-running install
# (unlike `plugin update`) also installs a dependency added to baseline since the last run.
manifest=$repo/plugins/baseline/.claude-plugin/plugin.json
[[ -f $manifest ]] || die "missing $manifest"
members=$(jq -r '.dependencies[]?' "$manifest") || die "cannot read dependencies from $manifest"
[[ -n $members ]] || die "$manifest lists no dependencies"
REQUIRED=(baseline@adminhead)
while IFS= read -r m; do REQUIRED+=("$m@adminhead"); done <<<"$members"

failed=()
run claude plugin install baseline@adminhead --scope user || { warn "install failed: baseline@adminhead"; failed+=(baseline@adminhead); rc=1; }

# Nothing was installed under --dry-run, so there is nothing to read back.
if ((!dry)); then
  installed=$(claude plugin list --json)
  for id in "${REQUIRED[@]}"; do
    state=$(jq -r --arg id "$id" '[.[] | select(.id == $id and .scope == "user")]
      | if length == 0 then "missing" elif .[0].enabled == false then "disabled" else "ok" end' <<<"$installed")
    case $state in
      missing) warn "$id is not installed at user scope" ;;
      disabled) warn "$id is installed but disabled; run: claude plugin enable $id --scope user" ;;
      *) continue ;;
    esac
    [[ " ${failed[*]} " == *" $id "* ]] || failed+=("$id")
    rc=1
  done
fi

# Third-party, last; a failure here leaves earlier steps in place.
run claude plugin marketplace add boostvolt/claude-code-lsps || { warn "could not add boostvolt/claude-code-lsps"; rc=1; }
if run claude plugin marketplace add conorbronsdon/avoid-ai-writing; then
  run claude plugin install avoid-ai-writing@conorbronsdon-skills --scope user || { warn "install failed: avoid-ai-writing@conorbronsdon-skills"; rc=1; }
else
  warn "could not add conorbronsdon/avoid-ai-writing"; rc=1
fi

if ((${#failed[@]})); then
  echo "error: ${#failed[@]} required plugin(s) not installed: ${failed[*]}" >&2
else
  echo "Restart Claude Code or run /reload-plugins. coremods installs DuckDB at the next session start."
fi
exit "$rc"
