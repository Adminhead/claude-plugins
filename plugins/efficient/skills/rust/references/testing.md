# Rust testing

Read this when a Rust change needs test design beyond a plain unit test. Use the project's existing runner (`cargo test` or `cargo nextest`), async runtime, property-test crate, and bench harness. Don't add a testing dependency just to follow this file.

## Where tests go

- Private logic goes in a nearby `#[cfg(test)] mod tests { use super::*; ... }`.
- Public API and cross-module wiring go in `tests/*.rs`. Each top-level file there compiles as a separate crate, so shared helpers belong in `tests/common/mod.rs`.
- Doctests on public items double as usage docs. Run them with `cargo test --doc`.

## Errors and panics

- Assert the contractual variant with `assert!(matches!(err, MyError::NotFound { .. }))`, plus any relevant source, state, or recovery effect.
- Don't assert rendered `Display` text unless that text is the interface.
- Use `#[should_panic(expected = "...")]` only when panicking is the contract for a programmer-invariant violation. Otherwise assert the fallible API's `Err`.

## Async tests

- Use the project's runtime attribute, for example `#[tokio::test]` or `#[tokio::test(flavor = "multi_thread")]` when the code needs it. Don't nest or add runtimes.
- Await spawned work and assert its result. Make cancellation, shutdown, and timeout behavior explicit.
- Prefer deterministic time over wall-clock sleeps. With tokio, use `#[tokio::test(start_paused = true)]` and `tokio::time::advance`, which needs the `test-util` feature.

## Property tests

- Use `proptest` or `quickcheck` only when the repo already has them and the behavior is invariant-rich, such as round trips, ordering, parser totality, or bounds.
- Keep generators inside the supported input domain.
- Keep a plain example test for any failure found, and commit `proptest-regressions/` files.

## Benchmarks

- Use the project's harness (criterion, divan, or `#[bench]` on nightly) with a representative workload in release mode.
- Record the baseline, the post-change result, and the trade-off. A unit test's duration is not performance evidence.
