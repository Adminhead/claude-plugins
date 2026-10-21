# Plugins, phases, profiles and annotation processors

Read when changing plugin versions or executions, lifecycle bindings, profiles, the compiler release, or annotation processing.

## Pinning

- Pin every plugin version in the parent's `<pluginManagement>`. Children then reference the plugin without a version.
- A plugin without a version gives a warning and resolves to whatever the Maven version defaults to, which changes between Maven releases.
- Check the current plugin release on Maven Central before pinning; do not copy a version from an old pom or a blog post.

## Phases and executions

- A goal runs when its execution is bound to a phase. `<phase>` on an `<execution>` picks the phase; otherwise the goal's default binding applies.
- The default lifecycle order is `validate`, `compile`, `test`, `package`, `verify`, `install`, `deploy`. Running `test` does not run `package`.
- Keep the project's existing binding. Moving an execution to another phase changes what CI runs.
- `failsafe` integration tests run in `integration-test` and are checked in `verify`; `surefire` runs in `test`. Do not put integration tests under surefire.

## Compiler

- Use `maven.compiler.release` (for example, 17 or 21) rather than `source` and `target`; `release` also checks the API.
- The build JDK and the release must agree. A release newer than the JDK fails with an "invalid target release" or "release version not supported" message.

## Annotation processors

- Declare processors explicitly in the compiler plugin:

```xml
<plugin>
  <groupId>org.apache.maven.plugins</groupId>
  <artifactId>maven-compiler-plugin</artifactId>
  <configuration>
    <annotationProcessorPaths>
      <path>
        <groupId>org.projectlombok</groupId>
        <artifactId>lombok</artifactId>
        <version>${lombok.version}</version>
      </path>
    </annotationProcessorPaths>
  </configuration>
</plugin>
```

- Symptoms of a missing processor: "package does not exist" or "cannot find symbol" for generated classes, which compile in the IDE but not with `mvn`.
- Processors on the classpath are not discovered by default on JDK 23 and later, so list them. Ask before adding `-proc` or compiler arguments that change behaviour for every module.

## Profiles

- Activate with `-P <id>`, by a property (`-Dfoo`), by JDK range, or by `activeByDefault`.
- Check which profiles are active with `mvn help:active-profiles`, then read the profile in the pom before blaming it.
- Profiles in `settings.xml` apply to every build on that machine. Do not use them to hold project settings; put those in the pom.

## Maven 4

- Maven 4.0.0-rc-7 is the newest Maven 4 release on Maven Central as of 2026-10-20, with no GA. Do not change `<modelVersion>` or rely on Maven 4 behaviour unless the project already builds with Maven 4 and the user asks.
