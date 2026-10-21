---
name: play-framework
description: 'Builds, debugs, tests and upgrades Play Framework 2.9/3.x web apps in Java or Scala. Use for conf/routes and reverse routes, app/controllers (play.mvc, CompletionStage, Action.async), Twirl templates, Guice DI, play-json or Jackson, WSClient, evolutions, CSRF and AllowedHosts filters, sbt stage/dist packaging, blocking JDBC stalling a Play server, a "not found: value controllers" routes error, and the Play 2.8/2.9 to 3.0 upgrade (Akka to Pekko, com.typesafe.play to org.playframework).'
---

# Play Framework

Verified on 2026-10-20 against playframework.com. Follow the app's existing API (Java or Scala), DI style and Play line; don't convert between them unless asked.

Not for: plain Java (`java`), plain Scala (`scala`), sbt mechanics such as scopes, cross-building and dependency conflicts (`sbt`), Spring (`spring-boot`).

## Detect the line first

Read `project/plugins.sbt`, `project/build.properties` and `build.sbt` before suggesting anything.

| Line | sbt plugin | Runtime | Java | Scala |
| --- | --- | --- | --- | --- |
| 2.8 | `com.typesafe.play` `sbt-plugin` 2.8.x | Akka | 8+ | 2.12, 2.13 |
| 2.9 | `com.typesafe.play` `sbt-plugin` 2.9.x (last on this groupId) | Akka | 11+ | 2.13, 3.3 |
| 3.0 | `org.playframework` `sbt-plugin` 3.0.x | Apache Pekko | 11, 17 or 21 (docs: 11 is going away; prefer 17+) | 2.13, 3.3 |

- sbt is the only supported build tool; the docs name no official Gradle or Maven plugin. For a Gradle or Maven repo with Play dependencies, treat the build as unsupported and say so.
- Java vs Scala: `enablePlugins(PlayJava)` or `PlayScala`, and `app/` holds `.java` or `.scala` controllers.
- 3.1 is still in milestones (3.1.0-M9 at last check). Don't target it unless the build already does. It moves to Guice 7, which drops `javax.inject`.
- Play 3.0 docs and examples still use `javax.inject.Inject` (Guice 6 also accepts `jakarta.inject`). Match what the existing code imports, and don't mix both in one class.

## Core model

- `conf/routes`: one line per route, `GET /clients/:id controllers.ClientController.show(id: Long)`. The compiler generates reverse routes (`routes.ClientController.show(id)`); use them in templates and redirects instead of string URLs. A Java action that takes `Http.Request` declares it in the route as well: `controllers.ClientController.show(request: Request, id: Long)`. Routes compile with the app, so a routes error shows as a compile error.
- Controllers are DI-managed classes with an `@Inject` constructor, not objects or statics. Java extends `play.mvc.Controller`; Scala extends `BaseController` (or `AbstractController` with `ControllerComponents`).
- Never block a request thread. JDBC, blocking HTTP clients and file I/O run on a dedicated dispatcher, not the default one and not `ForkJoinPool.commonPool` (see the api references).
- Java actions return `Result` or `CompletionStage<Result>`; Scala actions use `Action { ... }` or `Action.async { ... }` returning `Future[Result]`.
- Config lives in `conf/application.conf` (HOCON). Environment values come in with `${?VAR}`; never commit secrets.
- `play.http.secret.key` must be set from the environment in production (`play.http.secret.key = ${?APPLICATION_SECRET}`). Don't ship `changeme`.
- Default filters include CSRF, security headers and AllowedHosts. Change them through `play.filters.*` config. Never remove CSRF to silence a 403; add the token (`@helper.CSRF.formField`) or call from a client that sends `Csrf-Token`.
- Dev mode (`sbt run`) reloads on request. If a change seems ignored, check the compile error in the browser or terminal before suspecting caching.

## Workflow

1. Detect the line and API as above.
2. Reproduce with the narrowest command: `sbt "testOnly controllers.ClientControllerTest"`, or `sbt run` plus `curl`. Don't run the whole suite first.
3. Find the owner: route, controller, service, or config. Start from `conf/routes`.
4. Make the change in the existing style. New blocking call: add or reuse a `CustomExecutionContext`.
5. Run the targeted test, then `sbt test`. `sbt compile` alone doesn't prove routes and templates render.

## Gotchas

- `not found: value controllers` in generated routes: the controller's package, a missing import in `routesImport`, or a compile error in the controller itself hides it. Fix the first real compile error.
- `CompletableFuture.supplyAsync(() -> db.query())` with no executor runs on the common pool and can stall the server under load. Always pass the custom executor.
- Java `CompletionStage` callbacks need the request or context in scope; use `thenApplyAsync(fn, executor)` and read request data before the async hop.
- Twirl templates are compiled to `views.html.<name>`; a stale `target/` after renaming gives phantom errors, so run `sbt clean compile` once.
- Evolutions: `1.sql` with `# --- !Ups` and `# --- !Downs`. Never edit an applied file; add the next number. `play.evolutions.autoApply` is for dev only.
- `sbt dist` builds a zip; `sbt stage` builds `target/universal/stage/bin/<app>` for containers. Both need `-Dplay.http.secret.key` or env at runtime.

## References

- [references/java-api.md](references/java-api.md) when writing or fixing Java controllers, actions, forms, JSON, WSClient or async code.
- [references/scala-api.md](references/scala-api.md) when writing or fixing Scala controllers, play-json, `Action.async`, or compile-time DI.
- [references/migration.md](references/migration.md) when upgrading 2.8 or 2.9 to 3.0, or any build still on `com.typesafe.play` or `akka`.
- [references/testing.md](references/testing.md) when adding or fixing controller, service or integration tests.
- [references/production.md](references/production.md) when packaging, configuring secrets and hosts, logging, evolutions or thread pools for a deployment.
