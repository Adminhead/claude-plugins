# G3a language, web and testing skills, 2026-11-14

Scope: bash, golang, golang-cli, golang-performance, python, python-packaging, fastapi, rust, javascript, typescript, ts-module-boundaries, react, vue, vite, tanstack, web-development, prisma, unit-testing, test-run, test-gap-audit, e2e-testing, playwright-cli, termwright (23 plugins). Read-only. Every SKILL.md read in full; references read in full for golang (modernize, pitfalls, debugging), golang-cli (viper), python (review-checklist), prisma (prisma-7), react (react-19-upgrade, head of server-and-forms), vue (nuxt), e2e (flake-triage), unit-testing (pytest, head of vitest), playwright-cli (safety-cleanup, pw.sh), termwright (daemon, head of steps), tanstack (packages), web-development (api-contract-review). Other references only skimmed (marked where it matters).

Checks run: `uv run --with pytest pytest tests` in test-run (69 passed), in test-gap-audit (9 passed), `bash playwright-cli/.../tests/pw-spec.sh` (ok). Local lookups (read-only): `go version` is 1.27.4, `go doc strings.CutLast` and `go doc -all runtime/pprof` show `CutLast` and the `goroutineleak` profile. `npm view` for dist-tags. `command -v`: `playwright-cli` is `/usr/bin/playwright-cli` (0.1.24), `termwright` is `~/.cargo/bin/termwright` (0.2.0); `bats` is not installed; `uv` is 0.13.8.

## Summary

- Verdict counts: KEEP 7 (bash, golang-cli, ts-module-boundaries, vite, test-run, playwright-cli, termwright), KEEP-FIX 7 (golang, golang-performance, python-packaging, vue, prisma, unit-testing, test-gap-audit), SLIM 6 (python, fastapi, rust, typescript, react, e2e-testing), DEPRECATE 3 (javascript, tanstack, web-development), MERGE 0.
- Strongest plugins are the ones that wrap a tool or hold verified, version-fresh facts: playwright-cli (allowlist wrapper over a real CLI), termwright (real CLI on PATH, quirks tested against the binary), test-run and test-gap-audit (scripts with passing tests), prisma and vite (traps and Vite 8 / Prisma 7 changes), golang-cli (viper traps).
- The Generic test hits hardest on javascript, web-development, tanstack, and most of python, rust, typescript, react, e2e-testing, fastapi. Their SKILL.md bodies are 80 to 100 lines of "state ownership, keys, effects, wait on conditions, no `any`" that Sonnet 5.5 follows without help. Their listing cost is paid in every web/node session (52 and 40 sessions) with 0 calls.
- [high] Testing-cluster collision is still open (V31). `unit-testing` still claims "which tests should I run?" and "is this change covered?" (`unit-testing/skills/unit-testing/SKILL.md:3`) while `test-gap-audit` claims "is our test coverage enough?" (`test-gap-audit/skills/test-gap-audit/SKILL.md:3`). Both are in `programming-core`. The model-visible description of `unit-testing` is 623 characters, the longest in the group, and 217 listing tokens, nearly twice any sibling. `test-run` is manual-only, so the "which tests to run" request can only reach `unit-testing`, which has no script.
- [high] The two "measured" lifts in the group (`react` stance-react-measure-first 1/0, `unit-testing` testing-observable-behaviour 1/0) are probably confounded. Each case carries a `tool_used Skill` grader (`react/evals/stance-react-measure-first/graders/fires-skill.md`, `unit-testing/evals/testing-observable-behaviour/graders/fires-unit.md`) that cannot pass in the no-plugin arm, so the 0 can come from that grader alone. UNVERIFIED because I did not run evals; see Cross-plugin findings.
- A7 landed and holds: `run_tests.py` rejects `--cmd`, `run_custom.py` is outside `allowed-tools`, `pw.sh` is the only pre-approved playwright-cli entry point. V13 and V14 are FIXED.
- Version-gap findings from 10-23 are all still open: python 3.14, rust edition and `#[expect]`, javascript `require(esm)`, TypeScript 6/7, golang-performance Green Tea GC. These are exactly the post-cutoff facts that would earn these skills their place, and none is present.

## Prior findings re-checked

