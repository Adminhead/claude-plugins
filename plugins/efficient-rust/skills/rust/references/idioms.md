# Rust idioms

Read this when designing a type's API or choosing how to model states, units, or optional values. These are defaults with reasons, and the existing code's conventions win when they differ.

## Model business states as enums

- Match your own business enums exhaustively, with no `_` arm. Adding a variant then fails to compile at every `match` that must decide what to do with it. A wildcard hides that and silently routes the new case to the default branch.
- Reserve `_` for open-ended input such as integers or strings, and for `#[non_exhaustive]` enums from another crate, where the compiler requires a wildcard.
- Put `#[non_exhaustive]` on a public enum or error type that you expect to grow, so adding a variant isn't a breaking change for downstream crates. It has no effect inside the defining crate.
- To make the habit enforceable, `clippy::wildcard_enum_match_arm` is an opt-in restriction lint. Enable it per module or crate where the rule matters, not by default.

## Newtypes

Wrap primitives that mean different things (`UserId(u64)`, `OrderId(u64)`, `Meters(f64)`) so a swapped argument fails to compile. Keep the field private and validate in a constructor when the type has an invariant. Derive only the traits the type needs. Don't add a newtype for a value that never crosses a function boundary.

## Cow for sometimes-owned data

When a function usually returns its input unchanged and occasionally builds a new value, return `Cow<'_, str>` (or `Cow<'_, [T]>`) so the common path doesn't allocate. Take `impl Into<Cow<'a, str>>` only when callers really pass both owned and borrowed values. Otherwise `&str` or `String` is simpler.

## Option and Result combinators

Use `map`, `and_then`, `ok_or_else`, `unwrap_or_default`, and `?` when they make a chain shorter than the equivalent `match`. Write the `match` when each arm does real work or the combinator chain needs a closure that is harder to read than the branches.

## Builders

Use a builder for a type with several optional settings or construction that can fail. Make required fields parameters of the entry function so they can't be forgotten, and make `build()` return `Result` when validation can fail. A struct with two or three fields doesn't need one. A plain constructor or struct literal is clearer.

## must_use

`Result` is already `#[must_use]`, so don't annotate functions only because they return one. Add `#[must_use]` (with a reason string when it helps) to pure functions and builder methods that return a new value, where ignoring the result is certainly a bug. `clippy::must_use_candidate` (pedantic) lists candidates in a public API.

## Errors in libraries

Don't return `Box<dyn Error>` from a library's public functions. Callers can't match on the failure without downcasting, because the concrete type is erased. Use a typed error, as the Errors section of SKILL.md describes.
