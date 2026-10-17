# Jobs and CronJobs

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: <job>
  namespace: <ns>
spec:
  backoffLimit: 3
  activeDeadlineSeconds: 900
  ttlSecondsAfterFinished: 3600
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: <job>
          image: <registry>/<app>:<tag>
          command: ["<command>"]
          resources:
            requests: { cpu: 100m, memory: 256Mi }
```

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: <job>
  namespace: <ns>
spec:
  schedule: "0 2 * * *"
  timeZone: Etc/UTC
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 1
  jobTemplate:
    spec:
      backoffLimit: 2
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: <job>
              image: <registry>/<app>:<tag>
```

- `restartPolicy` must be `Never` or `OnFailure`. `Always` is rejected for Jobs.
- `Never` creates a new pod per retry and keeps failed pods for inspection. `OnFailure` restarts the container in the same pod. Prefer `Never` when you want the logs of each failed attempt.
- `backoffLimit` (default 6) caps retries. `activeDeadlineSeconds` caps total run time, so a hung job fails instead of running forever.
- `ttlSecondsAfterFinished` deletes finished Jobs. Without it they pile up.
- A Job's pod template is immutable. To change one, delete and recreate the Job (ask first), or let the CronJob create the next one.
- `concurrencyPolicy: Forbid` skips a run while the previous one is active. Use `Replace` only when the work is safe to cancel.
- Make the work idempotent. A Job can run a pod more than once, and a CronJob can miss or double-fire around outages.
- Jobs get the same `securityContext` and ServiceAccount rules as Deployments, and they need requests if the namespace has a ResourceQuota.
- Database migrations as Jobs must stay compatible with the previous app version for one release. See `deploy:rollout`.
