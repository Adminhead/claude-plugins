#!/usr/bin/env bash
# Spec for skills/godot-mcp-setup/scripts/install-addon.sh, offline.
# Builds synthetic tarballs and checks install, update, dry-run and refusals.
# Run: bash plugins/godot-mcp-setup/tests/install-addon-spec.sh
set -uo pipefail

here="$(cd -- "$(dirname -- "$0")" && pwd -P)"
script="$here/../skills/godot-mcp-setup/scripts/install-addon.sh"
work="$(mktemp -d)"
trap 'rm -rf -- "$work"' EXIT
fails=0

ok() { echo "ok   $1"; }
bad() { echo "FAIL $1"; fails=$((fails + 1)); }
expect() { # name, condition...
  local name="$1"; shift
  if "$@"; then ok "$name"; else bad "$name"; fi
}

mkproj() {
  mkdir -p "$1"
  printf 'config_version=5\n\n[application]\n\nconfig/features=PackedStringArray("4.7")\n' > "$1/project.godot"
}

mktar() { # out.tgz version [extra-setup-fn]
  local root="$work/src-$RANDOM"
  mkdir -p "$root/godot-mcp-HEAD/addons/godot_mcp" "$root/godot-mcp-HEAD/src"
  printf '[plugin]\n\nname="Godot MCP"\nversion="%s"\nscript="plugin.gd"\n' "$2" \
    > "$root/godot-mcp-HEAD/addons/godot_mcp/plugin.cfg"
  echo 'extends EditorPlugin' > "$root/godot-mcp-HEAD/addons/godot_mcp/plugin.gd"
  echo 'not copied' > "$root/godot-mcp-HEAD/src/server.ts"
  if [ $# -ge 3 ]; then "$3" "$root/godot-mcp-HEAD"; fi
  # Commit the tree and archive it, so the tarball carries a real commit id.
  git -C "$root/godot-mcp-HEAD" init -q
  git -C "$root/godot-mcp-HEAD" add -A
  git -C "$root/godot-mcp-HEAD" -c user.name=t -c user.email=t@t commit -q -m fixture
  git -C "$root/godot-mcp-HEAD" rev-parse HEAD > "$1.sha"
  git -C "$root/godot-mcp-HEAD" archive --format=tar.gz --prefix=godot-mcp-HEAD/ -o "$1" HEAD
}

sha_of() { cat -- "$1.sha" 2>/dev/null || echo 0000000000000000000000000000000000000000; }
run() { GODOT_MCP_TARBALL="$1" "$script" "${@:2}"; }
# Real install of a fixture with the commit its dry run would report.
install() { GODOT_MCP_TARBALL="$1" "$script" --commit "$(sha_of "${1#file://}")" "$2"; }
refuses() { ! GODOT_MCP_TARBALL="$1" "$script" --commit "$(sha_of "$1")" "$2" 2>/dev/null; }

# Fresh install, then update.
mkproj "$work/p"
mktar "$work/v1.tgz" 0.1.0
mktar "$work/v2.tgz" 0.2.0

out="$(run "$work/v1.tgz" --dry-run "$work/p")"
expect "dry-run reports none -> 0.1.0" grep -q '^installed_version=none$' <<<"$out"
expect "dry-run writes nothing" test ! -e "$work/p/addons"

expect "dry-run reports the archive commit" grep -qx "commit=$(sha_of "$work/v1.tgz")" <<<"$out"

# The real install is pinned to the approved commit.
no_commit() { ! GODOT_MCP_TARBALL="$work/v1.tgz" "$script" "$work/p" 2>/dev/null; }
expect "install without --commit fails" no_commit
bad_commit() { ! GODOT_MCP_TARBALL="$work/v1.tgz" "$script" --commit "$(sha_of "$work/v2.tgz")" "$work/p" 2>/dev/null; }
expect "mismatched commit fails" bad_commit
short_commit() { ! GODOT_MCP_TARBALL="$work/v1.tgz" "$script" --commit abc123 "$work/p" 2>/dev/null; }
expect "non-40-hex commit fails" short_commit
dry_commit() { ! GODOT_MCP_TARBALL="$work/v1.tgz" "$script" --dry-run --commit "$(sha_of "$work/v1.tgz")" "$work/p" 2>/dev/null; }
expect "--dry-run with --commit is bad usage" dry_commit
expect "refused installs write nothing" test ! -e "$work/p/addons"

out="$(install "file://$work/v1.tgz" "$work/p")"
expect "install action" grep -q '^action=installed$' <<<"$out"
expect "addon copied" test -f "$work/p/addons/godot_mcp/plugin.gd"
expect "only the addon copied" test ! -e "$work/p/src"

echo stale > "$work/p/addons/godot_mcp/old_file.gd"
out="$(install "$work/v2.tgz" "$work/p")"
expect "update reports 0.1.0 -> 0.2.0" grep -q '^installed_version=0.1.0$' <<<"$out"
expect "update action" grep -q '^action=updated$' <<<"$out"
expect "old copy replaced" test ! -e "$work/p/addons/godot_mcp/old_file.gd"
expect "no staging dir left" test ! -e "$work/p/addons/.godot_mcp.new"

# Refusals.
expect "no project.godot" refuses "$work/v1.tgz" "$work"

mkproj "$work/sym"; ln -s "$work" "$work/sym/addons"
expect "symlinked addons" refuses "$work/v1.tgz" "$work/sym"

add_link() { ln -s /etc/passwd "$1/addons/godot_mcp/link"; }
mktar "$work/link.tgz" 0.1.0 add_link
expect "symlink inside addon" refuses "$work/link.tgz" "$work/p"

python3 -I -c '
import io, sys, tarfile
t = tarfile.open(sys.argv[1], "w:gz")
i = tarfile.TarInfo("x/../../escape"); i.size = 1
t.addfile(i, io.BytesIO(b"x")); t.close()' "$work/dotdot.tgz"
expect "parent-relative path" refuses "$work/dotdot.tgz" "$work/p"

no_addon() { rm -rf "$1/addons"; }
mktar "$work/empty.tgz" 0.1.0 no_addon
expect "archive without the addon" refuses "$work/empty.tgz" "$work/p"

echo "not a tarball" > "$work/junk.tgz"
expect "not a tarball" refuses "$work/junk.tgz" "$work/p"
expect "failed runs left v2 in place" grep -q 'version="0.2.0"' "$work/p/addons/godot_mcp/plugin.cfg"

usage_exit() { "$script" >/dev/null 2>&1; test $? -eq 2; }
expect "bad usage exits 2" usage_exit

if [ "$fails" -ne 0 ]; then echo "$fails failed"; exit 1; fi
echo "all passed"
