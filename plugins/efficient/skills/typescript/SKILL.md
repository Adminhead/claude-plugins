---
name: typescript
description: TypeScript type-level and compiler work covering tsconfig strictness, narrowing, generics, discriminated unions, declarations and module resolution, public type APIs, runtime validation of unknown data, and type tests. Use when editing *.ts/*.tsx types or tsconfig.json, or fixing tsc errors. Not for JS runtime behavior like modules, async, or event loop (efficient:javascript), or React components (efficient:react).
---

# Efficient TypeScript

This skill owns the compile-time contract, meaning compiler configuration, type representations, inference, declarations, module typing, and type tests. Preserve runtime behavior unless the request changes it.

## Orient

- Read the nearest `tsconfig*.json` and its `extends` chain, `references` (project graph), package scripts, and the installed TypeScript version (`npx tsc -v`).
- Note whether the target is an app or a published library, and which outputs are emitted versus declaration-only.
- Keep generated declarations and external input as separate boundaries.
- Inspect inferred types with the LSP tool (hover and go-to-definition) when available. Find consumers of exported types with `codegraph_explore` when `.codegraph/` exists, otherwise Grep.
- Check compiler options and library typings against installed versions. Use Context7 (`resolve-library-id`, then `query-docs`) for TypeScript and third-party APIs, since options like `moduleResolution: "bundler"`, `verbatimModuleSyntax`, and `isolatedDeclarations` are version-sensitive.

## Classify the change

- **Compiler config.** Edit the owning config, not every child. State which projects inherit it and whether it affects emit, resolution, declarations, or checking only.
- **Internal model.** Make states explicit only where a real invariant or consumer needs it.
- **Public boundary.** Define input, output, mutability, nullability, error/result shape, and compatibility before changing exported types.
- **External data.** Keep it `unknown` until a parser proves its shape. Annotations don't validate JSON, env vars, network data, or storage.
- **Declaration or module error.** Decide whether the cause is a missing dependency, wrong resolution mode, missing upstream types, a wrong declaration, or an intentionally untyped boundary. Don't cover it with a broad ambient declaration.

## Strictness

- Use `strict: true` for new code unless a stated compatibility constraint prevents it.
- Adopt `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` when their semantics match the domain. When they surface large existing debt, migrate in a scoped, staged way.
- Never loosen a global option to pass one file. A temporary exception names the remaining failures and the condition for removing it.

## Modeling

- Use discriminated unions for variants with different required fields. Avoid optional-property bags for mutually exclusive states.
- Use `readonly` where mutation isn't part of the contract.
- Give commonly confused same-shaped values distinct domain types, with brands only where they prevent a real bug.
- `prop?: T` and `prop: T | undefined` differ under `exactOptionalPropertyTypes`. Follow the boundary's existing convention for absence.
- Keep one source of truth. Derive views with `Pick`, `Omit`, indexed access, or `typeof` instead of duplicating shapes.
- Choose `type` or `interface` by local convention and capability. Use `type` for unions and intersections, and `interface` when declaration merging or extension is needed.

## Inference and annotations

- Let inference work inside functions. Annotate where it documents a public contract, prevents unwanted widening or leakage, anchors an empty container, or stabilizes a declaration surface.
- Use `satisfies` to check a value against a shape while keeping its literal types. Use `as const` for literal tuples and objects.
- Avoid `any`. When unsafe interop is unavoidable, confine it to one documented boundary and convert to a checked type immediately.

## Narrowing

- Narrow from evidence that matches the runtime representation, such as discriminants, `typeof`, `instanceof`, `in`, and equality checks.
- A user-defined type guard (`x is T`) or assertion function (`asserts x is T`) must verify everything it claims. It is part of the safety boundary.
- Make `switch` statements over maintained unions exhaustive with a `never` check (`const _exhaustive: never = x`).
- Don't silence errors with `as`, `!`, or a false predicate unless a narrow, documented invariant exists that the types can't express.

## Generics

- Start from concrete call sites, and use the fewest type parameters and constraints that preserve the relationship callers need.
- Prefer generics that relay a relationship already present in the inputs over overloads, conditional types, or template-literal types.
- Add overloads only when each call shape has a distinct, understandable result that a union signature would lose.
- Stop before a type needs recursive conditionals or distribution tricks that produce errors callers can't act on. Use a simpler API instead.

## Modules and declarations

- Follow the configured `module` and `moduleResolution`. Use `import type`/`export type` when `verbatimModuleSyntax`, `isolatedModules`, or convention requires it.
- Libraries export only deliberate, stable types, and declarations must describe the emitted values. Don't leak internal types through exported signatures.
- Scope an ambient `declare module "x"` to one verified untyped dependency or asset pattern, declaring only what exists at runtime.
- Prefer fixing package `exports`, resolution config, or upstream `@types` over `declare module "*"`, global augmentation, or duplicate third-party typings.
- Don't add `skipLibCheck`, `paths` aliases, ambient globals, or module shims as a local fix without weighing their project-wide effect.

## Runtime validation

- Reuse the repo's existing validator (zod, valibot, arktype, io-ts, or a hand-written parser). Don't add a dependency for one shape.
- Convert validated input to a named domain type and pass that type inward. Invalid input follows the existing error/result contract.

## Validate

- Run the narrowest type check that reaches the owning config, such as `npx tsc --noEmit -p <tsconfig>` or `tsc -b` for project references, or the repo's `typecheck` script.
- When config, public types, imports, or declarations changed, also run the build or declaration emit.
- Run lint only when it checks the affected boundary. Use `efficient:testing` for runtime tests.
- Add a type test only for public, subtle, or previously regressed relationships. Cover an accepted use and a rejected one (`// @ts-expect-error`, `expectTypeOf`, or `tsd`, whichever the repo uses). Keep type tests apart from runtime tests when their runners differ.
- Measure type-check cost (`tsc --extendedDiagnostics`, `--generateTrace`) before simplifying types for performance.

## Diagnosing errors

Reduce the error to the smallest failing call, export, config, or declaration. `tsc --traceResolution` explains module resolution, and `--explainFiles` shows why a file is included. Then test one cause at a time, from this list:

- wrong model
- missing narrowing
- unwanted widening
- an incompatible public change
- wrong project config
- a false declaration

Fix the source boundary instead of casting, loosening, or disabling an option.