| Prior finding (source) | Status | Evidence |
| --- | --- | --- |
| V13 test-run grant plus `--cmd` runs any command (plan V13, G3 med) | FIXED | `test-run/skills/test-run/SKILL.md:6` grants only `run_tests.py *`. `scripts/run_tests.py:72-73` errors "--cmd is not accepted here: use run_custom.py". `scripts/run_custom.py` exists. 69 tests pass. |
| V14 playwright-cli `Bash(playwright-cli *)` covers run-code and state-save (plan V14, G3 med) | FIXED | `playwright-cli/skills/playwright-cli/SKILL.md:4` grants only `pw.sh *`. `scripts/pw.sh:35-41` verb allowlist, `:56-62` rejects `--config`, `--cdp*`, `--profile*`, `--persistent*`. `tests/pw-spec.sh` prints ok. |
| A7 narrow test-run and playwright-cli grants (plan A7) | FIXED | Both versions at 0.2.x as planned (data tsv: test-run 0.2.0, playwright-cli 0.2.1). |
| V31 / G3 high: unit-testing vs test-gap-audit trigger collision, no paired suite | STILL OPEN | Phrases above still overlap. `unit-testing/evals/trigger-testing-2/prompt.md` ("Which tests should I run and is there anything I need to add?") is gap-audit shaped. No `evals/testing/` suite exists (only `evals/{jvm,android,forges,...}`). |
| G3 high: sibling `not-*` graders in single-plugin suites can never fail | FIXED | No `not-<sibling>` graders remain in bash, golang*, vite, e2e, unit-testing, test-gap-audit. What remain are `not-e2e` (e2e route-adhoc) and `not-unit` (unit-testing testing-vs-e2e-browser), which are real negatives. Cost: the paired boundary is now untested (see collision section). |
| G3 high: 15 of 34 plugins have no evals | STILL OPEN | In this family 14 of 23 have no eval dir: python, python-packaging, fastapi, rust, javascript, typescript, ts-module-boundaries, vue, tanstack, web-development, prisma, test-run, playwright-cli, termwright. |
| G3 med: version guidance behind (python 3.14, rust edition, js require(esm)/type stripping, ts 6/7, golang-performance Green Tea) | STILL OPEN (all five) | grep finds no `3.14`/`annotationlib` in `python/skills`, no `edition` or `#[expect` in `rust/skills`, no `require(esm)` or type stripping in `javascript`, no TS 6/7 deprecations in `typescript/skills` (only `typescript/skills/typescript/references/advanced-types.md:3` says it was checked on tsc 7.0.2), and `golang-performance/references/runtime-tuning.md:32` mentions only the 1.27 allocator. |
| G3 med: Prisma 8 claim (`prisma/SKILL.md:15-16`) unverified | PARTLY | `npm view prisma dist-tags`: `latest` = 8.0.0-rc.33, `next` = 8.0.0-rc.10, `prev` = 7.10.1. So an unpinned `npx prisma` does fetch 8 today, as the skill says. The skill never says 8 is a release candidate. The "TypeScript rewrite, `contract.prisma`, no P2xxx" details remain UNVERIFIED. |
| G3 med: Go 1.27 claims unverified (`golang/references/modernize.md:34,44-45`, `debugging.md:14`) | PARTLY | Local Go 1.27.4: `strings.CutLast` exists, `goroutineleak` profile exists in `runtime/pprof` docs. json/v2-backed `encoding/json`, removed godebug keys and the `stdversion` vet default remain UNVERIFIED. |
| G3 med: Vite 8 `manualChunks` object removal (`vite/SKILL.md:40`) | PARTLY | `npm view vite version` = 8.3.8, so Vite 8 is real and `rolldownOptions` renames are plausible. The `manualChunks` object removal and `codeSplitting.groups` shape are not checked (needs source check). |
| G3 med: Pinia 4 (`vue/SKILL.md:13`) | PARTLY | `npm view pinia` latest = 4.1.0, so Pinia 4 exists. "ESM-only, Vue 3.5.11 or later" UNVERIFIED. |
| G3 low: uv "0.13.1" unverifiable (`python-packaging/.../uv.md:3`) | FIXED | `uv --version` is 0.13.8 and `pip index versions uv` lists 0.13.1. |
| G3 med: hard-coded dates | STILL OPEN | `golang-cli/SKILL.md:12` ("as of 2026-10"), `termwright/SKILL.md:10` ("as of 2026-10-17"), `prisma/references/prisma-7.md:3` ("October 2026") and `:77` (1 December 2026 retirement, 17 days from today). |
| G3 med: committed suites use `runs: 1`, five cases lack `model:` | STILL OPEN | All 17 cases in this family have `runs: 1`. No `model:` in `e2e-testing/evals/route-adhoc-browser-not-e2e`, `route-e2e-vs-unit`, `unit-testing/evals/testing-vs-e2e-browser`, `testing-vs-e2e-unit`. |
| G3 low: dependency-cruiser config interpolates `PACKAGES_ROOT` unescaped | STILL OPEN | `ts-module-boundaries/skills/ts-module-boundaries/assets/dependency-cruiser.config.cjs:7-11`. |
| G3 low: `golang/SKILL.md:10` routes to golang-cli and golang-performance without "if installed" | STILL OPEN | `golang/skills/golang/SKILL.md:10,73`. `golang-meta` does not install them. |

## Per-plugin

### bash — KEEP (medium)
- Value: K-decision, with textbook parts. The strict-mode hole table (`bash/skills/bash/SKILL.md:25-33`) is the decision-changing part, but most rows are well known (SC2155, `((x++))`). Haiku does miss `local x=$(cmd)` and `! cmd` under `-e`; Sonnet 5.5 rarely does.
- Evidence: 49 listed, 8 loads in 4 sessions (used). In `iac-meta`, the owner's daily stack, and shell work is frequent there. 1 trigger eval, no outcome eval.
- Generic examples: "Quote every expansion" (`:39`), "Use `[[ ]]` in Bash" (`:47`), "Print data with `printf '%s\n'`" (`:46`), "Use `mktemp`" (`:43`).
- Commonly-wrong examples: `local x=$(cmd)` replaces the status (`:28`), `inherit_errexit` for command substitution (`:30`), background job failures never trip `-e` and bare `wait` returns 0 (`:33`), trap variable named `TMPDIR` (`:42`).
- Fixes: [med] no outcome eval; add `bash-strict-holes` (scaffold with `local x=$(cmd)` and `((n++))`, `not_contains` regexes). [low] `references/bats.md` (140 lines) for a tool not installed here (`command -v bats` empty); fine as reference but cut to what differs from bats docs if trimming is wanted.

