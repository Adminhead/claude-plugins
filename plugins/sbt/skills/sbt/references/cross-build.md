# Cross-building Scala versions

Read this file when a build publishes or tests for more than one Scala version, or when a `++` or `+` command runs against the wrong version.

## Declaring versions

```scala
ThisBuild / scalaVersion := "3.3.8"

lazy val core = project.settings(
  crossScalaVersions := Seq("2.13.18", "3.3.8")
)
```

- `scalaVersion` is the default for the build or the subproject. `crossScalaVersions` lists the versions a cross task covers.
- Keep `scalaVersion` in the list. Dropping the default version from `crossScalaVersions` makes `+` skip the version you develop on.
- Set `crossScalaVersions` on the subproject that differs. Setting it in `ThisBuild` forces every subproject onto the same list.

## Switching and running

- `++ <version>` switches the Scala version for the commands after it: `sbt "++2.13.18 ; compile"`. Within one invocation the switch applies to the rest of that command line.
- `+ <task>` runs the task once per version in `crossScalaVersions`: `sbt "+ test"`. Expect the work to multiply by the list length.
- Check the active version with `scalaVersion` or `show scalaVersion`.

## sbt 2 query

On sbt 2 target versions through the query axis instead of a loop:

```bash
sbt "...@scalaBinaryVersion=3/test"   # every subproject built on Scala 3
sbt ".../test"                        # the whole aggregate
```

The official query form is `[query /] [Config /] [task /] key`. The `...` wildcard is deliberate: `*` would be glob-expanded by the shell. Quote every query.

## Pitfalls

- A `%%` dependency built against `_2.13` does not load on `_3` projects; use a version of the library that publishes the matching suffix, or split the subproject.
- Compiler flags differ by version. Put them in `scalacOptions` with `CrossVersion`-aware logic (`scalaBinaryVersion.value match { ... }`), not one flag list shared by all.
- A cross build can pass locally on the default version and fail in CI on the second one. Always run the cross command that CI uses before reporting a fix.
