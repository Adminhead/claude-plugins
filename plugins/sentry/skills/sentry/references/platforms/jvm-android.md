# Android, JVM Java/Kotlin, Kotlin Multiplatform

Docs live at `docs.sentry.io/platforms/android/`, `/platforms/java/`, and `/platforms/kotlin/guides/kotlin-multiplatform/`. Versions below are a snapshot. Don't infer Android behavior from JVM Java or the reverse, and a Flutter or React Native app uses its own file.

## Android setup

- Inspect the Gradle modules, the Application class, the Sentry Gradle plugin, R8/ProGuard, NDK code, and CI artifacts.
- Init once at the earliest documented point, which is manifest auto-init or `SentryAndroid.init` in `Application.onCreate`.
- Java/Kotlin exceptions, ANRs, and NDK native crashes are separate layers with different filtering, scope sync, and persistence. Let the uncaught and native handlers own real crashes. Capture manually only an unexpected handled `Throwable`.
- R8 mappings and NDK symbols must come from the shipping build. The Gradle plugin uploads them using the auth token from CI.
- Native crashes usually send on the **next launch**. Process kills, OOM, and force-stop may never be seen.
- Keep Intent extras, Bundle dumps, view text, and screenshots out of context.

## JVM Java / Kotlin setup and errors

- Framework integrations (Spring Boot starter, servlet, Logback/Log4j2 appenders) own unhandled exceptions. Check the Spring Boot generation and the `javax` vs `jakarta` namespace.
- Capture the original `Throwable` and preserve `cause` and suppressed exceptions. Avoid manual capture plus rethrow into filters, controller advice, or global handlers.
- Keep request context thread- or coroutine-local, because pooled threads leak global state.
- Short-lived JVMs and abrupt `halt` can lose events.
- SLF4J alone doesn't tell you the backend. Check whether Logback or Log4j2 is active at runtime.

## Logs

| Runtime / path | Status |
|---|---|
| Android direct `Sentry.logger()` | `sentry-android` 8.12.0+. Enable with `options.logs.enabled = true` (or manifest metadata) |
| Android Timber (`sentry-android-timber`) | 8.17.0+. The Gradle plugin may auto-install it. `minLogsLevel` is separate from `minBreadcrumbLevel` and `minEventLevel` |
| Android Logcat | 8.17.0+, via Gradle-plugin bytecode instrumentation. `minLevel` gates it, and it can include bundled libraries' calls, so start restrictive |
| Java direct | 8.12.0+, `logs.enabled`, `Sentry.logger()`, `SentryLogParameters` / `SentryAttributes` |
| Logback | 8.15.0+. Set the appender's Logs threshold. MDC needs `contextTags` (allowlist only) |
| Log4j2, JUL | 8.16.0+. Enable Logs, then set appender or handler `minimumLevel` |
| Spring Boot + Logback / Log4j2 | Dedicated pages. The starter auto-configures the appender |
| Kotlin Multiplatform | Direct `Sentry.logger` only. No Timber or Logcat |

Appender breadcrumbs and events are not Logs. Filter with the Logs `beforeSend`. Android warns that buffered logs are lost if the app crashes first.

## Metrics and Crons

No current runtime-specific Application Metrics page is established for Android, Java, or KMP, so find one before implementing. Crons: Java has `captureCheckIn` per the SDK conventions (UNCONFIRMED here). Read `docs.sentry.io/platforms/java/crons/` before use.
