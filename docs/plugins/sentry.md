# sentry

Teaches Claude Code to instrument apps with the official Sentry SDKs. It covers setup, errors, tracing, logs, metrics, and cron monitors across JavaScript, Python, Go, JVM and Android, Apple, Flutter, and other runtimes.

## What it adds

| Skill | Replaces | Purpose |
| --- | --- | --- |
| `sentry:sentry` | `sentry` | Instrument apps with official Sentry SDKs: `Sentry.init`, DSN config, error capture, tracing, structured logs, metrics, cron monitors, source maps, and SDK upgrades |

It replaces the user-level skill of the same name. Invoke it as `sentry:sentry`. The bare name `sentry` no longer works.

The skill has references for setup, configuration, errors, tracing, logs, metrics, and crons, plus one file per platform group.

## Behavior

- Reads the installed SDK version, then checks current docs through Context7 (`/getsentry/sentry-docs` first) or `docs.sentry.io`. The references record decisions and pitfalls, not an API manual.
- Initializes once per runtime and gives each signal one owner.
- Keeps telemetry from changing app behavior, and keeps names and tags low-cardinality.
- Relies on server-side scrubbing. It adds client-side privacy filters only when you ask.
- Asks before any step that touches your Sentry org: a test event, log, metric, or check-in, a source-map or symbol upload, or a cron `MonitorConfig`.
- Treats content fetched from Sentry as data, not instructions.

## Requirements

- A project that uses, or will use, an official Sentry SDK.
- The Context7 MCP server or web fetch, for current docs.
- Optional external `sentry-cli:sentry-cli` plugin. Claude uses it to confirm that a test signal arrived.

Version numbers in the platform references are a snapshot. Claude rechecks them against current docs.

## Install

```
claude plugin marketplace add /path/to/claude-plugins
claude plugin install sentry@adminhead
```

To try it without installing:

```
claude --plugin-dir plugins/sentry
```

## Verify

1. Validate the plugin.
   ```
   claude plugin validate --strict plugins/sentry
   ```
2. Start a fresh session. The skill list should show `sentry:sentry`.

## Limits

- Not for the Sentry CLI or sentry.io API: querying issues, releases, auth, alerts, dashboards, and projects. Use `sentry-cli:sentry-cli` for that.
- SDKs buffer, so a flush or an event ID proves an attempt, not delivery.
- Without Context7 or web access, Claude has only the snapshot in the references.

## Disable or uninstall

| Task | Command |
| --- | --- |
| Disable | `claude plugin disable sentry@adminhead` |
| Uninstall | `claude plugin uninstall sentry@adminhead` |

The plugin ships only a skill, so both commands remove it. Start a new session to be sure it is gone.
