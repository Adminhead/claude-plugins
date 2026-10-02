# Probes

Defaults: `periodSeconds` 10, `timeoutSeconds` 1, `failureThreshold` 3, `initialDelaySeconds` 0. Liveness and readiness probes stay off until the startup probe succeeds once.

| Probe | On failure | Use for |
| --- | --- | --- |
| `startupProbe` | Restarts the container once the threshold is spent | Slow starts (JVM, large caches, migrations). Replaces a large `initialDelaySeconds`. |
| `livenessProbe` | Restarts the container | A hung or deadlocked process that can't recover itself |
| `readinessProbe` | Removes the pod from Service endpoints, no restart | Not ready for traffic right now (warming up, draining, dependency down) |

## Time math

A probe gives up after `failureThreshold x periodSeconds` of consecutive failures.

- Startup budget: `failureThreshold: 30` with `periodSeconds: 5` allows 150 s to start. Size it from the slowest observed start plus margin.
- Restart delay: `failureThreshold: 3` with `periodSeconds: 10` restarts a hung container after about 30 s.
- A probe slower than `timeoutSeconds` counts as a failure. Raise the timeout before raising the threshold when the endpoint is merely slow.

## Rules

- Keep liveness shallow. It checks that the process can serve a trivial request, not that the database is up. A liveness probe that fails when a dependency is down restarts every pod at once and turns an outage into a restart storm.
- Put dependency checks in readiness. A pod that can't reach its database should leave the Service rotation and stay running.
- Use different endpoints for liveness and readiness, or at least different logic. The same failing endpoint on both removes the pod from traffic and restarts it.
- Prefer `startupProbe` over `initialDelaySeconds` on liveness. A fixed delay is either too short (restart loop) or too long (slow detection).
- Choose the handler the image supports: `httpGet`, `tcpSocket`, `grpc`, or `exec`. A distroless image has no shell, so `exec` probes that call `sh` or `curl` fail.
- Make the app handle SIGTERM and fail readiness during shutdown so the endpoint is removed before the process exits.
