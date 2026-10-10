#!/usr/bin/env bash
set -euo pipefail
cat > CLAUDE.md <<'J'
# billing-api

Small Flask service. Run tests with `pytest`.

## Sentry

- Signals: errors and traces. Logs and metrics are off.
- Scrubbing: client-side. Strip the `email` field from every event in a `before_send` hook before it leaves the process.
- Breadcrumbs: SDK defaults.
- Sample rates: errors 1.0 everywhere. Traces 1.0 in development and 0.07 in production.
- DSN: read from the `BILLING_SENTRY_DSN` environment variable.
J
cat > requirements.txt <<'J'
flask==3.1.0
sentry-sdk==2.20.0
J
cat > app.py <<'J'
import os

from flask import Flask

app = Flask(__name__)


@app.get("/health")
def health():
    return {"ok": True}
J
