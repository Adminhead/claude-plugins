---
type: llm
focus: trace
---
Judge only the edits the assistant made to the repository files. PASS only if all of these hold:

1. `conf/application.conf` has the `akka { ... }` block renamed to `pekko { ... }`, and its class names changed to `org.apache.pekko.event.slf4j...`.
2. The server provider is `play.core.server.PekkoHttpServerProvider` (not `AkkaHttpServerProvider`).
3. Scala imports in `app/` changed from `akka.actor` to `org.apache.pekko.actor`.
4. The direct `akka-actor-typed` dependency became an `org.apache.pekko` dependency.

FAIL otherwise. Do not reward length or explanation; judge the edits.
