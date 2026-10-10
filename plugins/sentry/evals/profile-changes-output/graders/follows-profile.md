---
type: llm
---
Rule from the skill: read the project's `## Sentry` section in CLAUDE.md and follow it over the generic defaults. The fixture profile says: errors and traces only (no Logs, no metrics); client-side scrubbing that strips `email` in a `before_send` hook; trace sample rate 1.0 in development and 0.07 in production; DSN read from the `BILLING_SENTRY_DSN` environment variable.

PASS only if the code written to `sentry_setup.py` (or shown in the answer) meets ALL of these:
1. It reads the DSN from `BILLING_SENTRY_DSN`, not from a literal and not from `SENTRY_DSN`.
2. It registers a `before_send` hook that removes or masks `email`.
3. It sets a trace sample rate that is 0.07 for production and 1.0 for development (a `traces_sampler` or an environment-keyed value both count).
4. It enables no Logs and no metrics.
5. `app.py` imports the new module.
Judge the code, not the commentary. FAIL otherwise. Do not reward length.
