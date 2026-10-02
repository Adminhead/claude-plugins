# Triage a failing workload (read-only)

State the context and namespace first, then run the cheapest command that narrows the cause. Everything here reads state. Don't `exec`, `delete`, or restart without the user's approval.

```sh
kubectl -n <ns> get pods -o wide
kubectl -n <ns> describe pod <pod>                    # events, state, last state, exit code
kubectl -n <ns> logs <pod> [-c <container>] --previous
kubectl -n <ns> get events --sort-by=.lastTimestamp
kubectl -n <ns> top pod <pod> --containers            # needs metrics-server
kubectl -n <ns> rollout status deployment/<app>
kubectl -n <ns> rollout history deployment/<app>
```

## By symptom

| Symptom | Look at | Common causes |
| --- | --- | --- |
| `CrashLoopBackOff` | `logs --previous`, `describe` last state and exit code | App error on start, bad config or missing Secret key, failing liveness probe, OOM. Restart delay grows exponentially up to 5 minutes. |
| `OOMKilled` (exit 137) | `describe` last state reason | Memory limit below real usage, a leak, or a JVM heap sized past the limit. Raise the limit from measured usage, or fix the leak. |
| `ImagePullBackOff` / `ErrImagePull` | `describe` events | Wrong tag or registry, missing `imagePullSecrets`, private registry credentials, or a pull rate limit. |
| `Pending` | `describe` events (`FailedScheduling`) | Insufficient CPU or memory for the requests, node selector or affinity with no match, untolerated taint, an unbound PersistentVolumeClaim. |
| `Running` but not `Ready` | `describe` probe events, `logs` | Readiness probe failing: wrong path or port, dependency down, `timeoutSeconds` too low. |
| `CreateContainerConfigError` | `describe` events | A referenced ConfigMap, Secret, or key is missing. |
| Pods never created | `describe rs <replicaset>`, `describe deployment` | Admission rejection (Pod Security, quota, webhook), or a missing ServiceAccount. |
| Service unreachable | `get endpointslices -l kubernetes.io/service-name=<svc>` | Selector doesn't match pod labels, pods not ready, `targetPort` wrong, a NetworkPolicy blocking traffic. |
| Rollout stuck | `rollout status`, `describe deployment` | New pods failing readiness, `maxUnavailable: 0` with no spare capacity, a quota limit. |

Check exit codes: 137 is SIGKILL (OOM or a failed termination), 143 is SIGTERM, and 1 or 2 is an application error.

## Permissions problems

```sh
kubectl auth can-i <verb> <resource> --as system:serviceaccount:<ns>:<sa> -n <ns>
```

A `forbidden` in app logs names the user, verb, and resource. Fix the Role (see [rbac](rbac.md)) rather than widening to `cluster-admin`.

## Fixing

Propose the fix as a manifest change and validate it (`kubeconform`, `apply --dry-run=server`, `kubectl diff`) before asking to apply. A rollback is `kubectl rollout undo deployment/<app>`. Run it only with approval, and note that it doesn't undo database migrations.
