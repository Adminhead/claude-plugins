# Canary tiers and metric gates

Read when running a canary, watching a deploy for regressions, or designing an approval or metric gate.

## Canary alert tiers

Compare each check with the pre-deploy baseline and record the delta. Adjust the numbers to the service's own SLOs.

| Tier | Triggers | Action |
| --- | --- | --- |
| Critical | HTTP status not 200 on key endpoints; any 5xx from a critical API; static assets returning 4xx or 5xx; event-stream endpoint cannot connect or drops before its first heartbeat; new console errors above a small count; LCP above 4 s | Stop promotion. Start rollback if it persists past the agreed window |
| Warning | LCP up more than 500 ms from baseline; CLS above 0.1; response time above twice the baseline; new console warnings; asset content type changed; heartbeat latency above twice the baseline | Hold at the current weight, investigate, flag in the report |
| Info | Minor performance variance; new third-party requests | Log only |

Report as a table so the delta is visible:

| Check | Result | Baseline | Delta |
| --- | --- | --- | --- |
| HTTP status | 200 | 200 | none |
| API `/health` latency | 145 ms | 120 ms | +25 ms |
| Error rate | 0.2% | 0.1% | +0.1 pt |

For a user-facing page, a browser tool (`playwright-cli`, if installed) can read console errors and timings after the deploy. A single pass is a smoke check. A sustained watch is the same check on an interval for the length of the window.

## Metric-gated promotion

Promote a canary from one weight to the next only when a metric query passes. In Argo Rollouts, an `AnalysisTemplate` metric has `successCondition` and `failureCondition`. When neither condition is met, the measurement is inconclusive and the rollout pauses until someone resumes or aborts it.

Each metric also has `inconclusiveLimit` (default 0), the number of inconclusive measurements allowed before the whole metric is considered inconclusive, and `consecutiveErrorLimit` (default 4) for measurements that error.

Traps:

- An empty query result (renamed metric, wrong label, no traffic at low weight) makes a condition such as `result[0] >= 0.95` error, because there is no element to index. That counts toward `consecutiveErrorLimit` and differs from the inconclusive pause above.
- The documented guard `len(result) == 0 || result[0] >= 0.95` makes an empty result pass. A broken query then promotes the canary silently, so use that guard only with a separate check that traffic reaches the canary.
- A gate with no failure condition never fails the rollout automatically. Define both conditions.
- Run the query by hand before the rollout and confirm it returns a value at the canary's traffic share. For writing the query, see `promql` (if installed).

Argo Rollouts docs: argo-rollouts.readthedocs.io, "Analysis".

## Approval gates

- GitHub Actions: a job that targets an `environment` waits for that environment's protection rules. Required reviewers (up to 6 people or teams, one approval is enough) and an optional wait timer are set in the environment's settings. On GitHub Free, Pro, and Team plans, required reviewers are available only for public repositories. Private and internal repositories need GitHub Enterprise.
- Check the environment's rules before relying on the gate. A missing or unreachable reviewer leaves the production job stuck or ungated, so confirm a test run reaches the reviewer.
- "Prevent self-review" stops the person who triggered the run from approving it.
- For a metric gate, prefer an automated check with a human override over a human-only gate that people approve by habit.

## Feature flag lifecycle

Create, enable for the team, then ramp (for example 5%, 25%, 50%, 100%) with a metric check at each step, then remove the flag and its dead code. Record an owner, an expiry, and a rollback trigger when creating the flag. A flag still present two weeks after full rollout is a cleanup task.