### golang — KEEP-FIX (medium)
- Value: K-decision plus fresh facts. `references/modernize.md:26-34` is a version table through Go 1.27 that models trained before mid-2026 lack. Local Go 1.27.4 confirms `strings.CutLast` and the `goroutineleak` profile.
- Evidence: 29 listed, 4 loads, 3 sessions (chosen when listed). Used by golang-meta. 2 trigger cases only.
- Generic examples: "Accept interfaces and return structs" (`golang/SKILL.md:31`), "Take `ctx context.Context` as the first parameter" (`:43`), "Check every returned error" (`:52`), the nil-map/slice table (`references/pitfalls.md:10-15`).
- Commonly-wrong or post-cutoff examples: "Don't use an API newer than the module's declared `go` version" (`:15`), `errors.AsType` on 1.26+ (`:54`), `WaitGroup.Go` 1.25, `new(expr)` 1.26, `goroutineleak` profile 1.27 vs `GOEXPERIMENT=goroutineleakprofile` on 1.26 (`references/debugging.md:14`), "unreferenced timers are collected from 1.23" (`pitfalls.md:46`).
- Fixes: [med] add the Green Tea GC default (1.26) to `golang-performance/references/runtime-tuning.md`, and mention it in golang where GC is touched. [low] `SKILL.md:10,73` say "if installed" for golang-cli and golang-performance. [low] verify the unverified 1.27 rows (`modernize.md:34,40,44-45`) with `go doc`/release notes. [med] add `go-version-gate` outcome case (go.mod `go 1.21`, tempting range-over-func).
- If SLIM later: `SKILL.md` Context/Errors/APIs sections (~45 lines) are textbook. Not recommended while it is chosen in 3 sessions.

### golang-cli — KEEP (medium)
- Value: K-private-ish. `references/viper.md` records behaviors "run against viper 1.21.0": `viper.ConfigFileNotFoundError` is a value type so `errors.As` with a pointer target "compiles and never matches" (`viper.md:45`), `AutomaticEnv` keys absent from `AllSettings()`/`Unmarshal` (`:26`), `UnmarshalKey` ignores env overrides (`:52`). These are commonly wrong and checkable.
- Evidence: not in any meta, 0 sessions listed (absence of evidence). 1 trigger case.
- Generic examples: "Return errors, don't exit" (`golang-cli/SKILL.md:20`), "Write output to the command's writers" (`:21`), `Run` vs `RunE` (`:84`).
- Fixes: [low] `SKILL.md:12` hard-coded "as of 2026-10", move to "re-check against go.mod". [med] add `cli-required-flag-env` outcome case.

### golang-performance — KEEP-FIX (low)
- Value: K-decision (measure first, benchstat discipline, `fgprof` for off-CPU) is mostly known to Sonnet; the references (`benchstat.md`, `pprof.md`, `compiler-analysis.md`) carry concrete commands. Consider MERGE into `golang` if listing cost matters, since the description routes away from golang constantly.
- Evidence: 1 listed, 0 calls. 1 trigger case.
- Generic examples: "Optimizing before profiling" (`SKILL.md:34`), "Treating one benchmark run as evidence" (`:35`), "Benchmarking a toy input" (`:39`).
- Commonly-wrong examples: "Rerunning until a result turns significant... selection bias" (`:36`), compare only on the same toolchain because allocator changes (`:10`), `runtime-tuning.md:32` 1.27 size-specialized allocation.
- Fixes: [med] add Green Tea GC (default from 1.26, `GOEXPERIMENT=nogreenteagc` opt-out) to `references/runtime-tuning.md`. [low] unverified "unhandled op DEFER" (`compiler-analysis.md:29`) and 1.27 map memory (`patterns.md:15`). [med] add `perf-no-profile` stance case.

### python — SLIM (medium)
- Value: mostly Generic. Without it Sonnet writes `raise ... from err`, `with` blocks, `TaskGroup`, avoids `except Exception: pass` and mutable defaults.
- Evidence: 9 listed, 0 calls, no evals.
- Generic examples: "Never use mutable default arguments" (`python/SKILL.md:28`), "Chain with `raise NewError(...) from err`" (`:41`), "Use `with` / `async with` for files, locks, sessions" (`:43`), the whole review checklist (`references/review-checklist.md:5-66`, for example "No `except Exception: pass`", "Every coroutine call is awaited").
- Commonly-wrong or fresh examples: "keep a reference to any bare `create_task` result, since the loop holds only a weak one" (`:53`), `ruff --unsafe-fixes` only after `--diff` (`:67`), `python -X dev` / `-W error::ResourceWarning` (`:69`), `PYTHONASYNCIODEBUG=1` (`:69`), "Run tools through the project's runner" (`:15`). No 3.14 content (PEP 649, free-threaded, `python -m asyncio ps`, t-strings), which is where post-cutoff value would sit.
- Fixes: [med] add a short Python 3.14/3.15 gotcha block (verify first; see Needs source check). [med] cut `review-checklist.md` and the Design/Types/Exceptions sections down to what the model gets wrong; target about 40 lines plus `async.md` and `reliability.md`. [low] duplicate pytest guidance with `unit-testing/references/pytest.md`: have one point to the other.
- Lost on SLIM: Haiku reminders on context managers and exception chaining. If an `py-async-blocking` outcome case shows no lift over baseline, deprecate instead.

