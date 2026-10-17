---
name: unit-testing
description: Writes, updates and runs focused unit or regression tests for changed behavior or a confirmed bug, in any language, including test-first (red-green) work, and decides which tests to run after a change. Use for "add a test for this", "write a regression test for this fix", "do this TDD", "which tests should I run?" or "is this change covered?".
---

# Unit testing

Produce the smallest reliable unit or regression evidence for a code change. A test is an executable statement of an observable contract, not a branch-coverage exercise.

Not for E2E or browser suites (`e2e-testing`), auditing a codebase's or diff's test gaps (`test-gap-audit`), running a whole suite and fixing its failures (`test-run`), coverage chasing, test-framework setup, fuzz or property testing, or broad suite refactors. If one of those tasks also changes behavior that needs a focused unit or regression test, use this workflow for that part.

## Workflow

1. **Establish the change and its contract.** Read the requirement or defect report, the changed code, and the closest relevant tests. Identify the public input, the observable result or effect, and one scenario that proves the intended behavior. Learn the runner, test location, naming, and prerequisites from local docs, config, scripts, and nearby tests. Don't copy an elaborate existing pattern just because it exists.

2. **Decide whether to add a test.**
   - New or changed behavior: start with one happy-path test for that behavior, and stop there unless a case below applies.
   - Pure refactor: run the relevant existing tests. Update a test only when a change to the supported public interface breaks it.
   - Add one edge or failure case only when an explicit requirement, production contract, or surfaced defect calls for it. Skip speculative inputs and permutations.
   - Confirmed defect: add the smallest test that discriminates the reported behavior. When practical, show it failing before the fix and passing after. If a pre-fix run is impossible, say why instead of claiming it failed. Name the test after the failure it prevents, and put it where similar bugs have clustered.
   - Test-first work (the user asks for TDD or red-green-refactor, or the fix is easiest to drive from a failing test): read `references/tdd.md` before the first test. It also covers seams, mocking, and the anti-patterns below in depth.

3. **Choose the smallest proving level.** Prefer a direct unit test of the public contract. Move to a component, database, or service test only when a lower level can't establish the behavior. Don't test mocks, fixtures, or helpers for their own sake. When a fake or sandbox path and the real path must return the same shape, one parity test that runs the same assertions against both catches drift that mocks hide.

4. **Write a discriminating test.**
   - Name it by scenario and outcome (what, not how).
   - Arrange only what the case needs, perform one meaningful action, and assert independent observable outcomes.
   - Use fixed or independently known expected values. Never compute the expectation with the production algorithm: that test is tautological and passes by construction.
   - Isolate it from test order, clocks, network, shared state, and implementation details. Use the runner's native fixtures, hooks, and temp-resource helpers for setup and cleanup.
   - Mock only at system boundaries you don't own (third-party services, time, randomness, the network). Don't mock your own in-process modules.
   - For concurrency, wait on an explicit condition or completion signal, never a sleep.
   - Assert public results, not private calls or fields, unless the contract exposes them. A test that breaks when only the implementation changed is coupled to internals.
   - For framework idioms, read `references/pytest.md` (Python) or `references/vitest.md` (JavaScript or TypeScript, including Jest).

5. **Make prerequisites explicit and safe.** Record the exact targeted command and, when discoverable, the runner version and where it came from. Record required config, local services, ports, OS or network constraints, and test-data setup. Use disposable data and never require real credentials or a production service.
   - Read `references/framework-runners.md` before choosing a command when the runner or its targeting syntax is unfamiliar (pytest, Vitest/Jest, Go, Cargo, or unknown).
   - Read `references/database-and-service-tests.md` before writing any test that needs a database, container, or local service.

6. **Run proportionately.** Run the narrowest target that reaches the new test first. Rerun it after relevant code or test changes. Run a broader group only when project policy, shared code, config, or dependencies make it necessary. Treat coverage as a diagnostic for unexpected gaps, never a quota. Don't count your own review of code you just wrote as evidence that its tests are sufficient, because the same blind spots that produced a bug tend to miss it in review. A check that runs can disagree with you.

7. **Diagnose failures before widening scope.** Classify the failure as a product defect, wrong expectation, unstable or order-dependent test, runner or config issue, or missing infrastructure. Keep the failure output. Don't add retries or broaden scenarios to make a failure disappear. If prerequisites can't be met safely, report the test as blocked with the missing requirement. For a failure whose cause is unknown, use `problem-solving`.

## Completion evidence

Report only what you actually obtained:

- the behavior and scenario covered, and why any edge or failure case was justified;
- the test location and the public contract it asserts;
- the targeted command, runner version when known, and the result;
- prerequisites and isolation details for any database or service dependency;
- for a defect, pre-fix failure evidence and post-fix pass, or why pre-fix proof wasn't practical.

Stop when the changed contract has focused evidence and any required regression is covered.
