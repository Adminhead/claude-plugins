# Production

## Packaging

- `sbt stage` creates `target/universal/stage/` with `bin/<app>`; use it in container images. `sbt dist` creates a zip under `target/universal/`. `sbt Docker/publishLocal` needs the Docker plugin settings in the build.
- Run: `bin/<app> -Dplay.http.secret.key="$APPLICATION_SECRET" -Dhttp.port=9000`. `-Dconfig.file=` or `-Dconfig.resource=` selects another config.
- Dev mode (`sbt run`) is never a production server.

## Secrets and hosts

- `play.http.secret.key = ${?APPLICATION_SECRET}` in `application.conf`. A missing key in production mode makes the app fail at start. That is the intended behavior; don't add a default.
- `play.filters.hosts.allowed = ["myapp.example.com", ".internal"]`. A leading dot allows subdomains. Behind a proxy, also set the proxy-forwarding config (`play.http.forwarded.trustedProxies`) so `request.remoteAddress` is correct.
- Rotating the secret invalidates sessions and CSRF tokens signed by the old one.

## Filters

Defaults come from `play.filters.enabled`. Prefer changing the settings (`play.filters.csrf`, `play.filters.headers`) over replacing the list. If you replace the list, append to the existing defaults with `+=` so CSRF, headers and hosts stay.

## Thread pools

- The default dispatcher serves request handling; keep it free of blocking calls.
- Put JDBC and other blocking code on a `CustomExecutionContext` (see the api references) sized to the DB pool. Set `play.db.prototype.hikaricp.maximumPoolSize` consistently with it.
- Symptoms of a blocked default pool: requests hang while CPU is low, and a thread dump shows request threads in socket reads or JDBC.

## Evolutions

- `conf/evolutions/<db>/<n>.sql` with `# --- !Ups` and `# --- !Downs`. Production: `play.evolutions.autoApply = false` and apply as a deploy step; `autoApplyDowns` stays false.
- Number files in order and never edit an applied one; a checksum mismatch fails startup.

## Logging

`conf/logback.xml` configures logging. Use `-Dlogger.file=` to override at runtime. On Play 3 logger names for the runtime are `org.apache.pekko` and `play`.

## Health

Expose a small route that checks the DB with a bounded timeout, and use it for container probes. Shut down gracefully: Play stops accepting requests on SIGTERM and honors `play.server.waitBeforeTermination` and the coordinated-shutdown timeouts (`pekko.coordinated-shutdown` on Play 3, `akka.coordinated-shutdown` on 2.x).
