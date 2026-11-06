# Hazard catalog

Recurring shapes that make mistakes available, grouped by the lens that finds them. Each entry gives a signal to search for, why it bites, and the device with the rung it reaches (Control, Warning, Detection, or docs-only). Use it as vocabulary. The lens questions are the real tool.

Contents: Contact (C1-C9), Fixed-value (F1-F7), Motion-step (M1-M7), Removed devices (X1-X5).

## Contact: can the wrong thing fit?

**C1. Adjacent same-type parameters.** Signal: `transfer(from: string, to: string)`, `slice(start, end)`. A swap compiles and gives a plausible wrong result. Device: distinct types per concept (Control), or required keyword arguments so the call site names each one (Warning, nearly free).

**C2. Boolean flag parameters.** Signal: `createUser(name, true, false)`, `save(data, force=True)`. The call site is unreadable, and a second flag squares the confusion. Device: an enum per axis, an options object, or two functions (Control). One boolean that reads correctly as a keyword argument is fine.

**C3. Primitives at the boundary.** Signal: `string` for email, URL, path, token, tenant id. A boolean validator throws away the proof, so the check is repeated, skipped, or inconsistent. Device: parse once into a type that downstream signatures demand (Control).

**C4. Stringly-typed enums.** Signal: `status: string` with a comment listing values. Typos compile and new variants never reach this code. Device: a literal union or enum with exhaustive matching (Control; see F1).

**C5. Implicit units.** Signal: `timeout: number`, `retryAfter: int`. A 1000x seconds-versus-milliseconds error looks like a hang. Device: a duration or unit type (Control). A name like `timeoutMs` helps a reader but raises no diagnostic (docs-only).

**C6. Money as a float.** Signal: `price: float`, `==` on currency. Binary floats drift and reconciliation fails days later. Device: integer minor units or a decimal type in a `Money` type that carries its currency, with mixed-currency arithmetic failing to typecheck (Control).

**C7. Unvalidated external input.** Signal: `JSON.parse(body)` into `any`, a third-party response used field by field, `os.environ[...]` read deep in logic. The failure surfaces far from the boundary. Device: a schema at every edge, including your own services' responses (Control).

**C8. Bag-of-optionals types.** Signal: `{ status, data?, error?, retryAt? }`. N optional fields claim 2^N states and every consumer guesses which are real. Device: a discriminated union of exactly the legal variants (Control).

**C9. Naive datetimes.** Signal: timezone-less timestamps, `now()` scattered through business logic, dates as strings. Right in the developer's zone, wrong in production, and hard to test at boundaries. Device: timezone-aware types, UTC at rest, and an injected clock (Control for the type).

## Fixed-value: can an incomplete or wrong-sized set pass?

**F1. Non-exhaustive branching.** Signal: a `switch` or `match` over an enum with a do-nothing `default`, or an if-chain over a closed set. Adding a variant silently takes the default everywhere. Device: compiler-enforced exhaustiveness, such as an `assertNever(x: never)` arm, `match` without a catch-all, or `assert_never` under a type checker (Control, one line per switch).

**F2. Unbounded destructive operations.** Signal: `DELETE` or `UPDATE` from a filter that can be empty, `rm -rf "$VAR"`, `deleteMany(where)`, a cleanup job with no cap. An empty filter often means everything. Device: refuse an empty predicate, require an explicit `all` flag, cap affected rows above a confirmation threshold, and dry-run by default with the count printed (Control).

**F3. Defaults that hide a decision.** Signal: `retries=3`, `currency="USD"`, `tenant=None`. The caller never considers it and the default is wrong for them. Device: make the parameter required. Keep defaults for values that are right for nearly everyone and harmless for the rest (Control).

**F4. Config discovered missing at runtime.** Signal: `getenv("X")` inside a handler, a missing key yielding `None` that flows on. The service passes health checks and fails on the one path needing the key. Device: parse the whole config into a typed object at startup and exit non-zero on any gap (Control; a 3am page becomes a failed deploy).

**F5. Partial writes.** Signal: several writes without a transaction, or write, external call, write. A mid-sequence failure leaves a state your code does not model. Device: a transaction, an outbox for external effects, and an idempotent sequence so replay converges (Control for the transaction).

**F6. Invariants enforced only in the application.** Signal: `SELECT` then `INSERT` for uniqueness, nullability in the model but not the column. It races under concurrency and any script or `psql` session bypasses it. Device: `NOT NULL`, `UNIQUE`, `CHECK`, foreign keys, partial unique indexes (Control, and durable).

