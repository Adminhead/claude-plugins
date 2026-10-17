# Vitest (and Jest) idioms

Read this when writing or changing a JavaScript or TypeScript unit test. Vitest first; Jest differs mainly in the `jest` object and configuration, noted where it matters. It covers how to express a test, not which command runs it (`framework-runners.md`). Use the runner, environment (`node`, `jsdom`, `happy-dom`) and helpers the project already has.

Trimmed and adapted from wshobson's `javascript-testing-patterns` skill (github.com/wshobson/agents, MIT). Vitest facts checked against the Vitest docs via Context7 (`/vitest-dev/vitest`, v4).

## Contents

- Shape and naming
- Async and errors
- Substitution: injection before module mocks
- Module mocks and hoisting
- Fake timers
- Components (Testing Library)
- Test data
- Snapshots
- Configuration notes

## Shape and naming

Import from `vitest` explicitly (`import { describe, it, expect, vi } from "vitest"`) unless the project enables `globals: true`. Group with `describe` by unit, name each `it` by scenario and outcome:

```typescript
describe("calculateTotal", () => {
  it("sums line items", () => {
    expect(calculateTotal([{ price: 10 }, { price: 5 }])).toBe(15);
  });
});
```

`toBe` for primitives and identity, `toEqual` for structural equality, `toStrictEqual` when `undefined` properties and class types matter.

## Async and errors

- `await` the call and assert the result; return or await every promise, or the test passes before the assertion runs.
- Rejections: `await expect(fetchUser("x")).rejects.toThrow("Not found")`.
- Sync throws: `expect(() => parse("5x")).toThrow(/unknown unit/)`. Always pass the message or class so an unrelated error doesn't pass.

## Substitution: injection before module mocks

Mock only boundaries you don't own (`references/tdd.md`). When the code takes its dependency as a parameter, pass a typed fake; no module mocking is needed:

```typescript
const repo: UserRepository = { findById: vi.fn().mockResolvedValue(null), create: vi.fn() };
await expect(new UserService(repo).getUser("999")).rejects.toThrow("User not found");
```

Assert the observable result first. Check `toHaveBeenCalledWith` only when the outgoing call is the contract (an email sent, a charge made), and avoid `toHaveBeenCalledTimes` unless the count matters to a caller.

`vi.spyOn(obj, "method")` observes or stubs one method on a real object; restore it (`mockRestore`, or `restoreMocks: true` in config) so it doesn't leak into the next test.

## Module mocks and hoisting

`vi.mock(path, factory)` is hoisted to the top of the file and runs before imports, wherever you write it. Its factory can't reference variables declared in the file, except ones created with `vi.hoisted`:

```typescript
const { sendMail } = vi.hoisted(() => ({ sendMail: vi.fn() }));
vi.mock("./mailer", () => ({ sendMail }));

import { notifyUser } from "./notify";

it("emails the user", async () => {
  await notifyUser("a@example.com");
  expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: "a@example.com" }));
});
```

Use `vi.doMock` (not hoisted) when a mock must differ per test; it affects only later dynamic imports. Use `vi.mocked(fn)` for typed access to a mocked import. Jest's `jest.mock` is hoisted too, but its factory may reference only variables whose names start with `mock`.

## Fake timers

```typescript
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("retries after the backoff", async () => {
  const p = withRetry(task);
  await vi.advanceTimersByTimeAsync(1000);
  await expect(p).resolves.toBe("ok");
});
```

Prefer the `*Async` timer helpers when promises are scheduled between timers. `vi.setSystemTime(new Date("2026-01-15T10:00:00Z"))` pins `Date.now()`. Never wait on real `setTimeout` delays in a unit test.

## Components (Testing Library)

Render, interact the way a user does, assert what a user sees:

- Query by role and accessible name (`getByRole("button", { name: /save/i })`), then label or text; `data-testid` only as a last resort.
- `@testing-library/user-event` (`await user.click(...)`) over `fireEvent`.
- `findBy*` or `waitFor` for async UI, never a sleep. `queryBy*` only to assert absence.
- Test hooks through a component that uses them, or `renderHook` when the hook is the public API.

## Test data

Small builder functions with overrides keep each test showing only the fields it cares about:

```typescript
const makeUser = (overrides: Partial<User> = {}): User => ({ id: "u-1", name: "Ada", email: "ada@example.com", ...overrides });
```

Prefer fixed values over random generators (`faker`) in unit tests; if the project uses one, seed it so a failure reproduces.

## Snapshots

Use a snapshot only for output whose exact shape is the contract (a serializer, a CLI message) and keep it small (`toMatchInlineSnapshot`). A large DOM snapshot is a change detector, not a behavior test: it fails on harmless markup changes and gets updated without review. Never update a snapshot to make a failure go away without reading the diff.

## Configuration notes

- Vitest 4 renamed `test.workspace` to `test.projects` and moved the old `poolOptions` to top-level options; follow the project's version.
- Coverage (`--coverage`, provider `v8` or `istanbul`) is a diagnostic for unexpected gaps. Don't add a threshold while writing a test.
- Jest with TypeScript needs a transform (`ts-jest`, `babel-jest` or `@swc/jest`); Vitest handles TypeScript through Vite. Don't switch runners as part of a test change.
