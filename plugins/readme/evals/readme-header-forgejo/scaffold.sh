#!/usr/bin/env bash
set -euo pipefail
# Builds the workspace: a git repo whose origin is Codeberg, with a Forgejo CI workflow, two logos and a bare README.
git init -q
git remote add origin https://codeberg.org/acme/widgets.git
mkdir -p .forgejo/workflows assets
printf 'on: [push]\njobs:\n  test:\n    runs-on: docker\n    steps:\n      - uses: actions/checkout@v4\n' > .forgejo/workflows/ci.yml
printf '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><title>widgets</title><rect width="10" height="10" fill="#222"/></svg>\n' > assets/logo-light.svg
printf '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><title>widgets</title><rect width="10" height="10" fill="#eee"/></svg>\n' > assets/logo-dark.svg
printf '# widgets\n' > README.md
