#!/usr/bin/env bash
# Installs or updates the godot_mcp editor addon in a Godot project.
#
# The dry run downloads the default-branch tarball of github.com/voidrot/godot-mcp
# and reports the commit it came from. The real install requires that commit
# (--commit), downloads archive/<commit>.tar.gz, and refuses unless the tarball's
# embedded commit id matches, so it installs exactly what the dry run showed.
# Either way it extracts into a new temp dir and copies only addons/godot_mcp/
# into the project, replacing an older copy. Nothing from the tarball is executed. It
# never touches project.godot or .mcp.json.
#
# Usage: install-addon.sh --dry-run <project-dir>
#        install-addon.sh --commit <40-hex> <project-dir>
#   --dry-run  download HEAD and report the versions and commit, change nothing
#   --commit   the commit= value from the dry run; required for a real install,
#              which also needs git
# Env:
#   GODOT_MCP_TARBALL  local .tar.gz path or file:// URL to use instead of
#                      downloading (for tests and offline installs)
#
# Output (stdout, one key=value per line): project, installed_version,
# new_version, commit, action (dry-run|installed|updated).
# Diagnostics go to stderr. Exit 0 on success, 1 on error, 2 on bad usage.
set -euo pipefail

BASE="https://github.com/voidrot/godot-mcp/archive"

die() { echo "install-addon: $*" >&2; exit 1; }
usage() { sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }

dry_run=0
want=""
project=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) dry_run=1 ;;
    --commit) [ $# -ge 2 ] || usage; want="$2"; shift ;;
    -h|--help) usage ;;
    -*) echo "install-addon: unknown option $1" >&2; usage ;;
    *) [ -z "$project" ] || usage; project="$1" ;;
  esac
  shift
done
[ -n "$project" ] || usage
if [ "$dry_run" -eq 1 ]; then
  [ -z "$want" ] || usage
  URL="$BASE/HEAD.tar.gz"
else
  [ -n "$want" ] || die "a real install requires --commit <sha> from the dry run"
  [[ "$want" =~ ^[0-9a-f]{40}$ ]] || die "--commit must be 40 lowercase hex characters"
  command -v git >/dev/null || die "git not found; it is needed to verify the commit"
  URL="$BASE/$want.tar.gz"
fi

[ -d "$project" ] || die "not a directory: $project"
project="$(cd -- "$project" && pwd -P)"
[ -f "$project/project.godot" ] || die "no project.godot in $project (pass the Godot project folder)"
for p in "$project/addons" "$project/addons/godot_mcp"; do
  [ ! -L "$p" ] || die "$p is a symlink; refusing to write through it"
done

read_version() { # plugin.cfg -> version string, or empty
  sed -n 's/^version="\([^"]*\)".*$/\1/p' "$1" | head -n 1
}

installed=""
if [ -f "$project/addons/godot_mcp/plugin.cfg" ]; then
  installed="$(read_version "$project/addons/godot_mcp/plugin.cfg")"
fi

tmp="$(mktemp -d)"
trap 'rm -rf -- "$tmp"' EXIT
archive="$tmp/godot-mcp.tar.gz"

if [ -n "${GODOT_MCP_TARBALL:-}" ]; then
  src="${GODOT_MCP_TARBALL#file://}"
  [ -f "$src" ] || die "GODOT_MCP_TARBALL is not a file: $src"
  cp -- "$src" "$archive"
else
  command -v curl >/dev/null || die "curl not found"
  curl -fsSL --proto '=https' --proto-redir '=https' --max-time 120 -o "$archive" "$URL" \
    || die "download failed: $URL"
fi

# Refuse absolute paths and .. components before extracting anything.
tar -tzf "$archive" > "$tmp/list" || die "not a readable .tar.gz: $archive"
if grep -Eq '^/|(^|/)\.\.(/|$)' "$tmp/list"; then
  die "archive contains absolute or parent-relative paths; refusing"
fi

commit="unknown"
if command -v git >/dev/null; then
  commit="$(gzip -dc "$archive" | git get-tar-commit-id 2>/dev/null || true)"
  [ -n "$commit" ] || commit="unknown"
fi
if [ "$dry_run" -eq 0 ] && [ "$commit" != "$want" ]; then
  die "archive commit is $commit, not the approved $want; refusing"
fi

mkdir "$tmp/x"
tar -xzf "$archive" -C "$tmp/x" --no-same-owner || die "could not extract the archive"

shopt -s nullglob
cfgs=("$tmp"/x/*/addons/godot_mcp/plugin.cfg)
shopt -u nullglob
[ "${#cfgs[@]}" -eq 1 ] || die "expected one */addons/godot_mcp/plugin.cfg in the archive, found ${#cfgs[@]}"
addon="$(dirname -- "${cfgs[0]}")"

# Only regular files and directories may be copied (no symlinks, devices, fifos).
odd="$(find "$addon" ! -type f ! -type d -print | head -n 5)"
[ -z "$odd" ] || die "addon contains non-regular files; refusing: $odd"

new="$(read_version "$addon/plugin.cfg")"
[ -n "$new" ] || die "no version= line in the downloaded plugin.cfg"

echo "project=$project"
echo "installed_version=${installed:-none}"
echo "new_version=$new"
echo "commit=$commit"

if [ "$dry_run" -eq 1 ]; then
  echo "action=dry-run"
  exit 0
fi

mkdir -p "$project/addons"
staging="$project/addons/.godot_mcp.new"
rm -rf -- "$staging"
cp -R -- "$addon" "$staging"
rm -rf -- "$project/addons/godot_mcp"
mv -- "$staging" "$project/addons/godot_mcp"

if [ -n "$installed" ]; then echo "action=updated"; else echo "action=installed"; fi
