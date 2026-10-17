---
name: ts-module-boundaries
description: Sets up dependency-cruiser in a TypeScript repo so each package is reachable only through its root entry-point files, with no deep imports and no cycles, then proves the rules fail on a violation. Use when the user asks to enforce package boundaries, stop deep imports or add dependency-cruiser.
disable-model-invocation: true
argument-hint: "[packages root, e.g. src/packages]"
---

# TS module boundaries

Make every package a deep module: a lot of behavior behind a small interface. A package's public surface is its root files (its entry points). Everything in its subfolders is private. This skill installs [dependency-cruiser](https://github.com/sverweij/dependency-cruiser), writes the rules, and proves they bite.

Adapted from mattpocock/skills `setup-ts-deep-modules` (MIT, Copyright (c) 2026 Matt Pocock).

## The shape it enforces

```
src/packages/
  <name>/
    index.ts     entry point (public), import this from outside
    client.ts    another entry point; a package may expose several
    lib/         implementation, private, files import each other freely
    tests/       tests and fixtures, private
```

| Rule (config name) | Meaning |
| --- | --- |
| `outside-code-uses-entry-points` | Code outside the packages imports only a package's root files |
| `packages-use-other-packages-through-entry-points` | A package's own files import each other freely, other packages only through root files |
| `tests-use-entry-points` | Tests import any package's root files and their own `tests/` fixtures, never internals, their own included |
| `tests-folder-is-private` | Only tests import from a `tests/` folder |
| `no-circular` | No dependency cycles |

Several small entry points beat one barrel that re-exports a whole subtree. Layering (which package may depend on which) is a separate decision, left as a commented stub in the config. Add layering rules only when the repo has stated them.

## Steps

1. **Detect the environment.** Package manager from the lockfile (`pnpm-lock.yaml`, `yarn.lock`, `bun.lock`/`bun.lockb`, else npm). Packages root from `$ARGUMENTS`, else `src/packages` if `src/` exists, else `packages`; confirm with the user when the repo has another convention. Check for an existing `.dependency-cruiser.*`, and the installed TypeScript version (`npx tsc -v`).
   Done when the package manager, packages root, existing-config status and TypeScript version are known.
2. **Install** `dependency-cruiser` as a devDependency with that package manager. Run `npx depcruise --info` and check that `typescript` shows a check mark with a found version. dependency-cruiser supports a bounded TypeScript range (18.6 supports `>=2 <7`, and TypeScript 7 support waits on a stable compiler API). Outside the range it cruises zero `.ts` modules, prints a `missing-typescript-transpiler` warning and exits 0, so every check passes while checking nothing. If the repo's TypeScript is outside the range, stop and tell the user; don't wire up a check that cannot fail.
   Done when `dependency-cruiser` is in `devDependencies` and `--info` shows TypeScript as found and supported.
3. **Write the config.** Copy [assets/dependency-cruiser.config.cjs](assets/dependency-cruiser.config.cjs) to the repo root as `.dependency-cruiser.cjs` and set `PACKAGES_ROOT` (no trailing slash). Use `.cjs` so `module.exports` works in `"type": "module"` repos. If a config already exists, merge the rules and options into it instead of overwriting, and say what you added.
   Done when the config holds the five rules with the right `PACKAGES_ROOT`.
4. **Wire it into the checks.** Add a `lint:boundaries` script, `depcruise <source-root>`, where the source root (such as `src`) contains both the packages and the app code that imports them. Cruising only the packages folder never checks outside code, so the first rule can't fire. Run it from the same umbrella script that runs the type check (`check`, `ci`, `validate`). With no umbrella script, say so and name the CI step to add. Don't touch `tsconfig` or add path aliases.
   Done when `lint:boundaries` runs as part of the same command as the type check.
5. **Prove the rules bite.** This is the completion criterion; a config that never fails proves nothing.
   1. Run `lint:boundaries`. It must pass. If it fails on existing code, report the violations and ask before changing the code or the rules.
   2. Add a temporary deep import, for example from an app file or a package's `tests/` file into `<pkg>/lib/...`. Run again. It must fail, naming the matching rule.
   3. Revert the import and run once more. It must pass.

   `depcruise` exits with the number of `error`-severity violations, so a non-zero exit is the CI signal. If step 2 does not fail, the rules or the cruised root are wrong; fix that before finishing.
   Done when you have observed pass, fail on the deep import, pass.
6. **Document the convention.** Write a short `README.md` in the packages folder: the layout above, "import only through a package's root files", how to run `lint:boundaries`, and that barrels are discouraged. Add a one-line pointer to it from the repo's `CLAUDE.md` (or `AGENTS.md`, creating it if neither exists), such as `Packages are deep modules: read src/packages/README.md before adding or importing one.` That pointer is how later agents learn the rule before they break it.
   Done when the README exists and the agent-instructions file links to it.

Don't scaffold an example package unless the user asks; existing packages show the layout. If the repo has no packages yet, ask whether to create a copy-me `example/` package (an `index.ts` that delegates to `lib/impl.ts`, and a test that imports only `../index`), and use it for step 5.

## Gotchas

- Read the summary line, not only the exit code: `0 modules, 0 dependencies cruised` means the cruise saw nothing (wrong root, or an unsupported TypeScript), and it still exits 0.
- TypeScript drops imports whose bindings are unused or type-only, so dependency-cruiser would never see them. The config sets `tsPreCompilationDeps: true` so they count. Keep it, or a violation can hide behind an unused import.
- The rules use group matching: `$1` in `to.pathNot` refers to the first bracketed group in `from.path`. That is how a package reaches its own internals while outsiders can't. Don't flatten it into per-package rules.
- Packages are flat: one tier of directories under the root. Internals may nest as deep as needed, but a package may not contain another package.
- Public versus private is decided by depth, not folder names, so a new subfolder never needs a config change and adding an entry point is just adding a root file.
- `tsConfig.fileName` in the config points at `tsconfig.json`. In a repo whose root config is a solution file with `files: []`, point it at the config that owns the source, or path aliases won't resolve.
