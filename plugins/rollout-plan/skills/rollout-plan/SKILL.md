---
name: rollout-plan
description: Plans and verifies a production rollout (rolling, blue-green or canary choice, preflight go/no-go, phased verification signals, numeric rollback criteria, post-deploy follow-up). Use when preparing a release, infrastructure change or migration that needs a written plan, judging whether a deploy is healthy, or deciding whether to roll back.
---

# Production rollout planning

Plans only; it does not run deploys. Not for CI/CD pipeline YAML (`gh-actions`, if installed), schema migration design (`db-schema-design`, if installed), or a ship-or-block readiness review (`production-readiness`).

Produce a rollout plan the operator can execute and a verifier can check. Gather the inputs first, choose a strategy, then write the plan with the sections below. Scale it to risk: a low-risk config change needs sections 1, 3, 4, and 6 in a few lines each, and a data migration or multi-service change needs all of them.

## Inputs to collect

Ask the user for anything you cannot read from the repo.

- What changes, and the from and to versions.
- Target environment, platform (Kubernetes, VMs, serverless, a single host), affected services and dependencies, current scale.
- Downtime budget, change-window limits, and who must approve.
- Blast radius, data or schema changes, and what rollback costs.

## Choose a strategy

| Strategy | Pick when | Cost | Rollback |
| --- | --- | --- | --- |
| Rolling | Default. Old and new versions can run side by side | Low | Redeploy the previous version; slow for large fleets |
| Blue-green | Needs an atomic cutover, or old and new cannot overlap | Double capacity during the switch | Flip traffic back |
| Canary | High risk, with traffic splitting and metrics to judge by | Needs routing and observability | Route canary weight to zero |

Pick the simplest strategy the platform supports. A canary without a metric that can fail is a slow rolling deploy. For a homelab or single host, a rolling replace with a health check and a pinned previous image is usually enough.

## Plan sections

1. **Summary.** What, why, when, expected duration, risk level, rollback time, user impact, expected downtime.
2. **Prerequisites and approvals.** Named approvers, backups taken, capacity checked, monitoring and rollback automation in place. The previous artifact is tagged and still available.
3. **Preflight and go/no-go.** Infrastructure healthy, a baseline of the key metrics recorded (error rate, latency, saturation), dependencies up, and a yes/no checklist. Any "no" stops the rollout.
4. **Procedure.** Ordered steps with the exact command, the check that follows each, and a duration estimate. Phases are pre-deploy, deploy, progressive verification.
5. **Verification signals.** See the table below.
6. **Rollback.** Decision criteria stated as numbers before the deploy starts, the steps, and the check that proves recovery. See `references/rollback-and-readiness.md`.
7. **Communication.** Who hears what and when: before, at start, progress, completion, and rollback. Skip the matrix for a solo or single-team change.
8. **Post-deploy.** Within an hour confirm the success criteria and read logs. Within a day watch metrics and errors. Within a week hold a short review, and delete rollout-only flags.
9. **Contingencies.** For partial failure, degraded performance, data inconsistency, and dependency failure, write the symptom, the response, and the time limit before escalating.
10. **Contacts.** Primary and secondary on-call, escalation path, owners of database, network, and security.

## Verification signals

Compare each signal with the baseline from preflight, because an absolute number means little without it.

| Window | Check |
| --- | --- |
| 0 to 2 min | New instances started, health checks pass, no crash loops |
| 2 to 5 min | Traffic served, error rate and latency within threshold |
| 5 to 15 min | Sustained metrics, stable connections, downstream integrations working |
| 15 min and later | No slow degradation (memory, queue depth, connection pools), business metrics normal |

Watch metrics, not only logs. A log that stays quiet can mean the service stopped logging. For canary tiers and metric gates, read `references/canary-and-gates.md`.

## Rules that prevent common failures

- Keep migrations additive for one release. Rollback restores old code but leaves the migration applied, so the old code must run against the new schema. Drop or tighten columns in a later release (expand-contract, see `db-schema-design`, if installed).
- Set rollback triggers before the deploy, as thresholds (for example error rate above the baseline by a stated margin for five minutes). Deciding mid-incident invites hesitation.
- Give every feature flag an owner, an expiry, and a rollback trigger, and remove the flag and its dead code after the rollout completes.
- Make the readiness check test real dependencies, and the liveness check shallow. A pipeline that only calls a shallow `/ping` will pass while the database is unreachable.
- Handle SIGTERM and set a grace period longer than the longest request, or in-flight requests drop on every deploy. On Kubernetes, see `references/rollback-and-readiness.md`.
- Avoid starting a high-risk rollout when nobody can respond afterwards, such as late on a Friday, unless the change is an emergency fix.
- Run every verification step you wrote and record the result, because a rollout that was never checked cannot be called healthy.

Adapted from awesome-copilot `devops-rollout-plan` and `gem-devops-guidelines` (MIT, Copyright GitHub, Inc.), ECC `deployment-patterns` and `canary-watch` (MIT, Copyright (c) 2026 Affaan Mustafa), and wshobson/agents `deployment-pipeline-design` (MIT, Copyright (c) 2024 Seth Hobson). See `LICENSE` in the plugin root.
