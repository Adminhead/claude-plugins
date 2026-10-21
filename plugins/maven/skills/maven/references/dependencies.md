# Dependencies

Read when managing versions, importing a BOM, or resolving a conflict.

## Where versions live

- Parent `<dependencyManagement>` holds every version. Children declare `groupId` and `artifactId` only, so a version bump happens in one place.
- Import a BOM inside `<dependencyManagement>`:

```xml
<dependencyManagement>
  <dependencies>
    <dependency>
      <groupId>com.fasterxml.jackson</groupId>
      <artifactId>jackson-bom</artifactId>
      <version>${jackson.version}</version>
      <type>pom</type>
      <scope>import</scope>
    </dependency>
  </dependencies>
</dependencyManagement>
```

- `import` only works in `<dependencyManagement>`. A BOM listed under `<dependencies>` is treated as a normal jar and does nothing useful.
- Precedence: a `<dependencyManagement>` entry written in the pom wins over every imported BOM. Between imports, the first one declared wins. If a BOM's version seems ignored, check for a local entry and the import order.

## Conflict resolution

- Nearest wins: the version reached by the shortest path in the tree is chosen. Ties go to the first declaration.
- `dependencyManagement` overrides both. Pinning a version there is the normal fix.
- Diagnose:
  - `mvn dependency:tree -Dverbose -Dincludes=com.fasterxml.jackson.core:jackson-databind`
  - `-Dincludes` takes a comma-separated list of `groupId:artifactId` patterns.
  - `(omitted for conflict with X)` marks the losing version; `(omitted for duplicate)` is harmless.
- Two versions of one library on the runtime classpath is the common cause of `NoSuchMethodError`, `NoClassDefFoundError` and `AbstractMethodError`. Find which modules bring each version, then manage the library once.
- Keep families aligned. Jackson's `databind`, `core` and `annotations` must match; importing `jackson-bom` does this. Same for `slf4j-api` and its bindings, and for Netty or gRPC families.

## Exclusions

Use `<exclusions>` only when one path must not bring a library, and the managed version is not enough:

```xml
<dependency>
  <groupId>com.example</groupId>
  <artifactId>some-library</artifactId>
  <version>1.0</version>
  <exclusions>
    <exclusion>
      <groupId>commons-logging</groupId>
      <artifactId>commons-logging</artifactId>
    </exclusion>
  </exclusions>
</dependency>
```

An exclusion breaks silently when the upstream library later needs the excluded jar, so note it in a comment with the reason.

## Unused and undeclared

- `mvn dependency:analyze` lists "Used undeclared" (works only by transitive luck; declare it) and "Unused declared" (remove only after checking runtime-only, reflection and annotation-only use).
- Expect false positives for `provided`, test-scoped annotation libraries and service-loader jars.

## Convergence

The enforcer plugin's `dependencyConvergence` rule fails the build when a module's dependencies resolve to different versions. Add it to the parent's `maven-enforcer-plugin` execution only when the team wants that failure; otherwise it turns a quiet conflict into a broken CI job.

## Scope

- `provided`: supplied by the runtime container (servlet API, Play or Spring at deploy time). Do not package it.
- `runtime`: not compiled against, needed at run time (JDBC drivers).
- `test`: only on the test classpath. Test libraries must not leak into the main scope.
