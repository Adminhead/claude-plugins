#!/usr/bin/env bash
set -euo pipefail
# Builds the workspace: a git repo whose origin is GitHub, with a CI workflow, two logos and a bare README.
git init -q
git remote add origin https://github.com/acme/widgets.git
mkdir -p .github/workflows assets
printf 'name: ci\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n' > .github/workflows/ci.yml
printf '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><title>widgets</title><rect width="10" height="10" fill="#222"/></svg>\n' > assets/logo-light.svg
printf '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><title>widgets</title><rect width="10" height="10" fill="#eee"/></svg>\n' > assets/logo-dark.svg
printf '# widgets\n' > README.md
