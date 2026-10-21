---
name: maven
description: Edits and debugs Maven builds in pom.xml, .mvn and mvnw projects, including dependency management and BOM imports, NoSuchMethodError or duplicate jars from conflicting versions, multi-module reactor failures such as a sibling SNAPSHOT that won't resolve, plugin phases, annotation processors, settings.xml mirrors, and dependency audits before a release. Use when a pom.xml is being changed, a mvn or mvnw command fails, the user asks which module pulls in a library, or the user asks to check dependencies for updates or vulnerabilities.
---

# Maven

Keep the build's existing contract (published coordinates, plugin executions, profiles, and what the build produces) unless the request changes it. Use the project's wrapper and its own pom settings, not a globally installed Maven.

Not for: Gradle builds (`gradle`), sbt (`sbt`), plain JUnit or Mockito tests (`java-testing`), Spring context and slice tests (`spring-boot-testing`), or Java code review and language questions (`java`).

Verified on 2026-10-20: Maven 3.9.16 is the latest 3.x release on Maven Central. Maven 4.0.0-rc-7 is the newest Maven 4 build and has no GA, so use Maven 4 behaviour only when the project already runs it.

## Orient

1. Read the root `pom.xml` (`<modules>`, `<parent>`, `<properties>` such as `maven.compiler.release`), the failing module's pom, and `.mvn/wrapper/maven-wrapper.properties` for the Maven version.
2. Use `./mvnw` when it exists, otherwise `mvn`. Make claims about behaviour for the version the wrapper pins.
3. Before changing a pom, get the resolved model with `mvn help:effective-pom -Doutput=target/effective-pom.xml` and read the part you are changing.
4. Reproduce with the narrowest command, such as `mvn -pl <module> -am -Dtest=ClassName test`, and keep its output short by reading only the first `[ERROR]` block.
5. Never open or paste `~/.m2/settings.xml` (see Credentials below).

## Dependencies

- Declare each version once: in the parent's `<dependencyManagement>`, or by importing a BOM there with `<type>pom</type>` and `<scope>import</scope>`. Child modules list only `groupId` and `artifactId`.
- An explicit `<dependencyManagement>` entry beats an imported BOM. Among imports, the first one declared wins. Check this order when a BOM version seems to be ignored.
- Maven picks the nearest declaration in the tree, then the first declared. A managed version overrides transitive versions.
- Diagnose with `mvn dependency:tree -Dverbose -Dincludes=<groupId>:<artifactId>`. A line marked `(omitted for conflict with X)` lost the conflict. Two versions of one library on the classpath is the usual cause of `NoSuchMethodError` and `NoClassDefFoundError`.
- Fix by managing the version, not by excluding, unless one path must go. Keep families aligned: `jackson-databind`, `jackson-core` and `jackson-annotations` come from `jackson-bom`; SLF4J bindings come from one version.
- Run `mvn dependency:analyze` to find unused and undeclared dependencies, then verify each hit: runtime-only and annotation-only dependencies are false positives.
- Use the enforcer's `dependencyConvergence` rule only when the project wants conflicts to fail the build. See [references/dependencies.md](references/dependencies.md).

## Reactor

- Run from the root with `-pl <module> -am` so sibling modules build from the reactor. Running `-pl api install` alone resolves `core:1.4.0-SNAPSHOT` from a remote repository, which fails when it is not published. Add `-amd` to include modules that depend on a changed one.
- Resume a failed build with `-rf :<artifactId>` only when the earlier modules were built in this same change.
- A child's `<parent>` must match the parent's coordinates, and `relativePath` defaults to `../pom.xml`. A mismatch causes "Non-resolvable parent POM".
- Keep shared versions in one parent. Do not repeat a managed version in a child. See [references/reactor.md](references/reactor.md).

## Plugins and build config

- Pin every plugin version in the parent's `<pluginManagement>`. An unpinned plugin gives a warning and drifts with Maven updates.
- Bind executions to a lifecycle phase (`validate`, `compile`, `test`, `package`, `verify`, `install`, `deploy`) and keep the order that the project already uses.
- Annotation processors (Lombok, MapStruct) go in the compiler plugin's `<annotationProcessorPaths>`. On JDK 23 and later, javac does not discover processors on the classpath by default.
- Set `maven.compiler.release`, not separate `source` and `target`, unless the project already does.
- Profiles activate with `-P <id>`, a property or a JDK. Check `mvn help:active-profiles` before blaming one. See [references/plugins.md](references/plugins.md).

## Credentials and mirrors

- Mirrors, servers and proxies live in `~/.m2/settings.xml`. Refer to secrets by environment variable, as `<password>${env.REPO_TOKEN}</password>`, and never write a literal token into a pom or the repository.
- Never print or paste `settings.xml`, and do not run `help:effective-settings`, because it prints server passwords.
- Maven 3.8.1 and later block plain-HTTP repositories, so use `https` URLs for mirrors.
- A change to the mirror URL or to which credentials a build uses is a team decision; ask first.

## Errors

When a `mvn` run fails, read [references/errors.md](references/errors.md) and match the first `[ERROR]` line to its usual cause before editing anything.

## Audit

When asked to check dependencies, before a release, or after a security advisory, read [references/audit.md](references/audit.md). Report findings by severity and do not apply version updates until the user chooses which level to take.

## Validate

- After every pom change, run `mvn -pl <changed> -am validate`, then the narrowest `test` that proves the change.
- Run `mvn verify` before calling the change done when it touches packaging, plugins, profiles or the reactor.
- For a dependency change, compare `dependency:tree` before and after and state which versions moved.

## References

- [references/dependencies.md](references/dependencies.md) when managing versions, importing BOMs, or resolving a conflict.
- [references/reactor.md](references/reactor.md) when a multi-module build fails to resolve a sibling or a parent.
- [references/plugins.md](references/plugins.md) when changing plugins, phases, profiles, annotation processors or the compiler release.
- [references/errors.md](references/errors.md) when a `mvn` command fails.
- [references/audit.md](references/audit.md) when checking for outdated or vulnerable dependencies.

Adapted in part from [decebals/claude-code-java](https://github.com/decebals/claude-code-java) (`maven-dependency-audit`, MIT; see LICENSE and NOTICE at the plugin root).
