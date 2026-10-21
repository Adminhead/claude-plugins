# Scala 3 syntax and contextual abstractions

Contents: enums and ADTs, derives, givens, using and context bounds, extensions, opaque and union types, equality, braces and indentation.

Follow the project's dialect. The SIP-64 forms below (`given ... :` with no `with`, `=>` conditions, `A: Ord as o`) need Scala 3.6+; on 3.0 to 3.5 write `given Ord[Int] with`, `given [A](using Ord[A]): Ord[List[A]] with` and `using` clauses. Every snippet works with braces too; both layouts below are equivalent.

## Enums and ADTs

```scala
enum Color:
  case Red, Green, Blue

enum Result[+E, +A]:
  case Failure(error: E)
  case Success(value: A)

enum HttpStatus(val code: Int):
  case Ok extends HttpStatus(200)
  case NotFound extends HttpStatus(404)
  def isClientError: Boolean = code >= 400 && code < 500
```

- An enum is a sealed ADT; cases without fields are singletons with `ordinal`, `values` and `valueOf`. Cases with fields are case classes in the enum's companion.
- A repo using `sealed trait` plus `case class`/`case object` is still correct Scala 3. Match it; migrate only when asked.
- Use a plain `final case class` when there is exactly one constructor.
- Match exhaustively. The compiler checks `enum` and sealed matches; add no `case _` that would hide a new case.

## derives

`derives` asks a typeclass's `derived` method (usually built on `scala.deriving.Mirror`) for an instance:

```scala
enum Tree derives CanEqual, Eq, Show:
  case Leaf(value: Int)
  case Node(left: Tree, right: Tree)
```

It desugars to `given Eq[Tree] = Eq.derived`. Only derive typeclasses the library supports for Scala 3 (Cats `Eq`/`Show`, circe `Codec`, and so on).

## Givens

```scala
trait Ord[T]:
  def compare(x: T, y: T): Int

given Ord[Int]:                                  // structural, anonymous
  def compare(x: Int, y: Int) = x.compare(y)

given intOrd: Ord[Int]:                          // named
  def compare(x: Int, y: Int) = x.compare(y)

given [A: Ord] => Ord[List[A]]:                  // conditional, context bound
  def compare(xs: List[A], ys: List[A]) = ???

given ExecutionContext = ExecutionContext.global // alias
```

Older equivalents (3.0 to 3.5): `given Ord[Int] with { ... }`, `given listOrd[A](using Ord[A]): Ord[List[A]] with { ... }`, `given ec: ExecutionContext = ...`.

- Name a given when a library exports it or when you must import it by name; anonymous is fine inside an application.
- Put instances in the companion of the type or of the typeclass so they are found without an import. A given defined elsewhere needs `import pkg.given` (a plain `import pkg.*` does not import givens in Scala 3).
- "No given instance of type X was found" means no instance in implicit scope. Check, in order: the exact type including type arguments, variance, a missing `import ...given`, the instance living in a companion that is not part of X's implicit scope, then ambiguity from two instances.
- Do not add a duplicate instance to silence the error; find why the existing one is not in scope. Use `-Xprint:typer` or the `summon[T]` trick in a scratch file to see what the compiler resolves.

## using clauses and context bounds

```scala
def sorted[A](xs: List[A])(using ord: Ord[A]): List[A] = ???
def max[A: Ord](x: A, y: A): A = ???             // evidence is anonymous
def maxNamed[A: Ord as ord](x: A, y: A): A = ord.compare(x, y) // 3.6+ naming
def both[A: {Ord, Show}](a: A): String = ???     // 3.6+; older: [A: Ord: Show]
```

- Use `summon[Ord[A]]` only where a name is awkward. Prefer a named `using` parameter or `as` binding.
- Order matters: `using` clauses come after ordinary parameter lists. Clause interleaving (`def f[A](a: A)[B](using ev: Ev[A, B])`) needs 3.6+.
- Explicit argument for a using clause: `f(xs)(using myOrd)`.

## Extension methods

```scala
extension (s: String)
  def shout: String = s.toUpperCase + "!"

extension [A](xs: List[A])
  def second: Option[A] = xs.drop(1).headOption
```

Put extensions in the companion of the extended type, or an `object` that callers import. Prefer them over implicit classes in Scala 3 code.

## Opaque types and union types

```scala
object Ids:
  opaque type UserId = Long
  object UserId:
    def apply(l: Long): UserId = l
    extension (id: UserId) def value: Long = id
```

An opaque type is its underlying type only inside its defining scope; outside it is distinct, with no runtime wrapper. Union types (`String | Int`) describe either; narrow them with a match. They are not a replacement for a sealed ADT when you need to attach behavior.

## Equality

Scala's `==` is universal by default. `-language:strictEquality` requires a `CanEqual[A, B]` for each comparison, usually `derives CanEqual`. Turn it on only if the build does, and then give new types `derives CanEqual` instead of importing `scala.language.strictEqualEquality`.

## Braces or indentation

Scala 3 accepts both; `-no-indent` forbids the indentation style, `-rewrite -indent` or `-rewrite -no-indent` converts. Keep every file consistent with its neighbors and the `.scalafmt.conf` setting. Optional braces end in a colon (`class A:`, `def f = xs.map: x =>`) and the `end` marker is allowed but optional.

## Other Scala 3 features worth knowing

- Top-level `def`/`val`/`type` need no wrapper object. Creator applications: `Point(1, 2)` without `new`.
- `import a.*` replaces `import a._`; wildcard type arguments are `List[?]`.
- Non-local `return` is gone. Use `scala.util.boundary` and `break`.
- `transparent inline` and macros are for library authors. Do not add them to application code.

Further reading: https://docs.scala-lang.org/scala3/reference/ and https://docs.scala-lang.org/sips/64.html.
