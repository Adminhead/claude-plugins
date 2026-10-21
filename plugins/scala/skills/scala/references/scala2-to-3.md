# Scala 2.13 and the move to Scala 3

Contents: reading a mixed repo, implicit to given mapping, migration order, what to leave alone.

## 2.13 code that stays valid

Most 2.13 code compiles on Scala 3 unchanged. Do not rewrite working 2.13 code in a bug fix. On 2.13 you can adopt Scala 3 syntax gradually with `-Xsource:3` (and `-Xsource:3-cross` for the stricter cross-building mode); read the 2.13 release notes for the exact flag behavior of the project's version.

## Implicit to given mapping

| Scala 2.13 | Scala 3 |
| --- | --- |
| `implicit val ord: Ord[Int] = ...` | `given ord: Ord[Int] = ...` |
| `implicit def f[A](implicit o: Ord[A]): Ord[List[A]] = ...` | `given f[A](using o: Ord[A]): Ord[List[A]] = ...` |
| `def f(x: Int)(implicit ec: ExecutionContext)` | `def f(x: Int)(using ec: ExecutionContext)` |
| `implicitly[Ord[A]]` | `summon[Ord[A]]` |
| `implicit class RichString(s: String) { def shout = ... }` | `extension (s: String) def shout = ...` |
| `implicit def toX(a: A): X` (conversion) | `given Conversion[A, X] = ...`, needs `import scala.language.implicitConversions` at use sites |
| `import pkg._` (brings implicits) | `import pkg.*` plus `import pkg.given` |
| `sealed trait T; case object A extends T` | `enum T: case A` (optional) |
| `Foo[_]` wildcard type | `Foo[?]` |

Scala 3 still accepts `implicit` (deprecated in later releases with `-source:future`). Mixing `implicit` and `given` works across versions; a `given` is found by an `implicit` parameter and the reverse.

## Migration order

1. Upgrade dependencies to versions published for Scala 3 or `_2.13` artifacts that can be used with `CrossVersion.for3Use2_13` (check the build tool; see `sbt`). Macro-heavy libraries (shapeless, Quill, some JSON derivation) are the usual blockers.
2. Turn on `-Xsource:3` on 2.13 and fix the new warnings.
3. Switch `scalaVersion` and `scalacOptions` (`-Xsource:3` options are not valid on 3.x; `-source:3.x-migration` and `-rewrite` automate several conversions).
4. Fix what the compiler flags: implicit resolution changes, `_` wildcards, `import x._` implicit scope, procedure syntax, `do while`, auto-application of `()` methods, existential types.
5. Adopt `enum`, `given`, extensions and indentation only as separate, reviewable changes.

## Common breakages

- Implicit resolution differences: an implicit found through an import `_` in 2.13 needs `import x.given` in 3.
- Macros and compiler plugins written for 2.13 do not run on 3; replace them or keep a `2.13` source directory.
- Auto-tupling and numeric widening warnings, and stricter type inference with unions.
- Binary compatibility: Scala 3 and 2.13 can depend on each other's libraries only through `.cross(CrossVersion.for3Use2_13)` or `for2_13Use3` and never when a library exposes a macro or inline API.
