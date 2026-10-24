#!/usr/bin/env bash
set -euo pipefail
# Stub gh on $PWD/bin, put first on PATH through the workspace's project
# settings (a case env cannot set PATH). It serves the fixtures from the
# skill's tests/fixtures; every call is logged to gh-calls.log.
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
fixtures=$(cd "$here/../../skills/pr-comments/tests/fixtures" && pwd)
mkdir -p bin .claude
cat > bin/gh <<S
#!/usr/bin/env bash
echo "gh \$*" >> "\$(dirname "\$0")/../gh-calls.log"
case "\$1 \$2" in
  "pr view") echo "https://github.com/acme/widgets/pull/214" ;;
  "api graphql") cat "$fixtures/page1.json" "$fixtures/page2.json" ;;
  *) echo "stub gh: unsupported: \$*" >&2; exit 1 ;;
esac
S
chmod +x bin/gh
printf '{"env":{"PATH":"%s/bin:/usr/local/bin:/usr/bin:/bin"}}\n' "$PWD" > .claude/settings.json
