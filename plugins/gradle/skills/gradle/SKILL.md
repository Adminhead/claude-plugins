---
name: gradle
description: Diagnoses and writes Gradle build logic, including configuration cache failures, Could not resolve and no matching variant errors from conflicting versions or platforms, dependencyInsight, build cache misses, Kotlin DSL build scripts, libs.versions.toml version catalogs, convention plugins in build-logic, and toolchains. Use for symptoms such as "invocation of Task.project at execution time is unsupported", "Configuration cache problems found in this build", "Could not resolve" with a platform or BOM, "Unresolved reference: libs", or a request to add a task, dependency or convention plugin to build.gradle.kts or settings.gradle.kts.
---

# Gradle

Fix the cause the build reports and keep its observable outputs (task names, artifacts, dependency versions) unless the request changes them.

Not for: audits and "check my build" requests (`gradle-skills:gradle-best-practices`), wrapper upgrades (`gradle-skills:gradle-wrapper-upgrade`), Maven POMs (`maven`), and tests with no Gradle question (`java-testing`).

Verified on 2026-10-20 against docs.gradle.org: Gradle 9 runs on a JVM from 17 through 27, and the configuration cache is off by default in 9.x.

## Orient

1. Read `settings.gradle(.kts)`, the root build script, `gradle.properties`, `gradle/wrapper/gradle-wrapper.properties`, `gradle/libs.versions.toml` and any `build-logic/` included build.
2. Run `./gradlew`, never a system `gradle`, so the wrapper's version is the one in use. Add `--console=plain` when the output is read back.
3. Reproduce with the narrowest task path, such as `./gradlew :app:compileJava --stacktrace`. Note whether the failure happens in configuration, in a task action or in dependency resolution; the fix differs.
4. The JDK that runs Gradle is separate from the toolchain that compiles code. `java.toolchain` in a module picks the compiling and testing JDK; provisioning it needs auto-download or a local JDK, so check which one the build assumes.
5. Done when you can name the phase, the task or configuration, and the first line of the error.

## Authoring

1. Use Kotlin DSL (`.kts`) for new scripts. In a Groovy repo, match the existing language.
2. Put every version in `gradle/libs.versions.toml` and reference it as `libs.<alias>`. Alias segments split on dashes, so `my-lib` becomes `libs.my.lib`. Scripts contain no version literals.
3. Share configuration through convention plugins in `build-logic` (an included build), registered by id and applied per module. Do not configure plugins or tasks from `subprojects {}` or `allprojects {}`.
4. Register tasks with `tasks.register`, never `tasks.create`. Read values through providers (`providers.gradleProperty`, `providers.environmentVariable`) and capture them at configuration time, not inside a task action.
5. Declare `@Input`, `@InputFiles`, `@OutputDirectory` (or the `Property` equivalents) on custom task classes so up-to-date checks and the build cache work.
6. Done when `./gradlew help` configures without problems and the touched task runs.

## Diagnosis

1. Copy the first error and the task path. Match the symptom in [references/errors.md](references/errors.md).
2. For any configuration cache message, read [references/config-cache.md](references/config-cache.md). Its problem report is in `build/reports/configuration-cache/`.
3. For resolution failures, read [references/dependencies.md](references/dependencies.md) and run `./gradlew :<module>:dependencyInsight --configuration <name> --dependency <group:artifact>`.
4. For a task that reruns when it should not, or a cache miss, compare its declared inputs with what the action reads. Undeclared inputs cause both.
5. Done when the original command passes and, for cache problems, a second run reports the task as up to date or from cache.

Before any build with a scan, ask the user first: `--scan` uploads build data to a server. Run without it otherwise.

## Build structure

1. Declare every module once in `settings.gradle(.kts)` and name the root project. Give plugin versions in `pluginManagement` or the root's `plugins {}` with `apply false`, and apply them in the modules that use them.
2. Keep dependency declarations in the module that uses the type. A shared version belongs in the catalog; a shared set of dependencies belongs in a convention plugin.
3. Use `includeBuild("build-logic")` in `settings.gradle(.kts)` for convention plugins, and give each plugin an id under the repo's own namespace.
4. Choose between a `java-library` module (`api` and `implementation`) and an `application` module before adding dependencies. Check which the module already applies.
5. Done when every module still appears in `./gradlew projects` and the convention plugin applies to each one that needs it.

## Caching and performance

1. Turn on the build cache with `org.gradle.caching=true` in `gradle.properties` only if the team already uses it or asks. Remote cache credentials never go in the repo; read them from the environment or a user-level file.
2. A task is cacheable only when it declares `@CacheableTask` and its outputs are reproducible. Mark custom tasks that embed timestamps or absolute paths as not cacheable, or fix the inputs.
3. `--profile` writes an HTML report to `build/reports/profile/`. Read it before changing parallelism or memory settings. Do not raise `org.gradle.jvmargs` heap size as a first step.
4. Enable `org.gradle.parallel=true` only after checking that tasks in the build do not share mutable output directories.

## Gotchas

- `Task.project` at execution time is the most common configuration cache failure. A `doLast` or `doFirst` block that reads `project` fails only when the cache is on, so a build can pass without the cache and fail with it.
- Wrapping the read in `providers.provider { project.version }` does not fix it. The lambda runs when the action calls `.get()`, which is execution time. Read the value into a `val` inside the `register` block, outside the action.
- `implementation` keeps a dependency off consumers' compile classpaths; `api` leaks it. Choose by whether the type appears in the module's public signatures.
- `resolutionStrategy.force` overrides every path silently. Prefer a platform (BOM) or a constraint, and say why when you use force.
- A plugin version set in one module's script and used in another needs the `plugins {}` block to declare `apply false` at the root.
- Changing a build script does not always invalidate tasks that read nothing from it. When a task skips unexpectedly, check its inputs before clearing caches.
- `gradle.properties` values are read at configuration; a `-P` flag changes them only for that invocation.

## Old patterns

- `buildSrc/` still works. For new shared build logic, prefer an included build in `build-logic/`.
- `compile`, `testCompile` and `runtime` configurations were removed in Gradle 7; use `implementation`, `testImplementation` and `runtimeOnly`.
