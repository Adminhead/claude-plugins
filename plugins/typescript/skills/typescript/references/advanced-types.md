# Advanced types

Adapted from wshobson/agents `typescript-advanced-types` (MIT, Copyright (c) 2024 Seth Hobson), trimmed and rewritten.

Read this when a conditional, mapped, or template-literal type is needed and the simpler tools in `SKILL.md` (generics that relay a relationship, `Pick`/`Omit`, indexed access) can't express it. Examples compile under TypeScript 7.0 with `strict` (checked with `tsc` 7.0.2). Check the repo's installed version before using a newer feature.

Write the type in the style the repo already uses. These examples use `type` aliases because mapped and conditional types require them.

## Conditional types and `infer`

```ts
type ElementOf<T> = T extends readonly (infer E)[] ? E : never;
type FirstArg<F> = F extends (first: infer A, ...rest: never[]) => unknown ? A : never;
type Resolved<T> = T extends Promise<infer R> ? Resolved<R> : T; // built in as Awaited<T>
type ToNumber<S> = S extends `${infer N extends number}` ? N : never; // "42" -> 42 (TS 4.8+)
```

- A conditional type distributes over a union when the checked type is a bare type parameter. `ToArray<string | number>` gives `string[] | number[]`. Wrap both sides, `[T] extends [U]`, to test the union as a whole. Wrapping also lets `never` take the true branch, where a distributive check returns `never`.
- Constrain the check to make the branch usable, as in `T extends { message: unknown } ? T["message"] : never`.
- Reach for a built-in before writing one: `ReturnType`, `Parameters`, `ConstructorParameters`, `InstanceType`, `Awaited`, `NonNullable`.

## Mapped types

```ts
type Getters<T> = { [K in keyof T & string as `get${Capitalize<K>}`]: () => T[K] };
type OnlyKeysOf<T, V> = { [K in keyof T as T[K] extends V ? K : never]: T[K] }; // never drops the key
type Mutable<T> = { -readonly [K in keyof T]: T[K] };
type Concrete<T> = { [K in keyof T]-?: T[K] };
```

- `as` remaps or filters keys (TS 4.1+). `-readonly` and `-?` remove a modifier, and `+` is the default when omitted.
- A homomorphic mapping (`[K in keyof T]`) keeps the source's optionality and `readonly`. Mapping over a bare union of keys does not.

## Template literal types

```ts
type Endpoint = `${Uppercase<"get" | "post">} /${string}`; // "GET /..." | "POST /..."
type Split<S extends string> = S extends `${infer H}.${infer T}` ? [H, ...Split<T>] : [S];
```

- Unions in a template expand to their cross-product, so three unions of ten members each produce 1,000 types. Keep them small.
- Intrinsic helpers are `Uppercase`, `Lowercase`, `Capitalize`, and `Uncapitalize`.
- Recursive string parsing is for short, bounded strings (route paths, event names). Stop when the error messages become unreadable.

## Newer helpers

- `NoInfer<T>` (TS 5.4) stops a parameter from widening inference: `pick<T extends string>(opts: T[], dflt: NoInfer<T>)` rejects a default outside `opts`.
- A `const T` type parameter (TS 5.0) infers literal tuples and objects from a call without `as const` at the call site.

## Recipes

Typed event emitter. The event map is the single source of truth, and each payload follows its key:

```ts
class Emitter<E extends Record<string, unknown>> {
  #handlers: { [K in keyof E]?: ((payload: E[K]) => void)[] } = {};
  on<K extends keyof E>(event: K, fn: (payload: E[K]) => void) { (this.#handlers[event] ??= []).push(fn); }
  emit<K extends keyof E>(event: K, payload: E[K]) { this.#handlers[event]?.forEach((fn) => fn(payload)); }
}
```

Route-keyed client. Require a body only for routes that declare one:

```ts
type Routes = {
  "GET /users/:id": { res: { name: string } };
  "POST /users": { body: { name: string }; res: { id: string } };
};
declare function call<K extends keyof Routes>(
  route: K,
  ...args: Routes[K] extends { body: infer B } ? [body: B] : []
): Promise<Routes[K]["res"]>;
```

Exhaustiveness helper for unions that change over time. `SKILL.md` shows the inline `never` check, and a helper adds a runtime failure for data that bypassed the types:

```ts
function assertNever(x: never): never {
  throw new Error(`unhandled: ${JSON.stringify(x)}`);
}
```

## Type tests

Prefer the repo's runner (`expectTypeOf`, `tsd`, `// @ts-expect-error`). Without one, an `Equal` helper works in a file that `tsc` checks:

```ts
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Expect<T extends true> = T;
type _ = Expect<Equal<ElementOf<string[]>, string>>;
```

A plain `[A] extends [B]` check passes for `any` and for subtypes, so use the `Equal` form above when exact equality matters. Pair every accepted case with a rejected one.

## Cost

- Deep recursion and large unions slow `tsc` and produce errors callers can't read. Measure with `tsc --extendedDiagnostics` before and after, and fall back to a simpler public signature if a type costs more than it protects.
- Hide an advanced type behind a named alias and a short doc comment, so callers see the name instead of the machinery.
