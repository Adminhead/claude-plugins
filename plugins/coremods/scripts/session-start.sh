#!/bin/sh
# SessionStart hook: records this install's root for the mod, and installs the DuckDB library into the plugin data dir.
# The install is done when installed.stamp holds the checksum of package.json + package-lock.json; the stamp is written only
# after `npm ci` succeeds, so an interrupted or failed install is retried. A mkdir lock serializes concurrent sessions, and a
# lock older than LOCK_STALE_MIN minutes (a killed install) is taken over. Fails open: always exits 0.
umask 077
d="${CLAUDE_PLUGIN_DATA:-}"
r="${CLAUDE_PLUGIN_ROOT:-}"
[ -n "$d" ] && [ -n "$r" ] || exit 0
mkdir -p "$d" && chmod 700 "$d" || exit 0
printf '%s' "$r" > "$d/plugin-root"

stamp="$d/installed.stamp"
want=$(cat "$r/package.json" "$r/package-lock.json" 2>/dev/null | cksum)
[ "$(cat "$stamp" 2>/dev/null)" = "$want" ] && exit 0

lock="$d/install.lock"
if [ -d "$lock" ] && [ -n "$(find "$lock" -maxdepth 0 -mmin +"${LOCK_STALE_MIN:-10}" 2>/dev/null)" ]; then
  rmdir "$lock" 2>/dev/null
fi
mkdir "$lock" 2>/dev/null || exit 0 # another session is installing
trap 'rmdir "$lock" 2>/dev/null' EXIT
trap 'exit 0' INT TERM

rm -f "$stamp"
if cp "$r/package.json" "$r/package-lock.json" "$d/" && (cd "$d" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund >"$d/install.log" 2>&1); then
  printf '%s' "$want" > "$stamp"
else
  echo "tool-mgr: installing @duckdb/node-api failed (see $d/install.log); metrics are disabled until it succeeds" >&2
fi
exit 0