### python-packaging — KEEP-FIX (medium)
- Value: K-decision with real fresh facts. `references/uv.md` covers `--locked` vs `--frozen`, `uv audit`, release cooldown, PEP 723, `[dependency-groups]` (PEP 735); `release-publishing.md` covers OIDC trusted publishing.
- Evidence: 1 listed, 0 calls, no evals (python-meta member).
- Generic examples: "`[project].dependencies` holds only what every installation imports" (`SKILL.md:24`), "Never hand-edit" lockfile (`:27`), `unzip -l dist/*.whl` (`:42`).
- Commonly-wrong examples: load package data with `importlib.resources.files`, not `__file__` (`:34`), validate sdist by building a wheel from the unpacked sdist (`:52`), `id-token: write` only on publish job.
- Fixes: [low] `references/release-publishing.md:35` pins `python-version: "3.12"` in the example; say "use the project's version". [med] add `pkg-data-missing` outcome case. Resolved: uv 0.13.1 claim is fine (uv 0.13.8 current).

### fastapi — SLIM (medium)
- Value: part K-decision. The Tests section (`fastapi/SKILL.md:68-76`) holds the facts models get wrong, and the rest is general backend practice.
- Evidence: not in any meta, 0 listed, no evals.
- Generic examples: "Keep request and response models separate" (`:41`), "A handler binds inputs, calls the service" (`:50`), "Authorize the action and resource before any durable mutation" (`:59`), the whole Transactions section (`:61-66`).
- Commonly-wrong examples: `dependency_overrides` keyed by the original callable, so a lambda wrapper breaks it (`:34`), bare `TestClient(app)` does not run lifespan but `with TestClient(app)` does, and `ASGITransport` never does (`:73-74`), `Base.metadata.create_all` in lifespan races deploys (`:28`), sync `def` handlers run in a threadpool so blocking there is safe (`:51`), JWT `sub` is a string (`:58`).
- Fixes: [med] SLIM to about 45 lines: Lifespan, Dependencies, PATCH `exclude_unset`, pagination tiebreaker, Tests. [low] description opens with a noun phrase (`:3`). [med] add `fastapi-override-identity` outcome case.
- Lost: structured reminders for Haiku on layering. Sonnet/Opus lose almost nothing.

### rust — SLIM (medium)
- Value: Generic. The skill is a clean restatement of the Rust book plus clippy defaults.
- Evidence: 9 listed, 1 load, 1 session. No evals. In `rust-meta`.
- Generic examples: "Take `&T`/`&str`/`&[T]` when the callee only reads" (`rust/SKILL.md:30`), "Use `Result` for expected failures" (`:37`), "Let elision handle lifetimes" (`:32`), the Decision defaults table (`:86-92`).
- Commonly-wrong or fresh examples: "Don't hold a `std::sync::Mutex` guard across `.await`" (`:48`), `cargo +nightly miri test` and say when Miri is missing (`:56`), `// SAFETY:` on every block (`:55`). Missing: `edition` check, 2024-edition changes (`unsafe extern`, `unsafe_op_in_unsafe_fn`, let chains), `#[expect(lint, reason)]` instead of `#[allow]` (`:82` says only "don't `#[allow]`").
- Fixes: [med] SLIM to about 40 lines (Async, Unsafe, Validate, Orient incl. edition); [med] add edition and `#[expect]` facts after source check. [low] outcome case `rust-mutex-await`.

### javascript — DEPRECATE (Generic) (medium)
- Value: Generic. The body is JS semantics Sonnet 5.5 holds: `===`, `??` vs `||`, `Promise.all`, "don't create a floating promise in a loop".
- Evidence: 52 listed, 0 calls (also 0 loads), no evals. The description claims "runtime behavior of JS/TS code" and collides with typescript and react on `.tsx`.
- Generic examples: "Use `===` for exact comparison. Use `??` / `?.` only when..." (`javascript/SKILL.md:23`), "Run independent awaits in parallel with `Promise.all`" (`:42`), "Await every promise, and assert results or rejections explicitly" (`:59`), "Restore globals, env vars, module caches, timers" (`:60`).
- Commonly-wrong/post-cutoff: ESM imports hoisted (`:30`), `{ cause }` and `{ signal }` on `addEventListener` (`:38-39`). The one place with real post-cutoff value is missing: "Don't mix `require` and `import` ... without the runtime's documented interop" (`:28`) never names `require(esm)` (Node 20.19+/22.12+) or native type stripping, so it does not help with `ERR_REQUIRE_ESM`.
- Fixes: if kept, [med] replace the body with a 20-line "Node module and runtime facts" card (require(esm), type stripping, `exports`/`type`, the "which runtime" step at `:12-18`), after source check. [low] narrow the description off `.tsx`.
- What is lost on DEPRECATE: Haiku reminders on async ownership; the ESM/CJS diagnosis checklist (`:31`) and the runtime-first step. Move those two items to `typescript`. node-typescript-meta then depends on `typescript` alone.

### typescript — SLIM (medium)
- Value: mostly Generic, with some K-decision and a plugin-private fact (TS 7 usage elsewhere).
- Evidence: 52 listed, 1 call in 1 session, no evals. Owner's stack is TypeScript, so a skill is plausible, but usage shows it is rarely chosen.
- Generic examples: "Use discriminated unions for variants" (`typescript/SKILL.md:34`), "Use `satisfies`... `as const`" (`:44`), "Make `switch` statements over maintained unions exhaustive with a `never` check" (`:51`), "Avoid `any`" (`:45`).
- Commonly-wrong examples: a root `tsconfig` that is a solution file with `files: []` checks nothing, so pick the owning config (`:81`), `tsc -b` emits outputs and `.tsbuildinfo` (`:82`), `tsc --traceResolution` / `--explainFiles` (`:90`).
- Fixes: [med] SLIM to the Orient, Modules and declarations, Validate and Diagnosing sections (about 45 lines). [med] add TS 6/7 deprecation block (options removed in 7, compiler-API tools not running on 7; see Needs source check): `npm view typescript` shows `latest` 7.0.2, so TS 7 is the current default for new installs and the skill is silent. [low] description "editing *.ts/*.tsx types" fights react; narrow to type-level and tsconfig. [low] `:72` points to `/ts-module-boundaries:...` correctly.

