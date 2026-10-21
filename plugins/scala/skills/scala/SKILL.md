---
name: scala
description: Writes, reviews, debugs and tests Scala 3 and 2.13 code (case classes, enums and ADTs, given/using and implicits, type class instances such as Ordering, extension methods, pattern matching, Option/Either/Try, Futures, Cats Effect or ZIO code, MUnit FunSuite and ScalaTest suites, ScalaCheck, scalafmt, scalafix). Use whenever writing or debugging *.scala or *.sc code, including writing a MUnit or ScalaTest suite for a Scala object, and for a compile error such as "No given instance of type", "cannot find an ordering" or "could not find implicit value" (a missing type class instance, for example sorting a case class). Also for a Future or Await deadlock, a non-exhaustive match warning, a Scala 2 to 3 migration, or setting up the Metals language server.
---

# Scala

Match the project's Scala, syntax and libraries, and keep its observable behavior unless the request changes it.

Not for: sbt builds, tasks, dependencies and cross-building (`sbt`), the Play Framework (`play-framework`), generic test strategy (`unit-testing`), or Maven and Gradle builds (`maven`, `gradle`).

## Orient: follow the project's own style

Never impose a Scala flavor. Read these first, then write code that looks like its neighbors:

- `scalaVersion` in `build.sbt`, `project/*.scala`, `build.mill` or `scala-cli` directives. 2.13.x and 3.x differ in syntax and in what compiles.
- `scalacOptions`. `-no-indent` means braces only. `-Xsource:3` or `-Xsource:3-cross` on 2.13 means Scala 3 syntax is being phased in. `-source:future` or `-source:3.x` pins a dialect. `-Werror` or `-Xfatal-warnings` makes every warning an error.
- `.scalafmt.conf` (`runner.dialect`, `rewrite.scala3.*`, `maxColumn`) and `.scalafix.conf`. Run `scalafmt` before reporting done, never reformat untouched code.
- Syntax in sibling files: braces or indentation, `enum` or `sealed trait`, `given`/`using` or `implicit`, `import x.*` or `import x._`. The new `given X: T` and `[A: Ord as o]` forms need 3.6+; use the older forms on 3.0 to 3.5.
- The effect and test libraries already in `libraryDependencies` (Cats Effect, ZIO, `scala.concurrent.Future`; MUnit, ScalaTest, specs2).

Use an API only if the declared Scala version has it. Find symbols and callers with the Metals LSP tool when it is running (`references/metals.md`), or the codebase-memory tools, otherwise Grep. For third-party APIs check the version in the build (Context7, or the library's docs for that version).

## Language

- Model a closed set of cases as a sealed hierarchy: `enum` on Scala 3 (`derives` for typeclass instances), `sealed trait` plus case classes on 2.13 or when the code base uses it. Match exhaustively and treat a non-exhaustive warning as a bug. Keep constructors total: validate in a smart constructor or an opaque type, not with `require` scattered at use sites.
- Prefer immutable `case class`es, `val`, and the immutable collections. `copy` for updates. Avoid `var`, `null` and `return`.
- Return `Option` for absence, `Either[Error, A]` for expected failures with a typed error, `Try` only around code that throws. Never `.get` on `Option`/`Try`/`Either` outside a test. Chain with `map`/`flatMap`/`for`; use `fold` or a match to leave the container.
- Implicits and givens: scope them narrowly (companion of the type or the typeclass), one canonical instance per type, named when exported from a library. For "No given instance" and "could not find implicit" errors, read `references/scala3.md` (or `scala2-to-3.md`) before adding an import or an instance.
- Equality, `CanEqual` and strict equality are opt-in; enable them only if the build does.
- Futures: never `Await.result` inside a `map`/`flatMap` or on a request thread. Do not block the global `ExecutionContext`; run blocking calls on a dedicated pool (`blocking {}` is a hint, not a fix). Pass `ExecutionContext` as a context parameter, not `global` imported inside the method.
- Names: types `UpperCamel`, values and methods `lowerCamel`, no symbolic method names unless a DSL already uses them. Prefer a named method over a clever operator.

## Effects, tests and tooling

- Follow the effect system in the code (Cats Effect `IO`, ZIO, plain `Future`, or direct style). Never mix two in one module, and never run an effect (`unsafeRunSync`, `Runtime.unsafe`) outside `main`, a test, or an adapter. Read `references/effects.md` when touching effectful code. For ZIO-heavy repos, also suggest the `zio-skills` plugin from the ZIO project.
- Tests: use the framework already present. Read `references/testing.md` for MUnit, ScalaTest, ScalaCheck and effect-aware suites, and run one suite with the build tool (`sbt "testOnly *FooSpec"`; see `sbt`).
- Run `scalafmt` and, if configured, `scalafix` (`sbt scalafixAll`) after edits. Check compile output for warnings in the files you touched.

## Verify

1. Compile the changed module with the build tool, with the project's own `scalacOptions`, and fix every new warning in touched code.
2. Run the narrowest affected suite, then the module's tests.
3. If the Metals LSP is running, check diagnostics for the edited files instead of a full build while iterating.

## Gotchas

- A Scala 3 project can still use `implicit` and braces; do not "modernize" unrelated code in a bug fix.
- `import x.*` is Scala 3 (and 2.13 with `-Xsource:3`); `import x._` works on both. `?` as a wildcard type needs 3.x or `-Xsource:3`.
- A cross-built project (`crossScalaVersions`) must compile on every listed version: no Scala 3 only syntax in shared sources unless a source directory is split per version.
- Library macros and `derives` may not exist across 2.13 and 3 (circe, Quill, shapeless); check the dependency's Scala 3 support before suggesting a rewrite.
- Metals needs a successful build import first; if diagnostics are empty after a clean start, check `references/metals.md`.

## References

- `references/scala3.md`: enums, ADTs, `derives`, `given`/`using`, context bounds, extension methods, opaque and union types, `CanEqual`. Read when writing or debugging Scala 3 syntax or implicit resolution.
- `references/scala2-to-3.md`: implicit to given mapping, `-Xsource:3`, migration order and rewrites. Read for any 2.13 to 3 move or when a repo mixes both.
- `references/effects.md`: Cats Effect, ZIO and Future conventions and blocking. Read when touching effectful code.
- `references/testing.md`: MUnit, ScalaTest, ScalaCheck, effect tests, scalafmt and scalafix. Read when adding tests or formatting rules.
- `references/metals.md`: installing and running the Metals LSP this plugin configures, prerequisites and troubleshooting. Read when the LSP tool is missing or silent.
