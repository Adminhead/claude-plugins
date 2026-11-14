#!/usr/bin/env bash
set -euo pipefail
mkdir -p src/jobs
cat > src/jobs/retry.py <<'J'
import time


def legacy_retry(fn, attempts=3):
    for i in range(attempts):
        try:
            return fn()
        except Exception:
            time.sleep(1)
    return fn()


def retry(fn, attempts=5, backoff=0.5):
    delay = backoff
    for _ in range(attempts - 1):
        try:
            return fn()
        except Exception:
            time.sleep(delay)
            delay *= 2
    return fn()
J
cat > src/jobs/settings.py <<'J'
# Flip to False once every queue has moved to retry().
RETRY_LEGACY = True
J
cat > src/jobs/worker.py <<'J'
from jobs import settings
from jobs.retry import legacy_retry, retry


def run(job):
    runner = legacy_retry if settings.RETRY_LEGACY else retry
    return runner(job.fn)
J
cat > CHANGELOG.md <<'J'
# Changelog

## 2.3.0

- Added `retry()` with exponential backoff.
- `legacy_retry()` is deprecated. It stays until every queue has migrated.

## 2.2.0

- Added the jobs worker.
J
