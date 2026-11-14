#!/usr/bin/env bash
set -euo pipefail
cat > signups.csv <<'J'
email,plan,seats
dana.okafor@example.test,pro,12
sam.whitlock@example.test,team,40
mira.lindqvist@example.test,pro,3
J
cat > signups.json <<'J'
[
  {"email": "dana.okafor@example.test", "plan": "pro", "seats": "12", "status": "verified-2026-03"},
  {"email": "sam.whitlock@example.test", "plan": "team", "seats": "40", "status": "verified-2026-03"}
]
J
