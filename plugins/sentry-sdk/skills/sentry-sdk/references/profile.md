# Project profile

A project profile records the project's Sentry choices once, so every task starts from the same standard instead of from the skill's guesses. It lives in a `## Sentry` section of the project's `CLAUDE.md` or `AGENTS.md`.

## Find the profile

1. Look for a `## Sentry` heading in `CLAUDE.md`, then `AGENTS.md`, at the repo root and in the directory being changed. In a monorepo, the nearer file wins.
2. Read the whole section. A line in the profile overrides the matching generic default below, and an unlisted topic keeps the default.
3. If the user's request contradicts the profile, follow the request and say which profile line it overrides.
4. If there is no section, use the generic defaults, state that you did, and offer to write the section from the choices made in this task. Write it only after the user agrees, because it edits a shared instruction file.

## What a profile covers

| Topic | Question it answers |
| --- | --- |
| Signals | Which of errors, logs, metrics, and traces this project sends, and which stay off |
| Logging bridge | Which logging library feeds Sentry Logs or events, and the minimum level |
| Scrubbing | Whether to filter client-side, or rely on server-side rules only, and any fields that must never leave the process |
| Breadcrumbs | SDK defaults, extra categories to add, or categories to drop |
| Sample rates | Error and trace rates per environment |
| DSN location | Where the DSN is read from, per environment, and who creates projects |

## Generic defaults

These apply when the profile is silent. They are conservative on purpose: they send the least data and cost the least, and any of them is one line away from a project's own choice.

| Topic | Default |
| --- | --- |
| Signals | Errors only. Add traces, Logs, or metrics when the task asks for them. |
| Logging bridge | None. When Logs are requested, bridge `warn` and above only, so debug chatter stays local. |
| Scrubbing | `sendDefaultPii` off (or the SDK's equivalent), no request bodies, headers, or user input in tags, and server-side scrubbing rules. Client-side `beforeSend*` filters only when the user asks. |
| Breadcrumbs | The SDK's defaults, with nothing added. |
| Error sample rate | `1.0` in every environment. |
| Trace sample rate | `1.0` in development, `0.1` in production, and `0.25` in other environments, until real traffic data says otherwise. |
| DSN location | The project's existing config source (environment variable, secrets store, or app config), with `<SENTRY_DSN>` as the placeholder. Never a literal DSN in code. |
| Environment name | The deployment's own name (`production`, `staging`, `development`), set explicitly rather than left to the SDK. |

Trace rates are a starting point, since volume and quota differ by project. Say so when proposing them.

## Example section

```markdown
## Sentry

- Signals: errors, traces, and Logs. Metrics are off.
- Logs: bridge the app logger at `warn` and above.
- Scrubbing: server-side only. Never attach customer email or account ids to tags.
- Breadcrumbs: SDK defaults.
- Sample rates: errors 1.0 everywhere. Traces 1.0 in dev, 0.2 in staging, 0.05 in prod.
- DSN: read from the `SENTRY_DSN` key in the app config of each environment. Projects are created through the Sentry MCP tools, one per service.
```

Keep a profile short. It records choices that differ from the defaults or that the team wants fixed, and nothing else.
