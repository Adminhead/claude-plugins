---
name: javascript
description: JavaScript runtime semantics for ESM vs CommonJS, module side effects, promises and the event loop, async ownership and cleanup, browser vs Node/Bun/Deno/edge boundaries, measured performance, and focused JS tests. Use when writing, reviewing, or debugging *.js/*.mjs/*.cjs or runtime behavior of any JS/TS code (import errors, unhandled rejections, leaks, ordering bugs). Not for type-level work (efficient:typescript), React (efficient:react), Vite configuration and bundling (efficient:vite), or HTML/CSS/a11y (efficient:web-development).
---

# Efficient JavaScript

Preserve the observable contract (values and errors, side effects, ordering, module initialization, supported runtimes) unless the request changes it.

## Establish the runtime first

- Read the entry point, changed module, direct callers, closest tests, `package.json` (`type`, `exports`, `engines`, scripts), the lockfile, and any bundler or transpiler config.
- Pin down the runtime and version (`.nvmrc`, `.node-version`, `engines`, `mise.toml`, `devenv.nix`, Dockerfile), the module format (ESM or CJS), and whether a bundler rewrites imports.
- Don't infer Node, Bun, Deno, edge, browser, or jsdom behavior from a different runtime. If the runtime or module mode is unknown, find the start command that establishes it before touching imports, globals, or lifecycle code.
- Find callers with `codegraph_explore` when `.codegraph/` exists. Otherwise use Grep or the LSP tool.
- Check framework and library APIs against the installed version (`npm ls <pkg>` or the lockfile) with Context7 (`resolve-library-id`, then `query-docs`). For runtime built-ins, check MDN or the runtime's docs for that version.

## Semantics to preserve

- Keep observed distinctions intact: a missing property versus `undefined` versus `null`, truthy versus falsy, object identity and mutation, and a synchronous throw versus a rejected promise.
- Use `===` for exact comparison. Use `??` / `?.` only when `null`/`undefined` are the values to replace, since `||` also replaces `0`, `''`, and `false`.
- Don't "modernize" a loop, callback, function form, or object update when that could change `this` binding, evaluation order, sparse-array holes, getters, mutation, or when errors fire.

## Modules

- Follow the package's ESM or CJS convention. Don't mix `require` and `import` in one module system without the runtime's documented interop.
- Keep exports, import-time side effects, circular-import behavior, and public file paths stable.
- ESM imports are hoisted and evaluated before the module body, so moving initialization across an import can reorder side effects.
- When an import fails, check the runtime's module mode, `package.json` `exports`/`type`, file extensions, the resolved file, and the build output before editing source.

## Async ownership

Classify each async path as a returned promise, callback, event listener, timer, stream, or intentionally detached task.

- Return or `await` any work whose completion affects the caller. A detached task needs an error handler and a cancellation owner at its launch site.
- Catch only where you can recover, translate to a documented result, or report and rethrow. Wrap errors with `new Error(msg, { cause: err })`. Logging and continuing turns failure into false success.
- Clean up listeners, timers, streams, and per-request resources on success, failure, and cancellation. `AbortController`/`AbortSignal` is the standard cancellation channel, and `{ signal }` on `addEventListener` removes listeners in bulk.
- Timers don't guarantee ordering. Microtasks (promise jobs), macrotasks (timers, I/O), and rendering callbacks follow different schedules.
- Treat an unhandled rejection, a callback error, or a test timeout as missing ownership. Find the producer and consumer before adding retries or a catch-all.
- Run independent awaits in parallel with `Promise.all`, or `Promise.allSettled` when partial failure is acceptable. Never create a floating promise in a loop.

## Failure boundaries by runtime

- **Browser.** Handle expected failures at the interaction, request, or app boundary that can update the UI. `window.onerror` and `unhandledrejection` are for observation, not recovery.
- **Server.** Preserve request and job isolation, and let the framework's outer error handler produce responses. Never keep request data in module-level mutable state.
- Server runtimes aren't interchangeable. Verify middleware order, startup, shutdown, signals, and permissions against the actual runtime and framework version.

## Organization

- Put a cohesive operation and its private helpers near the existing feature. Keep I/O at the edges and pass dependencies explicitly where the code already does.
- Prefer direct modules and named exports over barrels, registries, base classes, or utility layers for one caller.
- Don't rearrange unrelated files while fixing a runtime bug.

## Tests

- Test in the runtime the contract needs. Test pure modules directly, server code with controlled I/O, and DOM behavior in jsdom/happy-dom or a real browser only when the DOM is part of the contract.
- Await every promise, and assert results or rejections explicitly (`await expect(p).rejects.toThrow(...)`). Never let a test finish before its async work settles.
- Restore globals, env vars, module caches, timers, network stubs, and listeners after each test.
- Use fake timers only when scheduling is the contract, and flush exactly the queues the test depends on.
- Prefer a real small collaborator or an injected boundary over a mock that repeats production logic.
- Use `efficient:testing` to pick which cases to add.

## Validate

- Run the narrowest existing lint, test, build, or start script that reaches the change (`npm run test -- <file>`, `pnpm vitest run <file>`, `node --test <file>`).
- When bundling, module resolution, source maps, or startup are affected, check the production-like build output too.
- For a browser/server difference, run the real target runtime. A jsdom pass doesn't prove browser behavior.
- Don't install a runner, polyfill, or benchmark tool just to validate a narrow change.

## Performance

Before optimizing, read [references/performance.md](references/performance.md).

## Failure triage

| Signal | Look first at | Avoid |
| --- | --- | --- |
| Can't reproduce | Inputs, runtime version, command, timing; vary one thing at a time | Coding to an unverified theory |
| Module behavior changed | Restore the known-good boundary, then compare `package.json`, command, build output, import order | Mixing module systems or rewriting every import |
| Async timeout or duplicate work | Completion, cancellation, and error ownership for each promise and callback | Arbitrary delays or retries |
| Runtime API missing | Target runtime docs and installed version | Silently substituting another runtime's API |
