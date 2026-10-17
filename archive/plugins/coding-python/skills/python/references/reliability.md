# Reliability: retries, timeouts, batches, background jobs

Read this when adding retry logic, a timeout, a batch operation, or a queue worker. Use the repo's existing retry or queue library first. The examples use `tenacity` and Celery, so confirm the installed version and its docs before copying settings.

## Retry policy

1. **Decide what is transient.** Retry connection errors, timeouts, HTTP 429, and 502/503/504. Never retry `ValueError`, `TypeError`, authentication failures, or other 4xx responses, because the same input fails the same way and the retry only adds load.
2. **Retry at one layer.** If a client library, a proxy, or the queue already retries, adding another loop multiplies attempts (3 x 3 = 9 calls). Find the existing retry behavior before adding one.
3. **Bound it by attempts and by time.** An unbounded or attempts-only policy can hold a worker or request far past its deadline.
4. **Add jitter.** Synchronized clients that back off on the same schedule hit the recovering service together.
5. **Put a timeout on every network call.** A retry never starts if the first attempt hangs forever. Pick the timeout from the caller's own deadline.
6. **Log each retry** with the attempt number and the exception type, so a high retry rate shows up before an outage does.
7. **Re-raise the last error** (`reraise=True`) so callers see the real exception, not `tenacity.RetryError`.

```python
import logging

import httpx
from tenacity import (
    before_sleep_log, retry, retry_if_exception, stop_after_attempt,
    stop_after_delay, wait_exponential_jitter,
)

logger = logging.getLogger(__name__)
RETRYABLE_STATUS = {429, 502, 503, 504}

def is_transient(exc: BaseException) -> bool:
    if isinstance(exc, (httpx.ConnectError, httpx.TimeoutException)):
        return True
    return isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code in RETRYABLE_STATUS

@retry(
    retry=retry_if_exception(is_transient),
    stop=stop_after_attempt(5) | stop_after_delay(30),  # whichever comes first
    wait=wait_exponential_jitter(initial=1, max=10),
    before_sleep=before_sleep_log(logger, logging.WARNING),
    reraise=True,
)
def fetch(client: httpx.Client, url: str) -> dict:
    response = client.get(url, timeout=10)
    response.raise_for_status()
    return response.json()
```

`tenacity` decorators also work on `async def`. Keep the policy in a decorator or a client wrapper so business code doesn't repeat it.

A retried non-idempotent call, such as a POST that creates something, needs an idempotency key or the retry can duplicate the effect. Use `api:idempotency-retry` if installed.

## Batches

- Isolate failures per item only when the caller can act on a partial result. Return `succeeded` and `failed` maps keyed by input index or id, so one bad record doesn't discard the rest and none is lost silently.
- Catch the specific errors you can attribute to one item. A bug in the batch code itself should still stop the run.
- Report the failed map to the caller or the job record. Logging it alone hides it from whoever needs to retry.

## Background jobs

- **Return a job id at once** for work longer than a few seconds. Persist a job row (pending, running, succeeded, failed, timestamps, error) before enqueueing, and let clients poll it.
- **Assume at-least-once delivery.** A task can run twice after a crash or redelivery, so make it idempotent: check state before acting, pass an idempotency key to external calls, upsert (`INSERT ... ON CONFLICT`), or keep a deduplication window of processed ids.
- **Park permanent failures** in a dead-letter queue or a failed state with the error, instead of retrying forever. Alert on queue depth and on the failed count.
- Log state transitions with the job id.

Celery settings, from the Celery configuration docs (check the installed version):

| Setting | Effect |
| --- | --- |
| `task_acks_late = True` | Acknowledge after the task runs, so a crashed worker's task is redelivered. Requires idempotent tasks |
| `task_reject_on_worker_lost = True` | Requeue when the worker process dies mid-task. The docs warn it can cause message loops, so pair it with an idempotent task and a time limit |
| `worker_prefetch_multiplier = 1` | Each worker process reserves one message at a time. Long tasks stop queueing behind a busy worker |
| `task_soft_time_limit`, `task_time_limit` | Soft limit raises `SoftTimeLimitExceeded` for cleanup. The hard limit kills the worker process |

Per task, `autoretry_for=(...)` with `retry_backoff=True`, `retry_jitter=True`, `max_retries`, and `retry_backoff_max` gives bounded, jittered retries. List only transient exceptions, and use `dont_autoretry_for` to exclude subclasses. With the Redis or SQS transports, set `broker_transport_options = {"visibility_timeout": ...}` longer than the longest task, or the broker redelivers a task that is still running.
