# Rollback and readiness

Read when writing the rollback section, checking release readiness, or setting health and shutdown behavior.

## Rollback commands

Kubernetes Deployments keep old ReplicaSets, 10 by default (`revisionHistoryLimit`), so that is how far back you can roll.

```bash
kubectl rollout status deployment/<name>
kubectl rollout history deployment/<name>
kubectl rollout undo deployment/<name>                    # previous revision
kubectl rollout undo deployment/<name> --to-revision=<n>
```

Other platforms: redeploy the previous pinned image or artifact, flip the blue-green selector or load balancer back, or set canary weight to zero. For GitOps clusters, revert the commit and let the controller sync, since `rollout undo` is overwritten by the next sync (see `infra:gitops`).

A rollback command only changes the workload. Data written by the new version, applied migrations, and sent messages stay where they are.

## Rollback checklist

- [ ] Previous image or artifact is tagged and still in the registry.
- [ ] Migrations are backward-compatible: the old code runs on the new schema.
- [ ] Feature flags can disable the new behavior without a deploy.
- [ ] Alerts exist for error-rate spikes, and someone receives them.
- [ ] Rollback was rehearsed in staging, with timing.
- [ ] Rollback criteria are written as thresholds and a time window.

## Pre-deploy and post-deploy checklists

Pre-deploy: tests pass, review done, config and env vars present in the target, migrations reviewed, rollback plan written, backups taken.

Post-deploy: new version healthy, old pods or instances terminated, dashboards and alerts quiet, outcome recorded.

## Production readiness

Check what applies to the workload and skip the rest.

- Application: no secrets in code or config files, structured logs without personal data, health endpoint reports real status.
- Infrastructure: pinned image and dependency versions, environment variables validated at startup (fail fast), CPU and memory limits, scaling bounds, TLS on all endpoints.
- Monitoring: request rate, latency, and error metrics exported; alerts on error rate; searchable logs; uptime check on the health endpoint.
- Security: dependencies scanned, CORS limited to allowed origins, rate limiting on public endpoints, authorization verified, security headers set.
- Operations: migration tested against production-sized data, runbook for common failures, on-call and escalation defined.

## Health and shutdown

- Shallow check (liveness): the process answers. It must not depend on external services, or a database outage restarts every pod.
- Deep check (readiness): checks dependencies the service cannot work without. Use it as the gate before shifting traffic, and in the pipeline's post-deploy step.
- A health endpoint may return version and uptime for operators. Keep it from leaking internals to the public internet.

On SIGTERM, stop accepting new work, finish in-flight requests, then exit. In Kubernetes the pod is removed from Service endpoints and gets SIGTERM, and clients or load balancers may keep sending traffic for a short while. Set `terminationGracePeriodSeconds` (default 30) above the longest request, and add a `preStop` hook with a short sleep so endpoint removal propagates before the process stops. After the grace period the container receives SIGKILL.
