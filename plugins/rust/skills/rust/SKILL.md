---
name: rust
description: 'Writes, reviews and debugs Rust: ownership and lifetimes, Result and error types, traits and modules, Cargo workspaces and features, async and tokio tasks, unsafe, measured performance. Use for *.rs or Cargo.toml work, borrow-checker fights, error-type design, clippy failures or unsafe review.'
---

# Rust

Not for generic test strategy (`unit-testing`).

Preserve observable behavior, error behavior, feature combinations, cancellation boundaries, and safety invariants unless the request changes them.

## Orient

- Read the closest `Cargo.toml` and the workspace root. Note members, features, profiles, `[lints]`, `rust-version` (MSRV), `rust-toolchain.toml`, and whether `Cargo.lock` is committed.
- Identify the async runtime in use (tokio, async-std, smol, or none) and the test conventions before editing.
- Find callers, trait impls, and feature-gated uses with the codebase-memory tools when the repo is indexed (`search_graph` for symbols, `trace_path` for callers and callees, `get_code_snippet` for source). Otherwise use the LSP tool (rust-analyzer) or Grep for references, implementations, and inferred types.
- Check crate APIs against the locked version with Context7 (`resolve-library-id`, then `query-docs`) or docs.rs for that exact version. Don't use features newer than the MSRV.

## Design

- Keep code in the existing crate and module. A new crate needs a distinct compilation, visibility, or dependency boundary.
- Items are private by default. Expose the narrowest stable interface, and use `pub(crate)` for crate-internal sharing.
- Prefer a concrete function, struct, or enum. Add a trait only for multiple real implementations, a consumer-owned substitution seam, or a generic algorithm.
- Group code by responsibility. Keep representation private behind constructors when callers must not break invariants.
- When a trait is warranted, decide its error type, `Send`/`Sync` bounds, object safety, and feature gating on purpose. Don't make downstream crates implement a public trait unless that extension point is the contract.
- Read [references/idioms.md](references/idioms.md) when modeling states as enums, adding newtypes or builders, choosing `Cow`, or deciding where `#[must_use]` belongs.

## Ownership

- Take `&T`/`&str`/`&[T]` when the callee only reads. Take owned values when it stores, consumes, or moves them across threads or tasks.
- Return owned values unless the result is tied to an input and borrowing makes the caller simpler.
- Let elision handle lifetimes. Name a lifetime only to express a real relationship between references.
- Don't reach for `.clone()`, `'static`, `Box::leak`, `Rc<RefCell<_>>`, or `Arc<Mutex<_>>` just to silence the borrow checker. First restructure control flow or shorten the borrow. If shared ownership is truly needed, say why.

## Errors

- Use `Result` for expected failures. Reserve `panic!`, `unwrap`, and `expect` for programmer invariants and tests, and write `expect("why this can't fail")` when you do use them.
- Library crates expose typed errors (often `thiserror`) with variants callers can act on and a `source()` chain.
- Application and CLI boundaries may use `anyhow`/`eyre`, adding `.context("doing X")` at the layer that knows the operation.
- Propagate with `?`. Never discard an error (`let _ = fallible()`) or stringify away its source chain.

## Async and concurrency

- Stay on the project's runtime, and don't nest or mix runtimes.
- For every spawned task, channel, and lock, name the owner, stop signal, how completion and errors are observed (keep the `JoinHandle` or use a `JoinSet`), capacity or backpressure, and shutdown.
- Treat a dropped future as normal cancellation. Partial work and external state must stay safe at every `.await`.
- Use bounded channels and bounded task creation where input can grow.
- Don't hold a `std::sync::Mutex` guard across `.await`. Avoid holding a `tokio::sync::Mutex` across one unless the wait is demonstrably safe. Prefer copying data out, narrowing the critical section, or message passing.
- Move blocking or CPU work off the executor with `spawn_blocking` or the runtime's equivalent. Propagate task panics and errors instead of detaching them.

## Unsafe

- Use safe Rust first. Before writing or accepting `unsafe`, name the safe alternative and why it can't meet the contract or a measured constraint.
- Keep the unsafe region minimal, inside a small helper behind a safe API that enforces its preconditions.
- Put a `// SAFETY:` comment on every block naming the invariants that make it sound. These can include validity, initialization, bounds, alignment, aliasing, drop, layout, and `Send`/`Sync`.
- Tests don't prove the absence of UB. Run `cargo +nightly miri test` on the affected tests when the toolchain has Miri, and report when it doesn't.

## Performance

- Measure a representative baseline first, with the project's criterion/divan benches, `cargo bench`, or a profiler (`perf`, `cargo flamegraph`, `samply`). Always build in `--release`.
- Change one cost at a time. Prefer algorithmic, allocation, or data-movement fixes over micro-tweaks or `unsafe`.
- Remeasure the same workload. Revert changes without a material gain, or that muddy ownership, errors, or safety.

## Tests

- Put unit tests in `#[cfg(test)] mod tests` and public-API tests in `tests/`.
- Test each affected non-default feature with `cargo test --features <f>`. Don't build an automatic feature matrix.
- Keep test-only helpers out of the production API.
- Read [references/testing.md](references/testing.md) for test layout, doctests, error and panic assertions, async tests, property tests, coverage, or benchmark evidence.

## Validate

Use the repo's documented commands (Makefile, justfile, `cargo xtask`, CI) when present. Otherwise run from the relevant package or workspace root.

```sh
cargo fmt --check
cargo check --all-targets
cargo clippy --all-targets -- -D warnings   # add --all-features if the repo's CI does
cargo test                                  # -p <crate> to narrow; --doc when doctests are contract
```

Triage failures as a code defect, test expectation, feature/config issue, toolchain problem, or missing prerequisite. Don't `#[allow]` a lint or disable a feature just to get green output.

## Decision defaults

| Situation | Default | Escalate when |
| --- | --- | --- |
| Borrow conflict | Clarify ownership; shorten the borrow or restructure | Independent ownership or measured constraints justify a clone or shared ownership |
| Public error | Typed, source-preserving enum | A boundary intentionally maps internals to a user, wire, or domain error |
| New abstraction | Concrete type or function | Multiple current impls or a consumer-owned seam need a trait |
| Shared mutable state | Ownership transfer or narrow sync | Lock ordering, contention, and `.await` interactions are explicit |
| `unsafe` | Reject for safe Rust | A required capability can't be met safely and invariants are locally enforced |
