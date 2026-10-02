# Apple platforms (iOS, macOS, tvOS, watchOS)

Package `sentry-cocoa`. Docs live at `docs.sentry.io/platforms/apple/` (iOS guide: `/apple/guides/ios/`). Versions below are a snapshot.

## Setup and errors

- `SentrySDK.start` goes at the documented app-lifecycle point, before the faults you care about.
- The native crash handler owns uncaught fatal faults, so preserve prior handlers and OS termination. Capture manually only a handled `Error` or `NSException` that won't reach it. Preserve underlying Swift errors and don't stringify them.
- Crash reports send on the **next launch**. Watchdog termination, OOM or jetsam, force-quit, and background suspension each have different visibility limits, so never promise capture.
- Symbolicated frames need matching dSYMs uploaded from the shipping build.
- Keep view contents, screenshots, URLs, advertising IDs, contacts, and user-entered text out of context.

## Logs

Use direct `SentrySDK.logger` after init. No third-party logging adapter is documented. A crash can happen before logs send.

## Metrics

Cocoa 9.12.0+ (experimental from 9.4.0), on by default, **Swift only**, since Objective-C isn't supported. Use `SentrySDK.metrics.count / gauge / distribution` and take the exact signatures and `SentryUnit` from the page. `options.enableMetrics = false` disables them. `beforeSendMetric` returns `nil` to drop, and the metric exposes `traceId`. `SentrySDK.metrics.flush` blocks until pending data sends or it times out.

## Crons

No Apple Crons guide is established.
