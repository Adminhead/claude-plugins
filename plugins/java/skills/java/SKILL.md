---
name: java
description: Writes, reviews and upgrades modern Java (17+) code (records, sealed types, pattern-matching switch, streams, Optional, exceptions, equals/hashCode, executors, CompletableFuture and virtual threads), JDK upgrades and javax to jakarta. Use for any work in *.java, "review this Java class", a MatchException from a sealed switch, a record whose List changes after construction, a thread-pool or interrupt bug, or moving a project to a newer JDK.
---

# Java

Keep the existing observable contract (public API, exception behavior, thread-safety guarantees) unless the request changes it.

Not for: Maven POM and dependency work (`maven`), Gradle builds (`gradle`), JUnit, Mockito and Testcontainers (`java-testing`), Spring Boot code (`spring-boot`), Play controllers (`play-framework`).

## Orient

- Find the language level before writing: `maven.compiler.release` or `<release>` in `pom.xml`, `java.toolchain.languageVersion` in `build.gradle*`, `.java-version` or `.sdkmanrc`, and the CI JDK. Use no API or syntax newer than that level, whatever JDK is installed.
- Use no preview features unless the build already enables them (`--enable-preview`).
- Read the class, its callers and its tests. With an indexed repo use `search_graph` and `trace_path`; otherwise Grep or the LSP.
- Follow the project's formatter, null-annotation library (JSpecify, Checker, JetBrains) and logging facade. Add none.

## Types and data

- A record is for immutable data. Its canonical constructor must copy mutable components: `this.items = List.copyOf(items);` (also rejects null elements). Arrays and `Date` need a clone in the constructor and the accessor. Validate in a compact constructor.
- Model closed variants as a `sealed interface` with `record` permits. Switch over it with no `default`, so adding a variant breaks compilation instead of throwing `MatchException` at runtime. A `default` branch on a sealed switch is a defect unless the type is open.
- Use record patterns to destructure and `when` guards for conditions. Put the more specific case before the general one, and handle `null` explicitly (`case null`) when input can be null.
- Text blocks for multi-line SQL, JSON and HTML. Pass values as parameters; never concatenate them into SQL or HTML.
- `var` only where the right side names the type. No raw types; do not suppress `unchecked` without a comment saying why it is safe.
- Override `equals` and `hashCode` together, from the same fields. Prefer a record. Never put a mutable field in a hash key.

## Optional, streams, collections

- `Optional` is a return type only. Never a field, parameter or collection element. No `get()` without a check; use `map`, `orElseThrow`, `ifPresentOrElse`.
- Return an empty collection, never `null`.
- `stream().toList()` returns an unmodifiable list; `Collectors.toList()` makes no promise. Use `Collectors.toCollection(ArrayList::new)` when the caller must mutate.
- Keep pipelines short and free of side effects. A plain loop beats a stream used for `forEach`, nested streams, or checked exceptions. Parallel streams only for measured CPU-bound work on large data.
- Remove while iterating with `removeIf`. Atomic map updates use `computeIfAbsent` or `merge`, not `containsKey` then `put`.
- Unmodifiable factories: `List.of`, `Set.of`, `Map.of`, `List.copyOf`. They reject null and `Set.of`/`Map.of` reject duplicates.

## Exceptions and resources

- Open every `AutoCloseable` in try-with-resources. Never close in `finally` by hand.
- Catch the narrowest type. No empty catch, no `catch (Throwable)`. Rethrow with the cause attached (`new XException("op failed", e)`), and log once at the boundary with the stack trace.
- Checked exceptions for conditions the caller can recover from, unchecked for programmer errors and domain failures. Do not leak checked exceptions through lambdas by wrapping them silently.
- `InterruptedException`: restore with `Thread.currentThread().interrupt()` or rethrow. Never swallow it.
- Javadoc on public API says what, preconditions, and thrown exceptions; no restating the signature. `@param`/`@return` only when they add information.

## Concurrency

- Prefer immutable data, then `java.util.concurrent`. Replace shared `HashMap` with `ConcurrentHashMap`, hand-rolled counters with `Atomic*` or `LongAdder`.
- Never create bare `new Thread` or an unbounded pool in a long-lived service. Every `ExecutorService` has an owner that calls `shutdown()` (then `awaitTermination`, then `shutdownNow()`), or is created in try-with-resources (an `ExecutorService` is `AutoCloseable` from Java 19).
- Virtual threads (Java 21+) suit blocking I/O with many tasks: `Executors.newVirtualThreadPerTaskExecutor()`. Never pool them, and limit concurrency with a `Semaphore`, not pool size. They give nothing for CPU-bound work.
- `CompletableFuture`: a failure nobody observes vanishes, so end every chain with `exceptionally`, `handle` or `whenComplete`, or return the future to someone who will. Pass an explicit executor to `*Async` methods for blocking work. Add `orTimeout`.
- Read [references/concurrency.md](references/concurrency.md) before adding a lock, executor, `CompletableFuture` chain or virtual-thread code, and when debugging a race, deadlock, pinning or shutdown hang.

Verified on 2026-10-20 (openjdk.org): JDK 25 is an LTS. Virtual threads no longer pin the carrier inside `synchronized` from JDK 24 (JEP 491); on 21 to 23, prefer `ReentrantLock` around blocking calls. `ScopedValue` is final in 25 (JEP 506); `StructuredTaskScope` is still preview there (JEP 505).

## Validate

- Compile at the project's release level with the build tool (`./mvnw -q compile`, `./gradlew compileJava`), then the narrowest test that proves the change.
- Run `-Xlint:all` or the repo's static analysis (SpotBugs, Error Prone, Checkstyle) when configured, and fix new warnings you introduced.
- For concurrency changes, run the test many times with more threads than cores. A race that passes once is unproven.

## References

- [references/review.md](references/review.md) when asked to review a class, diff or PR: severity-ordered checklist and output shape.
- [references/upgrade.md](references/upgrade.md) when raising the JDK level (11 to 17, 17 to 21, 21 to 25): order of work, removals, per-step checks.
- [references/jakarta.md](references/jakarta.md) when the task is moving `javax.*` Jakarta EE packages to `jakarta.*`.
- [references/concurrency.md](references/concurrency.md) as described above.