### ts-module-boundaries — KEEP (high)
- Value: Tooling plus K-decision. A shipped config (`assets/dependency-cruiser.config.cjs`), and a "prove it bites" procedure (pass, add deep import, fail, revert) that guards against `0 modules cruised` exiting 0 (`ts-module-boundaries/SKILL.md:37,57`). Manual-only, so no listing cost.
- Evidence: 0 sessions listed (manual), 0 loads, no evals. Installed nowhere by a meta (typescript refers to it). Absence of evidence.
- Fixes: [low] escape `PACKAGES_ROOT` before interpolating into regexes (`assets/dependency-cruiser.config.cjs:7-11`). [low] `npm view dependency-cruiser version` is 18.7.2 while the skill cites 18.6 supporting `>=2 <7` (`SKILL.md:37`); re-check the TS range given TS 7.0.2 is `latest`. [low] add the one outcome case (slash command, scaffold with `src/packages/{a,b}`).

### react — SLIM (medium)
- Value: K-decision in one place (measure first), fresh facts in the references, generic elsewhere.
- Evidence: 40 listed, 0 calls, 0 loads. Only outcome eval is the stance case (1/0, likely confounded; see Cross-plugin).
- Generic examples: "Derive values from props and state during render. Do not store a second copy" (`react/SKILL.md:30`), "Never use the index when items can be inserted, removed, reordered" (`:38`), "Include every reactive value the effect reads in its dependencies" (`:56`), "Every interactive control needs an accessible name" (`:62`).
- Commonly-wrong or fresh examples: "Add no `memo`, `useMemo`, `useCallback`... until there are numbers" (`:81`) and "If the React Compiler is enabled, manual memoization is usually redundant" (`:83`), "StrictMode still double-invokes effects in React 19, so don't lower effect-count assertions" (`:74`, `references/react-19-upgrade.md:25`), "Server Function arguments are fully client-controlled" (`references/react-server-and-forms.md`), `act` moves from `react-dom/test-utils` to `react` (`react-19-upgrade.md:23`).
- Fixes: [med] SLIM `SKILL.md` to about 50 lines: Before editing, Performance stance, pointer table to the 7 references. Drop State ownership, Component contract, Effects and Accessibility bodies (about 45 lines), since `web-development` and the model cover them. [low] description claims ".tsx/.jsx behavior", which collides with typescript and javascript. [med] fix the eval so the baseline arm is not scored on `fires-skill`.
- Lost: Haiku-level effect and key reminders; the stance still stays.

### vue — KEEP-FIX (medium)
- Value: K-private-ish fresh facts. Vue 3.5 reactive props destructure and `onWatcherCleanup` (`vue/SKILL.md:37,51`), Nuxt 4 `data` is a `shallowRef` and defaults to `undefined` (`references/nuxt.md:15`), `app/` srcDir, Pinia setup stores. These are the Nuxt 4 / Vue 3.5 deltas models trained earlier get wrong.
- Evidence: 9 listed, 1 load, 1 call (chosen). Not in any meta. No evals.
- Generic examples: "Give `v-for` a stable domain key" (`:58`), "Do not put `v-if` and `v-for` on one element" (`:59`), "Prefer `computed` for derived values" (`:49`).
- Fixes: [med] verify "Pinia 4 is ESM-only and needs Vue 3.5.11 or later" (`:13`); Pinia 4.1.0 exists. [med] trim Templates and State ownership (about 25 lines). [med] add `vue-destructured-props` and `vue-pinia-storeToRefs` cases.

### vite — KEEP (medium)
- Value: K-private (post-training). Vite 8 moved to Rolldown/Oxc: `build.rolldownOptions`, `oxc.*`, `codeSplitting` (`vite/SKILL.md:14,40`), changed default `build.target` browser versions (`:37`), the CJS interop change and `legacy.inconsistentCjsInterop` (`:15`). `npm view vite` is 8.3.8, so Vite 8 is real and current.
- Evidence: 40 listed, 1 call (chosen when relevant). In web-meta. 1 trigger case.
- Generic examples: "Vite transpiles TypeScript and does not type-check" (`:23`), "Only variables whose names start with `VITE_` reach client code" (`:28`), proxy options (`:64`).
- Commonly-wrong/post-cutoff examples: "`loadEnv(mode, envDir, '')` loads every variable... A value copied into `define` is inlined into the bundle" (`:30`), `server.allowedHosts` for non-localhost names (`:65`), `vite:preloadError` for stale chunks (`:45`), "Vite 8 removed the object form of `manualChunks`" (`:40`).
- Fixes: [med] source-check `:37` target versions and `:40` manualChunks (needs source check list). [low] `:38` oxc/esbuild minify defaults, same check. [med] add `vite-env-leak` outcome case.

