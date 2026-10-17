# Test-first work, seams and mocking

Read this when the user asks for test-driven development or red-green-refactor, when a fix is easiest to drive from a failing test, or when a test needs a mock. Test-first is a technique to offer when it fits, not a rule for every change. It does not require a coverage target, a checkpoint commit per step, or a saved evidence file.

Adapted in part from Matt Pocock's `tdd` skill and its `tests.md` and `mocking.md` (github.com/mattpocock/skills, MIT).

## Contents

- A valid red
- Work in vertical slices
- Choose the seam first
- Anti-patterns
- When to mock
- Design for substitution

## A valid red

A failing test counts as red only when it fails for the intended reason.

- Run it and read the failure. A test that was written but never run is not red.
- Confirm the failure message names the missing or wrong behavior. A syntax error, a failed import, a missing fixture, or an unrelated regression is a broken test, not a red one, so fix the setup and run again.
- For a compiled language, a compile error on the not-yet-existing interface is a legitimate red when that is the behavior you are specifying.
- Change production code only after the red is real, and write only enough to turn it green. Don't anticipate future tests or add speculative features.

## Work in vertical slices

Write one test, make it pass, then write the next, letting each cycle inform the following test. Each test is a tracer bullet: one seam, one behavior, one minimal implementation per cycle.

Writing every test first and then all the code (horizontal slicing) tests the imagined shape of the code, commits you to a structure before you understand it, and leaves tests that don't react to real behavior.

Refactor after green with the tests still passing. Keep it out of the red-green step so a failure points at one change.

## Choose the seam first

A seam is the public boundary where behavior is observable. Decide where tests will cross it before writing the first one, and write that choice down with a one-line note on what each seam catches and what it misses. Confirm it with the user when the interface itself is uncertain or the seams decide where a lot of test effort lands. Tests at that seam survive refactors; a test that must change when only the implementation changed is reaching past the seam.

If the project has a `GLOSSARY.md`, use its terms in test names and interface vocabulary, and respect ADRs in the area. For the shape of the interface and the seam itself, see the `coding` skill's `references/design-seams.md`, if installed.

## Anti-patterns

**Implementation-coupled.** Mocks internal collaborators, tests private methods, asserts call counts or order, or verifies through a side channel. The tell: the test breaks on a refactor that didn't change behavior.

```typescript
// BAD: bypasses the interface to verify
test("createUser saves to database", async () => {
  await createUser({ name: "Alice" });
  const row = await db.query("SELECT * FROM users WHERE name = ?", ["Alice"]);
  expect(row).toBeDefined();
});

// GOOD: verifies through the interface
test("createUser makes user retrievable", async () => {
  const user = await createUser({ name: "Alice" });
  expect((await getUser(user.id)).name).toBe("Alice");
});
```

**Tautological.** The expected value is recomputed the way the code computes it (`expect(add(a, b)).toBe(a + b)`, a hand-derived snapshot built the same way, a constant asserted equal to itself), so the test can never disagree with the code. Expected values come from an independent source: a known literal, a worked example, the spec.

```typescript
// BAD: passes by construction
const expected = items.reduce((sum, i) => sum + i.price, 0);
expect(calculateTotal(items)).toBe(expected);

// GOOD: independent literal
expect(calculateTotal([{ price: 10 }, { price: 5 }])).toBe(15);
```

**Horizontal slicing.** All tests first, then all implementation. See vertical slices above.

**Names that describe how.** `"checkout calls paymentService.process"` describes a mechanism; `"user can check out with a valid cart"` describes a capability and survives refactors.

## When to mock

Mock at system boundaries only:

- external APIs (payment, email, third-party services) and your own services across a network;
- time and randomness;
- the database or file system only when a disposable real one is impractical (prefer a test database or a temp directory).

Don't mock your own classes, modules, or in-process collaborators. A mock that only verifies an internal call proves nothing about the observable result.

## Design for substitution

**Inject boundary dependencies** so a test can pass a fake instead of patching a module:

```typescript
// Easy to substitute
function processPayment(order, paymentClient) {
  return paymentClient.charge(order.total);
}

// Hard to substitute: constructs its own client from the environment
function processPayment(order) {
  const client = new StripeClient(process.env.STRIPE_KEY);
  return client.charge(order.total);
}
```

**Prefer SDK-style interfaces over one generic fetcher.** A specific function per external operation (`getUser(id)`, `createOrder(data)`) gives each fake one shape and no conditional logic, shows which endpoints a test exercises, and keeps types per endpoint. A single `fetch(endpoint, options)` wrapper forces branching inside every mock.
