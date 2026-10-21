---
name: sbt
description: Writes, edits and debugs sbt builds: build.sbt, project/*.sbt and project/build.properties, sbt 1 and sbt 2 command-line runs, slash keys such as Test/compile, dependency resolution and % or %% coordinates, eviction and version conflicts, cross-built Scala versions, multi-project builds and failing sbt tasks. Use when an sbt command errors with Expected whitespace character, Not a valid command or No such setting/task, when a test does not run or rerun under sbt, or when a build.sbt needs a dependency or cross-build change.
---

# sbt

Build and debug sbt projects on the version the project pins. Keep the published coordinates, test scope and task names unless the request changes them.

Not for: Scala language code (`scala`), Play applications (`play-framework`), Gradle or Maven builds (`gradle`, `maven`). Mill and Scala CLI builds are out of scope; mention them only to route.

## Orient

1. Read `project/build.properties`. `sbt.version` decides the rules: 1.x or 2.x. If the file is missing, say so and ask before assuming a version.
2. Read `build.sbt`, `project/*.sbt` and `project/*.scala` (the meta-build). Map the subprojects from `lazy val` declarations, `.aggregate(...)` and `.dependsOn(...)`.
3. Read `scalaVersion`, `crossScalaVersions` and `libraryDependencySchemes` before changing any dependency.
4. Reproduce with the narrowest task, such as `sbt "core/testOnly com.example.FooSuite"`, before editing.
5. Before changing a setting, find where it is defined with `inspect <key>`.

## Command line

Pick the form by the version. Verified on 2026-10-20 against scala-sbt.org; details and sources in `references/sbt2.md`.

- sbt 1: `sbt clean compile test` works.
- sbt 2: pass one quoted, `;`-separated string: `sbt "clean ; compile ; test"`. The bare form fails with `Expected whitespace character`.
- Both: slash syntax only, such as `Test/compile` and `core/Test/compile`. `test:compile` is rejected on sbt 2.
- sbt 2 `test` is incremental and cached. Use `testFull` for a full run and `testOnly <suite>` to force one suite.
- sbt 2 does not delegate scoped keys on the shell: `Compile/update` fails with `No such setting/task`. Use the key that is defined.
- Stop the sbt 2 server with `shutdown` after changing environment variables. `exit` only leaves the client.

## Build changes

- Write a setting in the scope it belongs to with slash syntax: `Test / fork := true`, `core / Compile / scalacOptions += "-deprecation"`.
- On sbt 2, bare settings in `build.sbt` apply as common settings to every subproject. Scope them when only one project needs them.
- Add plugins in `project/plugins.sbt` with `addSbtPlugin(...)`. Before adding a plugin to an sbt 2 build, check that it publishes an sbt 2 artifact.
- sbt 2 reloads automatically after a `build.sbt` or `project/` change. On sbt 1 run `reload` after editing those files.

## Dependencies

Read `references/dependencies.md` when adding, upgrading, excluding or resolving a library, or when `update` fails. Essentials:

- `%%` appends the binary Scala version (`_2.13`, `_3`); `%` does not; `%%%` covers Scala.js and Native.
- Diagnose conflicts with `evicted` and `dependencyTree`, not by reading the edited line.
- Don't disable checksums or insecure-protocol checks to get past a resolver error. Report it.

## Cross-building

Read `references/cross-build.md` when a build targets more than one Scala version. `++ <version>` switches the version for the commands after it, `+ <task>` runs the task once per entry in `crossScalaVersions`, and sbt 2 selects subprojects with `...@scalaBinaryVersion=3/test`.

## Validate

1. Run the narrowest command that reproduced the failure, before and after the change.
2. When shared settings change, run the whole build at the root: `sbt "clean ; test"` on sbt 1, `sbt testFull` on sbt 2 (its cache would skip green suites).
3. Check every CI command you touch: one quoted string on sbt 2.
4. Triage a failure with `references/troubleshooting.md` before changing the build.
5. Don't run `publish`, `publishSigned`, `release` or deploy tasks to verify a change. Ask first.

## Gotchas

- sbt 2 caches machine-wide. After `clean`, `compile` can finish in `0 s` with no `compiling` lines because the classfiles were restored. Check `find target/out -name '*.class'` before calling it a bug.
- A green test stays skipped after `clean` on sbt 2. Use `testFull`.
- The sbt 2 server keeps the environment it started with. A later `SBT_OPTS` does nothing until `shutdown`.
- `IntegrationTest` and `it:test` are removed on sbt 2. Move those tests to a subproject.
- sbt 2 puts output under `target/out/jvm/scala-<ver>/<subproject>/`. Update CI artifact paths to `target/out/**/test-reports/*.xml`.

## References

- `references/sbt2.md`: sbt 2 command-line reference (quoting, test family, query, caching, client and server, CI).
- `references/dependencies.md`: coordinates, eviction, scheme declarations and resolution failures.
- `references/cross-build.md`: `crossScalaVersions`, `++`, `+` and sbt 2 query.
- `references/troubleshooting.md`: symptom-to-cause table and escalation rules.

The sbt 2 command-line reference is adapted from sanssushi/skills (MIT; see LICENSE and NOTICE at the plugin root).
