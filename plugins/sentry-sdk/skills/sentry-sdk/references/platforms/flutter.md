# Flutter and Dart

Package `sentry_flutter` (Flutter) or `sentry` (pure Dart). Docs live at `docs.sentry.io/platforms/dart/guides/flutter/` and `/platforms/dart/`. Versions below are a snapshot.

## Setup and errors

- Init with `SentryFlutter.init(..., appRunner: () => runApp(...))` or the currently documented wrapper, before `runApp` and the first log.
- Flutter framework errors (`FlutterError.onError`), uncaught async and zone errors, spawned isolates, Android native/NDK, iOS native, desktop, and web are separate layers. Preserve any existing `FlutterError.onError` delegation. Don't report manually and then also pass the error to the automatic handler.
- Capture handled Dart exceptions with their original `StackTrace`.
- Obfuscated builds (`--obfuscate --split-debug-info`) need symbol upload from the same build, which the `sentry_dart_plugin` handles.
- Keep widget trees, state objects, route arguments, form input, and platform-channel payloads out of context.

## Logs

`sentry_flutter` 9.0.0+, on by default from 9.28.0 (`options.enableLogs = true` before that). Use `Sentry.logger.info(...)`, `Sentry.logger.fmt` with `%s` placeholders, and typed `SentryAttribute.string/int/double/bool`. **No logging-package bridge is documented**, so ignore old `sentry_logging` claims unless the current page confirms them. Filter with `beforeSendLog`. Logs can be lost if a crash comes first.

## Metrics

Dart/Flutter 9.11.0+, no extra setup. Use count, gauge, and distribution with the signatures from the current page. `options.enableMetrics = false` disables them, and `options.beforeSendMetric` returns `null` to drop. No flush is documented.

## Crons

No Dart Crons guide is established.