**F7. Unbounded input.** Signal: no maximum page size, no upload size limit, a query built from an uncapped user list, unbounded retries or recursion. Device: explicit caps at the boundary, enforced by the parsing type where possible (Control).

## Motion-step: can the order be wrong?

**M1. Temporal coupling.** Signal: `init()`, `connect()`, or `validate()` that must precede other calls, docs saying "you must call X first". Device: a constructor or factory that returns a ready object, or typestate where `connect()` returns a type that alone has the other methods (Control).

**M2. Non-idempotent retryable effects.** Signal: a charge, email, webhook, or mutation reachable from a retry, queue consumer, or UI button without a key, or with an optional one. At-least-once delivery is normal. Device: a required idempotency key backed by a unique constraint on `(entity, key)` (Control). The constraint alone is not enough. Reserve the key in the same transaction as the effect, bind it to the request payload so a different payload under a reused key is an error, and replay the stored result to the second caller.

**M3. Illegal state transitions.** Signal: a `status` field assigned from several places, a refund reachable before a charge. Device: one transition function as the only path to a new state, or typestate (Control). A row-level `CHECK` cannot see the previous state, so policing transitions in the database needs a trigger or a transition table.

**M4. Unreleased resources.** Signal: `open()` and `close()`, `acquire()` and `release()`, `begin()` and `commit()` as separate statements with a `return` or `throw` between them. The error path leaks and the pool exhausts under load. Device: scope-bound acquisition such as `with`, `defer`, RAII, `using` (Control).

**M5. Check-then-act races.** Signal: `if (!exists(x)) create(x)`, read-modify-write on a shared counter, check balance then debit. Right in every test, wrong under concurrency. Device: make it atomic with a unique constraint and `INSERT ... ON CONFLICT`, a version-checked update, `SELECT ... FOR UPDATE`, or compare-and-swap (Control).

**M6. Fire-and-forget async.** Signal: an unawaited promise, a goroutine with no error path, `asyncio.create_task` with no kept reference. Errors vanish and the process may exit before the work completes. Device: a no-floating-promises lint rule (Warning), an errgroup, structured concurrency, or holding and awaiting the task. Rust's `#[must_use]` on futures warns for free, and `#![deny(unused_must_use)]` makes it Control.

**M7. Order-dependent migrations and deploys.** Signal: a column drop or rename in the same deploy as the code change. Old code runs against the new schema during the rollout, which is an outage. Device: expand and contract (add, backfill, dual-write, switch, drop in a later deploy) with a CI gate against co-deploying destructive DDL and code (Control via the gate).

## Removed devices: someone installed one and someone else took it out

Treat these with more suspicion than a missing device. The code around them was written by someone who knew the failure was possible. X2 and X5 are defaults nobody chose.

**X1. Swallowed errors.** Signal: `catch {}`, `except: pass`, `_ = err`, `catch (e) { console.log(e) }` then continuing, `.catch(() => null)`. A loud failure becomes a quiet wrong answer. Device: handle it or propagate it. Where absorbing is correct, catch the specific type and name the expected failure and why continuing is safe. Enforce with empty-block and bare-except lint rules (Warning).

**X2. Silent coercion and fallback.** Signal: `value || default` where `0`, `""`, or `false` are legal, `parseInt` with no NaN check, `.unwrap_or_default()` on a real error. A plausible value comes from bad input and the wrongness shows up far away. Device: `??` where zero is legal, an explicit parse with an error branch, failure at the boundary (Control at the parse site).

**X3. Disabled tests.** Signal: `it.only`, `describe.skip`, `@pytest.mark.skip`, `t.Skip()`, `#[ignore]`, especially with no reason. A detection device switched off. Device: fail CI on focused or skipped tests, require a reason and an issue link, and ratchet the count down (Warning).

**X4. Type-system escape hatches.** Signal: `any`, `as unknown as T`, `!` assertions, `interface{}` with a type switch, `# type: ignore`, `unsafe`, `@ts-ignore`. Each is a place the guarantee stops, concentrated where it is needed most. Device: ban by lint at error level with a narrow justified allowlist and parse at the boundary instead. A CI gate is still Warning. Reach Control only when the unchecked value cannot be constructed.

**X5. Mutable shared defaults.** Signal: `def f(items=[])`, a module-level dict used as a mutated cache, a shared config object mutated after construction, class attributes used as instance state. State leaks between calls and the symptom is order-dependent behavior that vanishes on reproduction. Device: a `None` sentinel, immutable value types, or per-request construction. Lint covers the argument-default case only (Warning). Frozen types give Control.
