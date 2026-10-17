#!/usr/bin/env bash
# Checks the sandbox image: hadolint, shellcheck, a real build, then an offline in-image smoke test.
# shellcheck disable=SC2016 # single-quoted snippets expand inside the container
set -euo pipefail

dir=$(cd "$(dirname "$0")" && pwd -P)
repo=$(dirname "$dir")
image=claude-sandbox:check
hadolint=hadolint/hadolint:v2.15.1@sha256:32dac94127fd60b7b7e3fbfc65e1383b9b5e25c9bfd7b8536de7a539fe68a12d
user=$(id -un)
fail() { echo "FAIL: $*" >&2; exit 1; }

docker run --rm -i "$hadolint" < "$dir/Dockerfile" || fail "hadolint"
shellcheck "$dir/entrypoint.sh" "$dir/check.sh" || fail "shellcheck"

version=$(claude --version | awk '{print $1}')
[[ $version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "unparsable host claude version: $version"
docker build -t "$image" \
  --build-arg USERNAME="$user" --build-arg UID="$(id -u)" --build-arg GID="$(id -g)" \
  --build-arg CLAUDE_VERSION="$version" "$dir" || fail "docker build"

run() { docker run --rm --network none "$@"; }
# `command -v a b` returns only the last name's status, so check each name.
each='for t in "$@"; do command -v "$t" > /dev/null || { echo "missing: $t" >&2; exit 1; }; done'
tools=(bun node npm uv gh shellcheck codegraph rg fd jq git python3 tmux delta)

[[ $(run "$image" claude --version | awk '{print $1}') == "$version" ]] || fail "claude --version != $version"
run "$image" sh -c "$each" sh "${tools[@]}" || fail "non-login PATH misses a tool"
run "$image" bash -lc "$each" bash "${tools[@]}" || fail "login PATH misses a tool"
run "$image" python3 -I -c 'import json, sqlite3' || fail "python3 json/sqlite3"
run "$image" locale -a | grep -qx en_US.utf8 || fail "en_US.utf8 locale missing"

out=$(run --mount "type=bind,src=$repo/scripts,dst=$repo/scripts,ro" -w "$repo" "$image" \
  bash -lc "source scripts/agent.bashrc; set -- bun node gh codegraph rg; $each;"' echo "$LC_ALL $GOPATH"') \
  || fail "agent.bashrc: a tool is missing after sourcing"
[[ $out == "en_US.UTF-8 /home/$user/.go" ]] || fail "agent.bashrc desktop values: got '$out'"

for tool in bun codegraph gh shellcheck; do
  run "$image" "$tool" --version > /dev/null || fail "$tool --version"
done
run -w /tmp "$image" mise install || fail "mise install in an empty dir"
[[ $(run "$image" id -u) == "$(id -u)" ]] || fail "uid != host uid"
[[ $(run "$image" stat -c %U "/home/$user/.local/state/mise") == "$user" ]] || fail "/home/$user/.local/state/mise not owned by $user"
[[ -z $(run --entrypoint find "$image" "/home/$user" ! -user "$user") ]] || fail "files under /home/$user not owned by $user"

echo "image size: $(docker image inspect -f '{{.Size}}' "$image" | numfmt --to=iec)"
echo "all sandbox checks passed"
