# JDK upgrades

## Contents

- Procedure
- 11 to 17
- 17 to 21
- 21 to 25
- Build tool and framework gates

## Procedure

1. Detect current and target. Read the compiler release/toolchain in the build files and CI. If the target is not stated, ask; do not assume one.
2. Run `./mvnw verify` or `./gradlew build` on the current JDK first and record the result. Do not upgrade on a red baseline.
3. Move one LTS step at a time (11, 17, 21, 25). Each step is its own commit: build first (compiler release, plugin and dependency versions), then fix warnings and removals, then run the full tests. Adopt new language features in a later, separate change.
4. Check each framework's minimum Java (Spring Boot, Quarkus, Hibernate, Lombok, Mockito, ByteBuddy, JaCoCo) before raising the target, and bump the ones that read class files.
5. Fetch the official guide for the target before editing: `https://docs.oracle.com/en/java/javase/<N>/migrate/getting-started.html` and the release notes. Prefer it over this file.
6. OpenRewrite can do mechanical steps (`org.openrewrite.java.migrate.UpgradeToJava21`); review the generated diff.
7. `jdeps --jdk-internals` and `jdeprscan --release <N>` find internal-API use and deprecated-for-removal calls.
8. Do not enable preview features unless the user opts in.

## 11 to 17

- Strong encapsulation (JEP 403): `--illegal-access` is gone. Reflection into `java.*` internals fails with `InaccessibleObjectException`. Fix by upgrading the library; use `--add-opens` only as a stopgap, listed in the build.
- Removed: Nashorn, the RMI activation system, the Applet API (deprecated). Java EE modules were already gone in 11.
- Seed code for new features: records, sealed classes, `instanceof` patterns, text blocks, switch expressions all arrive as standard by 17.
- Container and GC defaults changed; re-check heap flags and removed options. The JVM exits on an unrecognized `-XX` flag.

## 17 to 21

- Standard: pattern-matching `switch` and record patterns, virtual threads, sequenced collections (`getFirst`, `getLast`, `reversed()` on `List`, `Deque`, `LinkedHashSet`).
- Sequenced collections add methods to existing interfaces; custom implementations or a library that declares a conflicting `getFirst` may need changes.
- Dynamic agent loading now warns. Libraries that attach an agent at runtime (Mockito's inline mock maker, some profilers) print a warning; configure the agent at startup or add the flag the library documents.
- Finalization is deprecated for removal. `Thread.stop` and related methods throw. Security Manager is deprecated for removal, and permanently disabled in 24 (JEP 486).
- Default charset is UTF-8 from 18 (JEP 400). Code that relied on the platform charset can change behavior on Windows; pass charsets explicitly.
- Preview in 21 and not for production: string templates, unnamed patterns, structured concurrency, scoped values.

## 21 to 25

- 25 is the LTS. Standard by 25: scoped values (JEP 506), module import declarations, compact source files and instance `main`, flexible constructor bodies (statements before `super(...)`), compact object headers as an opt-in flag.
- Virtual threads no longer pin in `synchronized` (JEP 491, delivered in 24).
- Removed since 21: the Security Manager as an enforcement mechanism (24), the 32-bit x86 port (25). Check agents, tests and code that call `System.setSecurityManager`.
- Structured concurrency is still preview in 25 (fifth preview, JEP 505); keep it out of production code.
- Build tools: Gradle, Maven plugins and bytecode libraries must support class file version 69. A `Unsupported class file major version` error means a tool needs upgrading, not the code.

## Build tool and framework gates

- Maven: set `maven.compiler.release` (not `source`/`target`); update `maven-compiler-plugin`, `surefire`, `failsafe`, `jacoco` to current releases.
- Gradle: the Gradle version must run on the build JDK and support the target class file version. Set `java { toolchain { languageVersion = JavaLanguageVersion.of(N) } }`. Version rules are in the `gradle` skill.
- Spring Boot's own Java floor decides how far you can go; see the `spring-boot` skill for the Boot line.
- Update CI images and Dockerfile base images in the same change.

## Verification per step

- `mvn verify` or `gradle build` passes with no new warnings.
- `java -version` in the runtime image matches the target.
- Start the application and exercise one real path; startup flag errors only show at launch.
- Removals handled: search for each removed API listed above.
