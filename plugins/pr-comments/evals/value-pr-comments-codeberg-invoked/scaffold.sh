#!/usr/bin/env bash
set -euo pipefail
mkdir -p src
cat > src/stats.py <<'J'
def total(items):
    return sum(item["price"] * item["qty"] for item in items)


def average(items):
    return total(items) / len(items)
J
git init -q -b feat/stats
git remote add origin https://codeberg.org/acme/ledger.git
git add src/stats.py
git -c user.name=eval -c user.email=eval@example.com commit -q -m "feat: add stats helpers"
