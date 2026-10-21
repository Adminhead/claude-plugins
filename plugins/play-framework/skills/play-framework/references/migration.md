# Migrating to Play 3.0

Source: the Play 2.9 and 3.0 migration guides on playframework.com (checked 2026-10-20). Go one line at a time: 2.8 to 2.9 first, ship it, then 2.9 to 3.0. Migrate to Scala 3 only after Play 3.0 works.

## 2.8 to 2.9

- Java 11 or newer (Java 8 dropped). Scala 2.13 or 3.3 (2.12 dropped). sbt 1.9 or newer.
- Stay on `com.typesafe.play` and Akka.
- Renames and deprecations: `HttpExecutionContext`/`HttpExecution` to `ClassLoaderExecutionContext`/`ClassLoaderExecution`; `MessagesApi.clearLang(result)` and `Results.clearingLang(result)` to `withoutLang(result)`; `TypedMap` `+`/`-` to `updated`/`removed`; replace the `coloredLevel` Logback converter with `%highlight(%-5level)`.
- JPA moves to Jakarta (`import jakarta.persistence.*;`). Guice 6 works with `javax.inject`, and `jakarta.inject` is allowed.

## 2.9 to 3.0

1. `project/plugins.sbt`:
   ```scala
   addSbtPlugin("org.playframework" % "sbt-plugin" % "3.0.x")   // use the exact 3.0 patch release
   ```
2. `build.sbt` and any other build file: `com.typesafe.play` becomes `org.playframework` for Play artifacts (`play-test`, `play-guice`, and so on). Also check the Twirl, play-json and scalatestplus-play coordinates on Maven Central; they have their own 3.0-compatible releases.
3. Akka artifacts: `play-akka-http-server` becomes `play-pekko-http-server`, `play-akka-http2-support` becomes `play-pekko-http2-support`. Direct `com.typesafe.akka` dependencies become `org.apache.pekko` ones with Pekko versions (a fork of Akka 2.6, so code written for 2.6 ports directly).
4. Source: `akka.*` imports become `org.apache.pekko.*` (for example `org.apache.pekko.actor.ActorSystem`). `AkkaGuiceSupport` becomes `PekkoGuiceSupport`, and Akka-named helper methods get Pekko names (for example `convertRequestHeadersPekko`).
5. `conf/application.conf`: rename every `akka` block to `pekko`: `akka {}`, `akka.actor`, `akka.serialization`, `akka.coordinated-shutdown`, `akka.remote`, `play.akka` to `play.pekko`, `play.akka.dev-mode` to `play.pekko.dev-mode`, `promise.akka.actor` to `promise.pekko.actor`. Class names inside values change too:
   ```hocon
   pekko.loggers = ["org.apache.pekko.event.slf4j.Slf4jLogger"]
   pekko.logging-filter = "org.apache.pekko.event.slf4j.Slf4jLoggingFilter"
   play.server.provider = "play.core.server.PekkoHttpServerProvider"
   play.server.pekko.server-header = "PekkoHTTP Server"
   ```
6. `conf/logback.xml`: `<logger name="org.apache.pekko" level="WARN"/>` replaces the `akka` logger.
7. Rename `akka`-named folders and files if you want consistency, then search the project case-insensitively for `akka`. A clean migration has no matches.
8. Java: 11, 17 or 21 are supported; the docs say 11 will be dropped, so prefer 17+.

## Check

- `sbt clean update` resolves with no `com.typesafe.play` or `com.typesafe.akka` in `sbt dependencyTree`, except third-party libraries that still depend on Akka (they bring Akka transitively; report them, don't fake a fix).
- `sbt test` and one `sbt run` request.
- `grep -ril akka .` over `build.sbt`, `project/`, `conf/`, `app/`, `test/` returns nothing relevant.

## Play 3.1 (not GA at last check)

3.1 moves to Guice 7, which drops `javax.inject`. When a project targets a 3.1 milestone, switch to `jakarta.inject` in the same change and recheck the Java and Scala matrix on playframework.com.
