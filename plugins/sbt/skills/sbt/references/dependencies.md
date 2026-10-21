# Dependencies in sbt

Read this file when adding, upgrading, excluding or resolving a library, or when `update` fails or two versions of one library end up on the classpath. Applies to sbt 1 and sbt 2 unless noted.

## Coordinates

```scala
libraryDependencies += "org.typelevel" %% "cats-core" % "2.13.0"   // appends the binary version: _2.13 or _3
libraryDependencies += "com.google.guava" % "guava" % "33.4.0-jre"  // Java library: no suffix
libraryDependencies += "org.scala-js" %%% "scalajs-dom" % "2.8.0"    // Scala.js or Scala Native: %%% appends the platform too
```

- Use `%%` for a Scala library and `%` for a Java-only one. A `%%` that resolves to a missing `_3` artifact usually means the library has no Scala 3 build for that line.
- Put a test-only dependency in `% Test`: `libraryDependencies += "org.scalameta" %% "munit" % "1.0.0" % Test`.
- Add exclusions on the dependency: `.exclude("commons-logging", "commons-logging")`.
- Version numbers in examples are placeholders. Check the current release before pasting one.

## Eviction and conflicts

- `evicted` lists the versions sbt dropped and why. Run it on the project that shows the wrong version: `sbt "core/evicted"`.
- `dependencyTree` prints the resolved graph. On sbt 1.4+ it is a built-in but opt-in plugin: add `addDependencyTreePlugin` to `project/plugins.sbt`, or the task is missing (the old `sbt-dependency-graph` plugin line is deprecated). The sbt 2 change summary says the `dependencyTree` tasks are unified into one input task but does not say whether the plugin line is still needed; run `dependencyTree`, and if sbt reports no such task, add the same line.
- Pin a version with `dependencyOverrides ++= Seq(...)` only when eviction cannot be fixed by upgrading the library that pulls in the old one.
- Declare the intended conflict policy with `libraryDependencySchemes`:

```scala
libraryDependencySchemes += "org.scala-lang.modules" %% "scala-xml" % VersionScheme.Always
```

`VersionScheme.Always` tells sbt that a version change within the same scheme is compatible. Use it only when the library's release notes say so; otherwise a real conflict is silently accepted.

## Resolution failures

- `update` failing with `unresolved dependency` usually means a missing resolver, a typo in the group or artifact, or a Scala binary suffix that does not exist. Check the coordinate first, then `resolvers`.
- Add a resolver only for an artifact that Maven Central does not host: `resolvers += "Name" at "https://repo.example.com/maven"`.
- Do not add `allowInsecureProtocol` or disable checksum checks to get past a failing resolution. Report it.

## Checking a change

After a dependency change, run `sbt "update"` for the affected project, then the narrowest test that uses the library. Confirm the resolved version with `evicted` or `dependencyTree` rather than trusting the edited line.
