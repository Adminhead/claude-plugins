# Java interop

Read when Kotlin and Java call each other, or when a Java type's nullability is unknown.

## Java called from Kotlin

- A Java type with no nullability annotation is a platform type (`String!`); the compiler defers the null check to runtime. Declare the type at the boundary: `val name: String = obj.name` when provably non-null, `String?` otherwise. Annotations (`@Nullable`, `@NonNull`, JSpecify) are honoured by the compiler.
- Overloads that take different SAM interfaces make a trailing lambda ambiguous. Use an explicit constructor: `executor.submit(Runnable { work() })`.
- Java identifiers that are Kotlin keywords (`when`, `in`, `is`, `object`) need backticks, or a rename when the API is internal.
- Java getters and setters read as properties (`obj.name`), except boolean `isX`/`getX` pairs with mismatched types.
- Raw and wildcard types: `? extends T` is `out T`, `? super T` is `in T`, raw `List` needs an explicit argument; infer the most specific type instead of defaulting to `Any?`.
- Java arrays: `int[]` is `IntArray`, `String[]` is `Array<String>`, `String...` is `vararg`. Do not use `Array<Int>` for primitives.

## Kotlin called from Java

| Need | Use |
|---|---|
| Static call `Config.getInstance()` instead of `Config.Companion.getInstance()` | `@JvmStatic` in a companion or object |
| Constant or field access without a getter | `const val` for primitives and String; `@JvmField` otherwise |
| Overloads for default parameters | `@JvmOverloads` |
| Java `catch (IOException e)` compiles | `@Throws(IOException::class)` on the Kotlin function |
| Top-level functions under a readable class name | `@file:JvmName("StringUtils")` |
| Value class parameters | Names are mangled; add `@JvmName` for a stable Java signature |
| Frameworks that need `open` classes or no-arg constructors | The `all-open` and `no-arg` plugins (`plugin.spring`, `plugin.jpa`) |

Keep these annotations only while Java still calls the code; remove them once callers are Kotlin.

## Annotation targets

Java annotations on a Kotlin constructor `val` go to the parameter by default. Choose the target explicitly when the framework reads a field or getter: `@field:Column`, `@get:JsonProperty`, `@param:Inject`, `@set:`. A Bean Validation annotation that is silently ignored is usually on the wrong target (`@field:NotBlank`, `@get:NotBlank`).

## Other conversions

- `static` method: top-level function if it needs no class state, otherwise a companion object function.
- `synchronized (lock) { }` is `synchronized(lock) { }`; a synchronized method gets `@Synchronized`.
- try-with-resources is `.use { }`; anonymous classes with several methods are `object : Type { }`; `instanceof` is `is` with a smart cast.
