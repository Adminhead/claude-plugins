#!/usr/bin/env bash
set -euo pipefail
# Builds the workspace: a git repo whose origin is the forge under test, plus the listed files.
git init -q
git remote add origin https://github.com/acme/app.git
cat > package.json <<'EOF'
{
  "name": "app",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "lodash": "4.17.20"
  }
}
EOF
