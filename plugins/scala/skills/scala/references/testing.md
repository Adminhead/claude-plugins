# Testing, formatting and linting Scala

Contents: pick the framework, MUnit, ScalaTest, ScalaCheck, effectful tests, running tests, scalafmt, scalafix.

## Use what the project has

Check `libraryDependencies` and existing `*Suite`/`*Spec` files. Do not add a second framework.

| Dependency | Style |
| --- | --- |
| `org.scalameta:munit` | `class FooSuite extends munit.FunSuite`, `assertEquals(obtained, expected)` |
| `org.scalatest` | pick the existing style: `AnyFunSuite`, `AnyFlatSpec`, `AnyWordSpec`, with `Matchers` |
| `org.scalacheck` / `munit-scalacheck` | property tests; `forAll` |
| `typelevel:munit-cats-effect` | `CatsEffectSuite`; tests return `IO` |
| `dev.zio:zio-test` | `ZIOSpecDefault` |

## MUnit

- `assertEquals` compares with a diff and checks types by default; compare like types, or pass an explicit `Compare`.
- `test("name") { ... }`, `test("name".ignore)`, `.only`, `.fail`, `.flaky` (opt-in via `MUNIT_FLAKY_OK`).
- Fixtures: `FunFixture` for per-test, `Fixture` via `munitFixtures` for per-suite.
- A test returning a `Future` is awaited automatically.

## ScalaTest

- Keep the style the project uses. `Matchers` (`x shouldBe y`) read well; avoid `===` unless the project uses `TypeCheckedTripleEquals`.
- Async specs (`AsyncFunSuite`) run on a serial execution context; do not `Await` inside them.

## ScalaCheck

- Write properties about laws or round trips (decode(encode(x)) == x), not examples. Write an `Arbitrary` or `Gen` in one place; shrink with the defaults.
- Fix a failing seed from the output (`--initial-seed`) while debugging, then drop it.

## Effectful tests

- `IO`-returning tests with `munit-cats-effect` (`CatsEffectSuite`), time with `TestControl` from `cats-effect-testkit`. Never `unsafeRunSync` inside a test that the framework can run for you.
- ZIO tests use `TestClock`, `TestRandom` and `provide` with test layers.
- Avoid `Thread.sleep`. Inject a clock or use the test runtime's time control.

## Running one test

Use the build tool (see `sbt`): `sbt "testOnly com.acme.FooSuite"`, `sbt "testOnly *FooSuite -- --tests=*name*"` for MUnit. Add `-- -z "substring"` for ScalaTest. If the build is Mill, `mill app.test.testOnly com.acme.FooSuite`.

## scalafmt

- `.scalafmt.conf` needs `version` and, for Scala 3, `runner.dialect = scala3` (or `scala213source3` on 2.13 with `-Xsource:3`). A missing dialect gives parse errors on valid code.
- Format changed files only (`scalafmt --mode diff` or `scalafmtOnly`), and never reformat untouched files in a bug fix. `rewrite.scala3.convertToNewSyntax` and `removeOptionalBraces` change syntax: do not enable them unprompted.

## scalafix

- Rules live in `.scalafix.conf`. `sbt scalafixAll` needs SemanticDB (`semanticdbEnabled`) and, on 2.13, `-Wunused` flags for `RemoveUnused`.
- Use `sbt "scalafixAll --check"` in CI-style verification. Migration rewrites such as `Scala3Migrate` or `ExplicitResultTypes` are run once, in their own commit.