### tanstack — DEPRECATE (Generic) (low)
- Value: Generic. The skill's own stance is "look up every API in the docs" (`tanstack/SKILL.md:25,84`), so it carries almost no facts. The rest is ownership guidance Sonnet follows: query keys include every input, no duplicate QueryClient, server pagination is not client sort.
- Evidence: 21 listed, 0 calls, no evals, not in any meta. `references/packages.md` is "Read when / Verify / Test" bullets with no API content.
- Generic examples: "Keys must be stable and serializable, and include every input that changes the result" (`:41`), "Keep one QueryClient and one router per application boundary" (`:50`), "Never mix server pagination with client-side sort or filter over a partial page" (`:44`).
- Commonly-wrong examples: `ensureQueryData` in the loader plus `useSuspenseQuery` in the component (`:40`), never hand-edit `routeTree.gen.ts` (`:51`). That is about it.
- Alternative if the owner disagrees: SLIM to a 25-line "traps" card (the two above plus Start boundary) and drop the references. Deprecation loses nothing for Sonnet/Opus; Haiku loses the loader/component double-fetch warning.

### web-development — DEPRECATE (Generic) (medium)
- Value: Generic, with overlap. A nine-section checklist for forms, server validation, responsive CSS and CWV.
- Evidence: 40 listed, 0 calls, 0 loads, no evals. In web-meta. Description claims "an HTTP API contract change" (overlaps `api-rest-design`) and "a form, page or flow" (overlaps react, e2e).
- Generic examples: "Give every control a visible or programmatic label" (`web-development/SKILL.md:47`), "Treat every browser value as untrusted" (`:56`), "Map each expected outcome to a stable status and body" (`:64`), the 401/403/404/409 list (`references/api-contract-review.md:6`).
- Commonly-wrong/fresh examples: WCAG 2.2 SC 3.3.7 Redundant Entry (`:51`), CWV thresholds LCP 2.5 s, INP 200 ms, CLS 0.1 and that TTFB is not a Core Web Vital (`:81`), `svh`/`dvh` and container-query pitfalls (`references/responsive-css.md`, skimmed), stale-response abort (`:67`).
- Fixes (if kept): [med] drop sections 4-7 (about 35 lines); keep 8 and `responsive-css.md`. [low] remove the API-contract claim from the description.
- What is lost: the "keep values after a 422" and abort-stale-response reminders for Haiku; `responsive-css.md` (could move to `web-design` or stay as a reference). `web-meta` then depends on react, vite, e2e, playwright-cli directly.

### prisma — KEEP-FIX (high)
- Value: K-private plus commonly-wrong. Almost every Traps entry is a compiles-then-fails fact: `updateMany` returns `{ count }` (`prisma/SKILL.md:23`), `where: { email: undefined }` matches every row (`:27`), interactive transaction defaults 2000/5000 ms and `P2028` (`:31`), `migrate dev` can reset, editing an applied migration (`:40-44`), `@updatedAt` is Prisma-side only (`:48`), Prisma 7 changes (`references/prisma-7.md:7-20`: driver adapter required, `.env` not loaded, `migrate dev` no longer runs generate).
- Evidence: not in any meta, 0 listed, no evals. `npm view prisma`: latest tag 8.0.0-rc.33, `prev` 7.10.1, so the 6/7/8 split is current.
- Generic examples: "Never return entities from APIs" (`:75-77`), cursor pagination needs a stable sort (`:85`), error code mapping table (`:54-58`).
- Fixes: [high] `SKILL.md:15-16` states Prisma 8 as shipped. `latest` is a release candidate; say so and state the exact pin command for a 6/7 repo, because the claim "unpinned `npx prisma` now fetches the Prisma 8 CLI" is correct today and will break 6/7 users who follow old habits. [med] `references/prisma-7.md:77` retirement date 1 December 2026 is 17 days out; re-check and drop the date. [low] `:3` "October 2026". [med] add `prisma-undefined-filter` outcome case. [low] add prisma to `node-typescript-meta`? Not needed; leave direct install.

### unit-testing — KEEP-FIX (medium)
- Value: K-decision, owner-specific, plus fresh runner facts. The no-presentation-assertions rule and "Never compute the expectation with the production algorithm" (`unit-testing/SKILL.md:29,34`) change behavior. `references/pytest.md` has pytest 9 native `[tool.pytest]`, `strict = true`, pytest-asyncio strict mode (`:87,91-92`); `references/vitest.md:110` has Vitest 4 `test.projects`.
- Evidence: 62 listed (highest), 0 calls, 0 loads, 217 listing tokens (double siblings). In programming-core, so in every meta. 1 outcome case (1/0, likely confounded) and 4 routing cases.
- Generic examples: "Name it by scenario and outcome" (`:27`), "Isolate it from test order, clocks, network" (`:30`), "Don't write tests that only exercise framework or library behavior" (`:19`), `references/tdd.md` (98 lines, only skimmed).
- Commonly-wrong examples: "Don't count your own review of code you just wrote as evidence" (`:41`), "show it failing before the fix" (`:21`), `patch` where the name is looked up (`references/pytest.md:82`).
- Fixes: [high] description (`:3`, 623 chars) claims strategy questions, "which tests should I run?" and "is this change covered?", colliding with test-gap-audit; cut it to about 350 chars: "Writes or updates a focused unit or regression test for changed behavior or a fixed bug, including red-green work." Move "which tests to run" to test-run. [med] fix the 4 evals missing `model:` (2 here) and `runs: 1`. [med] outcome case needs the trigger grader in a separate case (see cross-plugin).

