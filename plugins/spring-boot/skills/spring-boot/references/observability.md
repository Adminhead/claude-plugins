# Observability and runtime

## Actuator

- Add `spring-boot-starter-actuator`. By default only `health` is exposed over HTTP; widen deliberately with `management.endpoints.web.exposure.include=health,info,metrics,prometheus`.
- Put management on its own port with `management.server.port` when the app is public, and keep that port off the ingress.
- `/actuator/conditions` and `/actuator/beans` explain auto-configuration and wiring; `/actuator/configprops` and `/actuator/env` show bound values (values are sanitized by default; keep `management.endpoint.env.show-values` at `NEVER` or `WHEN_AUTHORIZED`).
- Health groups: liveness and readiness probes (`/actuator/health/liveness`, `/actuator/health/readiness`) are enabled by default in Boot 4 and on Kubernetes in Boot 3. Do not put a database check in liveness; a database outage should fail readiness, not restart the pod.
- Custom checks implement `HealthIndicator`; keep them fast and non-blocking.

## Metrics and tracing

- Micrometer is the facade. Add the registry for your backend (`micrometer-registry-prometheus`, or OTLP). In Boot 4 the pieces are separate modules (`spring-boot-micrometer-metrics`, `-tracing`, `spring-boot-opentelemetry`); the actuator starter pulls what it needs.
- Tag with low-cardinality values only (route template, not user id or full URL).
- Tracing: Micrometer Tracing with an OpenTelemetry or Brave bridge; set `management.tracing.sampling.probability` (default 0.1).
- Custom timers and counters via an injected `MeterRegistry`; use `@Observed` with an `ObservedAspect` bean for method-level observations.

## Logging

- SLF4J with parameterized messages: `log.info("order created id={}", id)`. Pass the exception as the last argument to keep the stack trace.
- Structured logging is built in from Boot 3.4: `logging.structured.format.console=ecs` (or `logstash`, `gelf`).
- Correlate with the trace id in the MDC; do not log request bodies or credentials.
- Change levels at runtime through the `loggers` endpoint, secured.

## Virtual threads, pools, graceful shutdown

- `spring.threads.virtual.enabled=true` (Java 21+) runs Tomcat/Jetty request handling, `@Async` and `@Scheduled` on virtual threads. Connection pools still bound concurrency; size HikariCP (`spring.datasource.hikari.maximum-pool-size`) to the database, not to the thread count.
- Enable `server.shutdown=graceful` with `spring.lifecycle.timeout-per-shutdown-phase` so in-flight requests finish before the pod stops.
- `@Scheduled` jobs run on a single thread by default; set `spring.task.scheduling.pool.size` or use virtual threads, and make jobs idempotent. With several instances use a lock (ShedLock or a database lease).

## Boot 4 notes

- Health, metrics, tracing and OpenTelemetry moved into their own modules; most applications get them through the starters.
- Devtools LiveReload is off by default in Boot 4 and deprecated in 4.1.
