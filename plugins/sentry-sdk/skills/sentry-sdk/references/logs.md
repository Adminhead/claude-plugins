# Structured Logs

Sentry Logs are standalone, searchable records with attributes. They are separate from breadcrumbs and error events.

| Output | Purpose | Not the same as |
|---|---|---|
| Structured Log | Searchable record in Sentry Logs | Breadcrumb, error event, console line |
| Breadcrumb | Trail attached to a later event | Searchable Logs record |
| `captureException` / `captureMessage` | Error monitoring, stack, grouping | Log shipping |
| Console or library output | Local destination | A Sentry Log, unless a documented integration forwards it |

One bridge can produce all three at different thresholds, so configure and verify each separately. `logger.error` never replaces explicit exception capture.

## Choose one path

| Situation | Path |
|---|---|
| New logging or no supported library | Direct SDK logger (`Sentry.logger.*`, `sentry_sdk.logger.*`, `sentry.NewLogger(ctx)`) |
| An existing library that the **exact runtime's** Logs page names | That bridge, with its Logs threshold set separately from breadcrumb and event thresholds |
| A library documented only for another runtime (Pino for Next.js but not plain Node, Timber for Android but not KMP) | Direct logger |
| The integration sends only breadcrumbs or events (Go Zerolog, PHP Monolog `BreadcrumbHandler`, Logrus *event* hook) | Not a Logs bridge |
| Several routes could catch the same call | Keep one and turn off the overlap |

Bridge support is listed per platform in `platforms/`, and it changes, so recheck the runtime's current Logs page.

## Check before enabling

- The installed SDK meets the Logs version gate, and Logs are on. The default is on in newer SDKs and opt-in (`enableLogs`, `enable_logs`, `logs.enabled`) in older ones.
- Init runs before the first log.
- The library's own level lets records through before Sentry thresholds apply.
- Structured fields survive the bridge.
- Existing local destinations still work.

## Messages, attributes, levels

- Use stable message templates with the SDK's parameterization (`Sentry.logger.fmt`, `{placeholder}` in Python), not interpolated values.
- Use small primitive attributes (string, number, bool) in consistent `snake_case`. Array, nested, and null support varies by SDK, so check it.
- Keep cardinality bounded with values like operation, outcome, region, status code, and retry bucket. UUIDs, raw URLs, and exception strings are high-cardinality.
- Levels: `trace`/`debug` for diagnostics, `info` for milestones, `warn` for recoverable degradation, `error` for handled failures, `fatal` for loss of service. Filter verbose levels in production and bound hot loops.
- Scope attributes can flow into logs, so keep request and user data off global scope.
- Broad console or Logcat capture pulls in third-party and framework output. Start with a restrictive level.

## Lifecycle

Logs are buffered. Crashes, mobile suspension, serverless termination, and rate limits can lose them. Android, Flutter, and React Native docs warn explicitly about losing logs on crash. Go documents `defer sentry.Flush(2 * time.Second)`. Elsewhere, use only the documented flush or close.

## Verify

Emit one `info` record with a stable message such as `sentry_logs_validation`, a random correlation attribute, and a bounded `runtime` attribute. Query Sentry Logs (with the `sentry-mcp-self-hosted` MCP tools if enabled, or the Sentry UI) for a narrow time window. Check the level, template, attributes, origin, and that exactly one record arrived. For bridges, also check whether the same call produced an event or breadcrumb, because an event alone doesn't mean Logs work.

If nothing arrives, check these in order:

1. the active init and runtime
2. the version gate
3. the Logs enable switch
4. library and bridge thresholds
5. `beforeSendLog` or other filters
6. a duplicate or wrong client
7. attribute types and sizes
8. lifecycle termination
9. the query time range

Report "not observed" rather than "delivery failed" unless evidence shows the cause.
