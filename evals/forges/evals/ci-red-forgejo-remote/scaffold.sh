#!/usr/bin/env bash
set -euo pipefail
# Builds the workspace: a git repo whose origin is the forge under test, plus the listed files.
git init -q
git remote add origin https://git.example.org/acme/app.git
mkdir -p .forgejo/workflows
cat > .forgejo/workflows/ci.yml <<'EOF'
name: ci
on:
  push:
  pull_request:
jobs:
  test:
    runs-on: docker
    steps:
      - uses: actions/checkout@v4
      - run: go test ./...
EOF