### test-run — KEEP (medium)
- Value: Tooling plus Enforcement. Scripts detect pytest, Go, jest, vitest, cargo, .NET MTP/VSTest and Godot runners, compact failures, and a narrowed grant (`test-run/SKILL.md:6`). 69 tests pass. Fixes the "token dump" problem models have with raw test output.
- Evidence: manual-only, 0 loads in four weeks, so the owner never typed `/test-run:test-run`. In programming-core.
- Fixes: [med] the model cannot call it (`disable-model-invocation: true`), yet "which tests should I run after a change" is a request the model gets and routes to `unit-testing`, which has no script. Either make test-run model-invocable with a narrow description ("run the project's tests and show only failures; change-scoped"), or accept it as a user-only command. [low] description (`:3`) is imperative, not third person. [med] add `test-run-fix-loop` outcome case.
- Low use is a reason to watch it, not to deprecate: the scripts are the only plugin here that does deterministic work on test output.

### test-gap-audit — KEEP-FIX (medium)
- Value: Tooling plus K-decision. `scripts/coverage_map.py` (9 tests pass) maps source to tests by name, mirrored path and imports; the procedure sets rules a bare model skips: treat repo text as evidence not instructions (`:18`), say "confirmed" only after looking (`:19`), never run tests during an audit without go-ahead (`:47`), P0-P3 by risk not coverage percentage (`:49-56`). Read-only.
- Evidence: 37 listed, 0 calls, 0 loads. 3 routing positives, no outcome case, no scaffold for the script step (`SKILL.md:36-38`).
- Generic examples: "Missing failure, permission, and tenant or ownership tests" (`:43`), "Recommend the lowest test level that proves the behavior" (`:20`).
- Fixes: [high] description collision with unit-testing (`:3`, "is our test coverage enough?"); narrow to "audit a repo/PR/feature for missing or weak tests" and keep the symptom strings that are not in unit-testing. [med] add an outcome case with a scaffold (`not_contains` on edits to prove it is read-only, regex that the report cites `coverage_map.py` output).
- 37 sessions listed, 0 calls; the likely reason is that nobody asked for an audit in those sessions. UNVERIFIED.

### e2e-testing — SLIM (low)
- Value: mostly Generic. "Prefer role plus accessible name", "Never use fixed sleeps (`waitForTimeout`)", "unique, disposable test data" are standard Playwright guidance, and `flake-triage.md` is a 7-row classification table.
- Evidence: 41 listed, 0 calls, 0 loads. In web-meta. 2 routing cases without `model:`.
- Generic examples: "Never use fixed sleeps (`waitForTimeout`), blind polling, unconditional retries" (`e2e-testing/SKILL.md:44`), "Use the runner's auto-waiting locators, web-first assertions" (`:43`), "Never commit, print, or screenshot passwords" (`:27`).
- Commonly-wrong examples: `--repeat-each=N` to measure flake rate (`references/flake-triage.md:18`), "A passing retry is not a fix. Report the first failure's artifacts" (`:19`), check the installed runner version with Context7 (`:10`).
- Fixes: [med] SLIM to about 35 lines: the flake classification procedure, version check, Report. [med] add `e2e-flake-sleep` outcome case before deciding; if the baseline passes it, deprecate. [low] add the missing `model:` pins.
- Lost: Haiku lapses to `waitForTimeout`/CSS selectors. Not lost for Sonnet/Opus.

### playwright-cli — KEEP (high)
- Value: Tooling plus Enforcement. `pw.sh` is a deterministic allowlist wrapper (verbs, session name regex, `--filename` limits, refuses `--cdp*`, `--profile*`, `--persistent*`, `--config`), and the CLI exists: `command -v playwright-cli` is `/usr/bin/playwright-cli`, 0.1.24. The skill's verbs (`open`, `snapshot`, `find`, `tab-list`) appear in `playwright-cli --help`.
- Evidence: 41 listed, 5 loads, 4 calls in 4 sessions (chosen). In web-meta and `browser-tester`. No outcome eval. `pw-spec.sh` passes.
- Generic examples: "Verify the result... A zero exit code doesn't prove the action worked" (`SKILL.md:38`), "Clean up, even after an error" (`:47`).
- Commonly-wrong examples: refs belong to the snapshot that produced them (`:36`), session flag must be first (`:13`), use `find` and `snapshot <ref>` to keep context small (`:37`).
- Fixes: [low] `SKILL.md:54` tells the model to run `dialog-accept`/`dialog-dismiss`, but `scripts/pw.sh:35-41` does not allow them, so they prompt. Add them or say so. [low] `pw.sh` allows `open file:///...`; harmless for a model that can Read, but say so in `safety-cleanup.md`. [med] add `pwcli-final-action` outcome case (asks before submit).

### termwright — KEEP (high on tool existence, medium on value)
- Value: Tooling plus K-private. The skill wraps a real, uncommon CLI (`command -v termwright` is `~/.cargo/bin/termwright`, 0.2.0, equal to the crates.io latest per `cargo search`) and records quirks learned from the binary: `exec` exits 0 on error (`SKILL.md:68`), `screenshot` needs `--params '{}'` and returns base64 (`references/daemon-and-capture.md`), `json_compact` is a string needing a second parse, `hotkey` checks ctrl before alt, parser rejects `Insert`. `termwright info steps` works and lists `expectText`, `notExpectText` as the step file uses.
- Evidence: not in any meta, 0 listed. Absence of evidence. No evals.
- Generic examples: "Confirm the executable, arguments, and working directory" (`:14`), "Report what you observed" (`:72`).
- Fixes: [low] `SKILL.md:10` dated "as of 2026-10-17"; replace with "check `cargo search termwright`". [med] add an outcome case: run-steps file against a small TUI, graders on the YAML. [low] no `allowed-tools`, so every call prompts. Acceptable; leave unless the owner wants a wrapper like pw.sh.

