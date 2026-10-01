#!/usr/bin/env bash
# Rebuilds hooks/vendor/openredaction-lite.mjs: @openredaction/core's `lite`
# entry bundled into one ESM file with no Node imports, for the hooks runtime.
#
#   - `node:module` is aliased to a stub (only used to lazily require NER).
#   - `compromise` (the NER library) is aliased to a stub that throws; the lite
#     entry never enables NER.
#   - `new Blob([text]).size` (no Blob in the hooks runtime) becomes a TextEncoder
#     byte count.
set -euo pipefail

VERSION=1.1.5
ESBUILD_VERSION=0.25.10
OUT="$(cd "$(dirname "$0")/.." && pwd)/hooks/vendor/openredaction-lite.mjs"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

(cd "$work" && npm pack "@openredaction/core@$VERSION" --silent >/dev/null && tar xzf ./*.tgz)

cat > "$work/stub-module.mjs" <<'STUB'
export const createRequire = () => () => {
  throw new Error('openredaction: optional dependency unavailable in the hooks runtime')
}
STUB
cp "$work/stub-module.mjs" "$work/stub-compromise.mjs"

cat > "$work/header.txt" <<HDR
/*!
 * Vendored build of @openredaction/core@$VERSION (dist/lite.mjs) via esbuild $ESBUILD_VERSION.
 * Source: https://github.com/sam247/openredaction (npm: @openredaction/core)
 * Modified only by bundling: node:module and compromise are stubbed, Blob size check uses TextEncoder.
 * Regenerate with plugins/secret-stash/scripts/build-vendor.sh. Do not edit by hand.
 *
 * MIT License (per the package's package.json "license" field)
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify, merge,
 * publish, distribute, sublicense, and/or sell copies of the Software, subject to the
 * following conditions: The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED
 * "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.
 */
HDR

npx --yes "esbuild@$ESBUILD_VERSION" "$work/package/dist/lite.mjs" \
  --bundle --format=esm --platform=neutral --target=es2022 \
  --alias:node:module="$work/stub-module.mjs" \
  --alias:compromise="$work/stub-compromise.mjs" \
  --banner:js="$(cat "$work/header.txt")" \
  --outfile="$OUT"

sed -i 's/new Blob(\[text\])\.size/new TextEncoder().encode(text).length/' "$OUT"
if grep -n "new Blob" "$OUT"; then
  echo "error: Blob reference remains in $OUT" >&2
  exit 1
fi

if grep -nE "from ['\"]node:|require\(['\"]node:" "$OUT"; then
  echo "error: Node import remains in $OUT" >&2
  exit 1
fi
echo "wrote $OUT"
