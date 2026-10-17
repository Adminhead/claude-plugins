# Batch js report

## Plugins created

All are single-skill plugins, version 0.1.0, author AdminHead, with no `dependencies`.

| Plugin | Type | Description (exactly as in plugin.json) | Sources | Deps |
| --- | --- | --- | --- | --- |
| `javascript` | S | Covers JavaScript runtime semantics, meaning ESM vs CommonJS, import side effects, promises and the event loop, async cleanup and cancellation, browser vs Node/Bun/Deno/edge, measured performance and JS tests. Use when writing, reviewing or debugging *.js/*.mjs/*.cjs or runtime behavior of JS/TS code (import errors, unhandled rejections, leaks, ordering bugs). | archive coding-js/javascript (+ references/performance.md) | none |
| `typescript` | S | Handles TypeScript type-level and compiler work, covering tsconfig strictness, narrowing, generics, discriminated unions, declarations and module resolution, public type APIs, runtime validation of unknown data, and type tests. Use when editing *.ts/*.tsx types or tsconfig.json, or fixing tsc errors. | archive coding-js/typescript; references/advanced-types.md (the archive's version, already derived from wshobson typescript-advanced-types, MIT, now attributed and trimmed); tsconfig-selection steps from ECC typescript-reviewer | none |
| `ts-module-boundaries` | S (manual, `disable-model-invocation`) | Sets up dependency-cruiser in a TypeScript repo so each package is reachable only through its root entry-point files, with no deep imports and no cycles, then proves the rules fail on a violation. Use when the user asks to enforce package boundaries, stop deep imports or add dependency-cruiser. | mattpocock setup-ts-deep-modules (MIT) + archive typescript/references/module-boundaries.md and assets/dependency-cruiser.config.cjs | none |
| `prisma` | S | Prisma ORM 6 and 7 traps for TypeScript backends, such as updateMany returning a count, interactive transaction timeouts, migrate dev resets, edited applied migrations, undefined filters, P2002/P2025/P2003 handling, serverless connections and driver adapters. Use when writing a Prisma schema, query, transaction or migration, or debugging one. | ECC prisma-patterns (MIT), rewritten against the Prisma docs; + references/prisma-7.md | none |
| `click-path-audit` | S | Audits UI event handlers for behavior bugs. It maps each state action's side effects, then traces every handler call in order to find sequential undo, async races, stale closures, dead paths and effects that reset what a click just set. Use when a button does nothing or leaves the wrong state though each function works alone, or after a shared-state refactor. | archive coding-js/click-path-audit (+ references/patterns.md); ECC attribution added | none |

LICENSE files: `typescript` (wshobson MIT), `ts-module-boundaries` (Matt Pocock MIT), `prisma` and `click-path-audit` (ECC MIT). `javascript` has no third-party upstream, so it has no LICENSE.

## Validation and tests

- `claude plugin validate --strict plugins/<name>` passes for all five.
- `.claude/skills/skill-authoring/scripts/validate_skill.py` reports all five skills valid.
- Grep for `codegraph`, `claude-mem`, `coding-core:`, `coding-js:`, `github:`, `testing:`, `web:` and `Efficient ` finds nothing.
- `typescript/references/advanced-types.md`: every code block was extracted and compiled with `tsc --strict` 7.0.2, together with added assertions (distribution, `ToNumber`, `Split`, `Getters`, `OnlyKeysOf`, `NoInfer` rejection, route-client body rejection). It exits 0.
- The `ts-module-boundaries` config was exercised in a scratch project with dependency-cruiser 18.6.0 and TypeScript 6.0.3:
  - A clean run passes.
  - A type-only deep import from app code fails with `outside-code-uses-entry-points` (exit 1).
  - A test importing its own `lib/` fails with `tests-use-entry-points`.
  - The run passes again after the revert.
- Evals: `plugins/click-path-audit/evals/click-path-audit-vs-react/` was moved from the archive, as the coordinator asked. Its graders now match `click-path-audit:click-path-audit` and, in the `not-react` grader, `react:react`. The eval was not run (`claude plugin eval` costs model runs).

## Deviations from the plan

- **typescript:** the module-boundaries reference and the dependency-cruiser asset moved out of `typescript` into the new `ts-module-boundaries` plugin, so they don't ship twice. `typescript` now points to `/ts-module-boundaries:ts-module-boundaries`.
- **typescript:** `advanced-types.md` was not re-ported from wshobson. The archive already holds a condensed version (event emitter and route client recipes, no "prefer interface" rule). It was trimmed to 98 lines (the utility-type table became a two-line "Newer helpers" note) and given the wshobson attribution. The version line now says TS 7.0, because 7.0.2 is npm `latest`.
- **ts-module-boundaries:** unlike mattpocock's version, it does not scaffold an example package unless the user asks or the repo has no packages. It adds a fifth rule, `tests-folder-is-private`, from the archive's config, and adds a TypeScript-version gate (below).
- **prisma: claims in ECC's skill that I corrected.**
  - **`relationJoins`:** "Prisma 5 uses JOIN by default" is wrong. It is a preview flag (PostgreSQL, CockroachDB, MySQL), and `join` is the default only once the flag is on.
  - **Edited applied migrations:** "P3006 checksum mismatch on deploy" is wrong. P3006 is a shadow-database apply failure. `migrate dev` demands a reset, while `migrate deploy` only warns and does not re-run the edited migration.
  - **`@updatedAt`:** "does not fire on updateMany" is wrong. The engine sets it on `updateMany`: the query log in prisma/prisma#6732 shows `SET "updatedAt"`, and the nested case was fixed in 2.29 (#8265). The trap is now "Prisma-side only": raw SQL, other writers and triggers leave it stale, and an empty update leaves it unchanged.
  - **Bulk writes:** I added `updateManyAndReturn`/`createManyAndReturn` (6.2+, PostgreSQL, CockroachDB, SQLite) as the fix for the count-only return.
  - **New trap:** an `undefined` filter matches every row, and `strictUndefinedChecks` (preview since 5.20) turns it into an error.
  - **Transactions:** I added the defaults (`maxWait` 2000 ms, `timeout` 5000 ms) and P2028.
- **prisma: version scope.** Prisma ORM 8 is a release candidate with a completely different API (`@prisma/orm-postgres`, `contract.prisma`, no P-codes), and an unpinned `npx prisma` now fetches the v8 CLI. The skill is scoped to 6 and 7 and warns about this. Dropped from ECC: the ID-strategy table, the schema-defaults block, the expand-contract shell walk-through and the related-skills list.

## What I checked (version-sensitive facts)

- **Prisma**, via Context7 `/prisma/web` and the raw docs in github.com/prisma/web:
  - the v7 upgrade guide;
  - the v7 transactions, crud, relation-queries, connection-pool, development-and-production, schema-reference and error-reference pages;
  - the `orm/release-status` page (Prisma 8 RC, `@prisma/client` 7.10.1, Prisma 6 security patches until 19 Nov 2026);
  - `coming-from-prisma-orm-7`.
- **TypeScript:** npm dist-tags (`latest` 7.0.2). `typescript@7.0.2` exports no classic compiler API.
- **dependency-cruiser:** npm 18.6.0 has `supportedTranspilers.typescript` of `>=2.0.0 <7.0.0`. In the scratch project with TypeScript 7 installed, `depcruise src` cruised 0 modules, printed `missing-typescript-transpiler` and exited 0, even with a deep import present. So in a TS 7 repo the check passes silently. The skill now gates on `depcruise --info` and tells Claude to stop rather than wire up a check that cannot fail. A side install with `npx -p dependency-cruiser -p typescript@6` did not work around it.
- **Not verified (wording hedged or left out):**
  - whether `tsc -b --noEmit` is supported, and from which version. I dropped the claim.
  - `prisma format --check`. I dropped the flag.
  - the status of the MySQL `updateMany` predicate bug (prisma/prisma#28840). The GitHub API was rate-limited, so I left it out.

## Follow-ups

- Once the coordinator registers the plugins, run `claude plugin eval plugins/click-path-audit`.
- Add trigger evals for `prisma` (should-trigger: a transaction timeout; near-miss: a raw `pg` query), for `typescript` vs `javascript`, and for `ts-module-boundaries` (manual, so check that it never auto-fires).
- Recheck the `ts-module-boundaries` TS 7 gate when dependency-cruiser adds TypeScript 7 support.
- Recheck the `prisma` Prisma 8 note after 8.0 GA (expected around October 2026). A separate `prisma-8` skill or reference may be warranted if repos adopt it; upstream also mentions a `prisma-8` skill.
- `node-typescript-meta` lists `javascript` and `typescript`. `ts-module-boundaries`, `prisma` and `click-path-audit` are direct installs per the plan.