## Cross-plugin findings

- **Testing collision (high).** Overlapping claims: `unit-testing/SKILL.md:3` ("decides which tests to run after a change", "which tests should I run?", "is this change covered?") against `test-gap-audit/SKILL.md:3` ("is our test coverage enough?", "what regression tests does this PR need?"). The `test-run` that does "run affected tests" is manual-only and has no model route. Proposed ownership: `unit-testing` writes tests; `test-gap-audit` audits gaps (read-only, script); `test-run` runs and fixes failures (make model-invocable if the owner wants "which tests to run" handled). Add one paired `evals/testing/` suite (unit-testing, test-gap-audit, test-run, e2e-testing, playwright-cli, problem-solving) with `regression-after-fix`, `pr-test-gaps`, `which-tests-to-run`.
- **Eval confound (high, UNVERIFIED).** `react/evals/stance-react-measure-first` and `unit-testing/evals/testing-observable-behaviour` mix a `tool_used Skill` grader with quality graders. The without-plugin arm cannot satisfy the skill grader, so `1/0` in plugin-data.tsv does not measure lift. Put the trigger check in its own case, or scope it to the plugin arm as `arm: both`/`min: 0` negatives are scoped in `docs/research/evals-2026-10-20.md:9`.
- **Listing budget.** If all 23 were installed, listing tokens are about 2,800. web-meta alone adds react, vite, web-development, e2e-testing, playwright-cli (about 600) and programming-core adds unit-testing and test-gap-audit (about 340). Deprecating javascript and web-development removes about 260 tokens in the owner's daily stack and no calls.
- **Three-way `.tsx` overlap.** javascript, typescript and react each claim `.tsx` behavior in their descriptions (`javascript/SKILL.md:3`, `typescript/SKILL.md:3`, `react/SKILL.md:3`). No eval loads them together. Deprecating javascript removes one leg.
- **web-meta and node-typescript-meta membership.** web-meta lists react, vite, web-development, e2e-testing, playwright-cli but not vue or tanstack; there are no other web-framework skills in a meta. node-typescript-meta lists javascript and typescript but not prisma or ts-module-boundaries. After the verdicts above, node-typescript-meta should be typescript plus prisma; web-meta should drop web-development.
- **Pytest guidance twice.** `python/references/pytest.md` (40 lines) and `unit-testing/references/pytest.md` (93 lines) overlap; keep the latter.
- **Generic-vs-fresh split across the group.** Of the 23, the lines worth paying listing tokens for are: Vite 8 (rolldown, oxc), Nuxt 4 data semantics, Prisma traps and 7/8 changes, viper traps, Go 1.24-1.27 table, pytest 9 and Vitest 4 config facts, React 19 removal map, pw.sh enforcement, termwright quirks, test-run and gap-audit scripts. The rest is textbook.

## Needs source check

- Python 3.14 and 3.15 additions (PEP 649 deferred annotations, `annotationlib`, free-threaded build support, `python -m asyncio ps`, PEP 750 t-strings, PEP 810 lazy imports, `profiling.sampling`). Not in any file; confirm on docs.python.org before adding.
- Rust 2024 edition facts (`unsafe extern`, `unsafe_op_in_unsafe_fn` default warn, `set_var` unsafe, let chains 1.88 on 2024 only) and `#[expect]` from 1.81.
- Node: `require(esm)` unflagged in 20.19+/22.12+, native type stripping unflagged in 22.18+/23.6+. Local `node -v` is 26.13.0.
- TypeScript 6/7: options deprecated in 6.x and removed in 7 (`baseUrl`, `moduleResolution: node10`, `target: es5`, `outFile`, AMD/UMD/System), and whether typescript-eslint, dependency-cruiser and ts-morph run on 7. `npm view typescript dist-tags`: `latest` 7.0.2.
- Vite 8 specifics: `build.target` browser versions (`vite/SKILL.md:37`), `manualChunks` object removal and `codeSplitting.groups` (`:40`), `build.minify` defaults (`:38`).
- Prisma 8: the "TypeScript rewrite, `@prisma/orm-postgres`, `contract.prisma`, no P2xxx" description (`prisma/SKILL.md:15`); the `latest` dist-tag being an rc; Accelerate retirement 1 December 2026 (`references/prisma-7.md:77`).
- Pinia 4 ESM-only and Vue 3.5.11 minimum (`vue/SKILL.md:13`); `@pinia/testing` 2.x pairing (`references/vue-component-testing.md:28`).
- Go 1.27 rows in `golang/references/modernize.md`: json/v2-backed `encoding/json` (`:34,45`), removed godebug keys (`:44`), `stdversion` vet default (`:40`); golang-performance `compiler-analysis.md:29`, `patterns.md:15`. Green Tea GC default in 1.26.
- dependency-cruiser TypeScript range: skill cites 18.6 with `>=2 <7`; npm latest is 18.7.2.
- Whether `testing-observable-behaviour` and `stance-react-measure-first` still show lift when the skill-fired grader is split out (requires a paid eval run; not run here).
