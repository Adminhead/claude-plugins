# Module boundaries

Read this when the request is to enforce which files a package may import, to stop deep imports across packages, or to add dependency-cruiser to a TypeScript repo. Don't add the tool to a repo that didn't ask for it.

## The rule set

A package is one directory under a packages root, such as `src/packages/<name>/`. Its root files are its entry points, and every subfolder (`lib/`, `tests/`, anything else) is private. A package may expose several small entry points (`index.ts`, `client.ts`, `server.ts`), which beats one barrel that re-exports a whole subtree.

| Rule | Meaning |
| --- | --- |
| Entry-point boundary | Code outside a package, or in another package, imports only its root files |
| Intra-package freedom | A package's own files import each other freely |
| Tests through entry points | Tests import any package's root files and their own `tests/` fixtures, never internals, their own included |
| No cycles | No circular dependencies |

Layering, meaning which package may depend on which, is a separate decision. Add layering rules only when the repo has stated them.

## Setup

1. Detect the package manager from the lockfile and the packages root (`src/packages` if `src/` exists, otherwise `packages`). Confirm the root with the user when the repo has another convention.
2. Check for an existing `.dependency-cruiser.*` file. If one exists, merge the rules and options into it and say what you added.
3. Install `dependency-cruiser` as a devDependency. It supports a bounded range of TypeScript versions (it prints a notice when the installed `typescript` is newer than it supports), so check the notice before trusting results.
4. Copy [assets/dependency-cruiser.config.cjs](../assets/dependency-cruiser.config.cjs) to the repo root as `.dependency-cruiser.cjs` and set `PACKAGES_ROOT`. Use `.cjs` so `module.exports` works in `"type": "module"` repos.
5. Add a `lint:boundaries` script (`depcruise <source-root>`, such as `src`, the root that contains both the packages and the app code that imports them) and run it from the same umbrella script that runs the type check. With no umbrella script, say so and name the CI step to add. Cruise the source root and not the packages folder alone, or code outside the packages is never checked and the entry-point rule for outside code can't fire. Don't touch `tsconfig` or add path aliases.
6. Document the convention in a short `README.md` in the packages folder, and add a one-line pointer to it from the repo's `CLAUDE.md` or `AGENTS.md`. That pointer is what lets later agents find the rule before they break it.

Don't scaffold an example package unless asked. Existing packages show the layout.

## Prove the rules bite

A config that never fails proves nothing. After setup:

1. Run `lint:boundaries` and confirm it passes.
2. Add a deep import (for example from a test or app file into `<pkg>/lib/...`) and confirm the run fails with the matching rule name.
3. Revert the import and confirm it passes again.

`depcruise` exits with the number of `error`-severity violations, so a non-zero exit is the signal for CI.

## Traps

- With the default analysis, TypeScript drops imports whose bindings are unused, and dependency-cruiser never sees them. The config sets `tsPreCompilationDeps: true` so type-only and unused imports count. Keep it, or a violation can hide behind an unused import.
- Rules use group matching: `$1` in `to.pathNot` refers to the first bracketed group in `from.path`. That is how a package reaches its own internals while outsiders can't. Don't flatten it into per-package rules.
- A package may not contain another package. The rules assume one flat tier under the root.
- Path-depth rules are extension-agnostic, so adding a new subfolder never needs a config change.
