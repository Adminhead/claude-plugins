# API design: function owner, value classes, sealed results

Read before adding an extension, factory, top-level helper, value class or a public mapping over a sealed result.

## Where a function lives

Put behavior on the smallest accurate semantic owner. Extension syntax changes call shape, not ownership.

| Meaning | Prefer |
|---|---|
| Intrinsic behavior of a type the project owns | Member |
| Stateless operation across peers with no single owner | Top-level function |
| Construction or parsing | Factory on the target type (`UserId.parse(raw)`) or a named top-level function |
| Retained policy, state, I/O, clock, locale or dependencies | Injected collaborator |
| Type-native operation with clearer receiver syntax | Extension, only if every gate below passes |

Extensions on `String`, primitives, collections, `Flow` or any framework or third-party type must be: narrowly scoped (`private` or `internal`), valid for every receiver value, free of policy, state, I/O and dependencies, materially clearer, and not better owned by a project type. An algorithm-local `private fun <T> MutableList<T>.swap(i: Int, j: Int)` passes. Parsing, repository access and clock or locale policy never go in an extension.

```kotlin
// Before: String pretends to own UserId construction.
fun String.toUserId(): UserId = UserId(this)

// After: UserId owns it.
@JvmInline
value class UserId private constructor(val value: String) {
    companion object {
        fun parse(raw: String): UserId = UserId(raw)
    }
}
```

Keep an existing private member when the behavior is intrinsic and has no other caller; not reading instance state does not move it to file scope. When moving or renaming public API, keep a `@Deprecated` entry point unless the release is breaking, and check implementers of a changed interface: a forwarding extension does not preserve source compatibility for them. Check nullable receivers, generics and member-wins-over-extension precedence.

## Value class or data class

| Situation | Prefer |
|---|---|
| One field with domain meaning (`UserId`, `EmailAddress`) | `@JvmInline value class` |
| One field, no domain meaning | Keep the primitive or a `typealias` |
| Several fields | `data class` |
| Custom `equals`/`hashCode` beyond the wrapped value | `data class` |
| Nullable, generic or vararg use in a proven hot path | Measure; those uses box |

Checks before converting:
- JSON: `@Serializable data class A(val value: String)` encodes as an object; a value class encodes as the bare value. Do not change a wire format to satisfy a style rule.
- Callers using `copy()` or destructuring need a data class.
- Java sees the underlying type, and functions taking a value class get mangled names; add `@JvmName` where Java calls them.
- A value class cannot have `lateinit`, delegated properties or backing fields beyond its constructor value. Equality follows the wrapped value, so a "case-insensitive string" needs a data class.
- Do not bit-pack multi-field classes without a profile showing allocation cost.

## Sealed results

When mapping a sealed result, name every caller-visible subtype. A catch-all `else` hides new subtypes and a data-bearing subtype hidden in it loses its smart-cast access:

```kotlin
is Outcome.Failed -> safeFailureLabel(outcome.reason)
```

If the data does not change the result, keep the current value in that `is` branch and do not invent a use for it.

## Branching shapes

| Code shape | Prefer |
|---|---|
| One classified value | `when (subject)` |
| Unrelated boolean conditions | Subjectless `when` or `if`/`else` |
| Primary case plus a branch-local predicate | Guard (`is Event.Message if event.isUnread ->`), guarded branch first, Kotlin 2.2 or later |
| Invalid input before the main path | Early return, `require` or `check` |
| Closed domain | Exhaustive `when` expression |
| Open input (server value, platform enum) or real fallback | Explicit `else` |

Keep nesting that expresses cleanup, a transaction or error handling. Check smart casts still work without `as` or `!!` after a refactor, and compile.

## Multiplatform boundaries

In shared code keep semantics (a `Clock`, a `FileStore` interface) and put native SDK calls behind an interface or a narrow `expect`/`actual` at the leaves. Prefer an interface injected from the platform over `expect` classes with large surfaces.
