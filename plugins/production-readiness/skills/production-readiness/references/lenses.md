# Readiness lenses

Read when working through step 2 of the skill. Each list is questions to answer from files, not a form to fill. Skip anything the repo has no surface for.

## Security and auth

- Public, API, and admin routes are separated, and authentication and authorization are enforced on the server.
- Secrets stay out of client bundles, logs, example output, and committed files. Check `.env*` files, build output config, and logging calls near request bodies.
- Rate limits, CSRF protection, CORS policy, and upload validation exist where the app needs them.
- Agent or LLM features keep untrusted content away from privileged tool calls.

## Data integrity

- Migrations run forward from the current production schema. Destructive changes (drop, rename, type change) are staged: add, backfill, switch readers, drop in a later release.
- Backfills and imports are batched and resumable.
- Each migration has a rollback or a stated recovery plan. A migration that cannot be reversed needs a backup or restore point named in the release notes.
- Database grants and policies match the tenancy model.
- Retried writes, jobs, and webhook handlers are idempotent.

## Payments and webhooks

- The signature is verified against the raw body before any field is trusted.
- Each handler deduplicates on the provider's event id, with the dedupe record written in the same transaction as the effect.
- Replay, duplicate delivery, and out-of-order delivery leave the same final state.
- Test-mode and live-mode credentials come from separate config.

## Operations

- A clean checkout starts with documented commands.
- Required environment variables are named, parsed once at startup, and the process exits non-zero when one is missing or malformed.
- The health check proves the dependencies the service needs, and liveness is separate from readiness where the platform distinguishes them.
- Deploy, rollback, and incident-owner steps are written down and match what the pipeline does.
- Logs help during an incident without leaking secrets or personal data.

## Observability

- Errors reach a tracker or alert with enough context (release, route, request id) to act on.
- The signals that mean "broken" for this app (error rate, queue depth, failed payments, job lag) have an alert or a named dashboard.
- A new release can be told apart in the data, for example by a version tag.

## User paths

- The two or three journeys that carry the launch (sign-up, purchase, core action) have end-to-end tests, or a stated manual check with an owner.
- Loading, empty, error, and permission-denied states tell the user what happened and what to do.
- A support or recovery path exists when a critical operation fails.

## Platform lenses

### AWS

- IAM roles are least-privilege and scoped per workload. Look for `*` actions or resources in policies.
- Buckets, snapshots, and databases are not public. Encryption at rest and backups are on for stateful stores, and a restore has been tried.
- Secrets live in a secret manager or parameter store, not in task or function environment definitions in plain text.
- Autoscaling, timeouts, and concurrency limits fit the expected load, and downstream quotas are known.
- Alarms exist for the signals above, and logs have a retention setting.

### Kubernetes

- Workloads set resource requests and limits, and readiness and liveness probes that match the health check above.
- Rollout strategy and `maxUnavailable` allow a failed release to stop before taking down serving pods. A rollback command is documented and works with the chart or manifests in the repo.
- Images are pinned to a version or digest, and containers do not run as root without a reason.
- Secrets come from a secret source, not committed manifests. A NetworkPolicy or equivalent limits traffic where the cluster enforces them.
- A PodDisruptionBudget covers workloads that must stay up through node drains.

### Terraform and OpenTofu

- Remote state with locking is configured, and state is not committed.
- Provider and module versions are pinned, and the lockfile is committed.
- The release path runs `plan` and a human or policy reviews it before `apply`. Check the plan for replacements and destroys of stateful resources.
- Stateful resources carry deletion protection or `prevent_destroy` where loss would be costly.
- Variables hold no secret defaults, and sensitive outputs are marked.

### Migrations

- The migration tool and the deploy order are known: do migrations run before, during, or after the new code starts?
- Old and new code both work against the schema during the rollout window.
- Long locks are avoided (for example, add indexes concurrently where the database supports it), and the largest table's migration time is estimated.
- The down path or restore plan has been exercised on non-production data.
