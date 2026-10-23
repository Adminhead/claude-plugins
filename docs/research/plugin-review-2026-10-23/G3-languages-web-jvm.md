# G3 review: language, web and JVM skill plugins

Scope: python, python-packaging, fastapi, golang, golang-cli, golang-performance, rust, bash, javascript, typescript, react, vue, vite, tanstack, prisma, better-auth, ts-module-boundaries, web-design, web-development, e2e-testing, playwright-cli, unit-testing, test-run, test-gap-audit, java, java-testing, maven, gradle, scala, sbt, play-framework, spring-boot, spring-boot-testing, coding, plus `evals/jvm/`.

Checks run (read-only): `claude plugin validate --strict plugins/<p>` passed for all 34. `.claude/skills/skill-authoring/scripts/validate_skill.py` reported valid for all 34. `python3 scripts/plugins.py check` printed `ok`. `uvx pytest` gave 67 passed and 1 skipped for test-run, and 9 passed for test-gap-audit. No evals were run, because they cost money.

## Summary

- **[high] Sibling negatives in per-plugin suites can never fail.** `claude plugin eval` loads only the plugin under test (`.claude/skills/skill-evals/references/cli.md:132`). A `not-<sibling>` grader in a single-plugin suite therefore passes every time. 14 graders in this group are like that: golang (`not-golang-performance`, `not-golang-cli`), golang-cli `not-golang`, golang-performance `not-golang`, bash `not-coding`, vite `not-javascript`, coding `not-problem-solving`, e2e-testing `route-e2e-vs-unit/not-unit`, unit-testing `not-e2e` (testing-vs-e2e-unit, trigger-testing-1, trigger-testing-2), and test-gap-audit `not-unit` (all 3 cases). These cases are positive triggers only. `evals/jvm` is the only suite in the group that loads several plugins together and so actually tests a boundary. The web/node, Python, Go and testing clusters have no such suite.
- **[high] Testing-cluster triggers collide, and no eval loads the two skills together.** The `unit-testing` description claims "which tests should I run?" and "is this change covered?" (`unit-testing/skills/unit-testing/SKILL.md:3`). The `test-gap-audit` description claims "is our test coverage enough?" and "what regression tests does this PR need?" (`test-gap-audit/skills/test-gap-audit/SKILL.md:3`). test-gap-audit's own positive `trigger-test-gap-audit-2` ("Is our test coverage for this enough, and what regression tests are missing?") is close to unit-testing's phrase. unit-testing's `trigger-testing-2` ("Which tests should I run and is there anything I need to add?") is a gap-audit-shaped request. Both plugins sit in `programming-core`, so every language meta installs them together.
- **[high] Descriptions are tuned to the paired JVM prompts, so the JVM suite has no held-out prompts.** Examples:
  - `spring-boot-testing/SKILL.md:3` ("an OrderService-style … controller test … that checks JSON responses with the service mocked") restates `evals/jvm/evals/webmvctest-slice/prompt.md`.
  - `unit-testing/SKILL.md:3` ("when to test private helpers or a real database, and how to make a test suite consistent") restates `generic-test-strategy`.
  - `scala/SKILL.md:3` ("cannot find an ordering", "writing a MUnit … suite for a Scala object") restates `missing-given` and `munit-suite`.
  - `java/SKILL.md:3` (Tomcat 10 javax.servlet) restates `javax-jakarta`.

  `evals/jvm/README.md` says "Fix descriptions until every paired case passes". `skill-evals` says to judge on prompts you did not look at, and the repo ships a `leakage-audit` plugin for exactly this. Fix: add a held-out set of paired prompts, and rewrite the descriptions in terms of symptom classes, not single prompts.
- **[high] Fifteen of the 34 plugins have no evals:** python, python-packaging, fastapi, rust, javascript, typescript, vue, tanstack, prisma, better-auth, ts-module-boundaries, web-design, web-development, playwright-cli and test-run. react, vite, bash, coding, golang-cli and golang-performance have one case each. Only react's case is an outcome case. Fix: add a paired `evals/web/` suite and a paired `evals/testing/` suite in the style of `evals/jvm`.
- **[med] Version guidance is behind in the newest-language areas:**
  - python: no Python 3.14 content (PEP 649 deferred annotations, supported free-threaded build, `python -m asyncio ps/pstree`, remote `pdb -p`).
  - rust: no mention of `edition`, the 2024 edition changes, or `#[expect]`.
  - javascript: no `require(esm)` (Node 20.19+/22.12+) and no native type stripping.
  - typescript: SKILL.md says nothing on TS 6 deprecations or TS 7. The plugin's own `references/advanced-types.md:5` says the examples were checked with `tsc` 7.0.2, and ts-module-boundaries says dependency-cruiser cannot read TS 7.
  - golang-performance: `runtime-tuning.md` omits that Green Tea GC is the default from Go 1.26.
- **[med] Some version claims are unverified and should be confirmed.** I could not confirm these, and they change advice:
  - Prisma 8: "TypeScript rewrite, `contract.prisma`; unpinned `npx prisma` fetches the 8 CLI" (`prisma/SKILL.md:17-18`). This is high impact if wrong.
  - Go 1.27 features: generic methods, `strings.CutLast`, json/v2-backed `encoding/json` (`golang/references/modernize.md:34,44-45`).
  - Vite 8 removing the object form of `manualChunks` and adding `codeSplitting` (`vite/SKILL.md:40`).
  - Pinia 4 (`vue/SKILL.md:13`).
  - Gradle 9 running on JVMs up to 27 (`gradle/SKILL.md:12`).
  - The retirement date for Prisma Accelerate (`prisma/references/prisma-7.md:77`).
- **[med] Hard-coded dates go against the house authoring rule ("no dates or version-dependent advice").** Examples: "Verified on 2026-10-20" in `java/SKILL.md:53`, `java-testing:12`, `maven:12`, `gradle:12`, `spring-boot:12`, `spring-boot-testing:56`, `sbt:22` and `play-framework:8`; "as of 2026-10" in `golang-cli:12`; "in October 2026: v1.8 beta, v1.7 latest" in `better-auth:15`. They will go stale silently. Move them to one `references/versions.md` per plugin that says to re-check.
- **[med] Two `allowed-tools` grants are wider than the bodies imply:**
  - test-run pre-approves `run_tests.py *` (`test-run/SKILL.md:6`). That includes `--cmd "<anything>"`, which the script runs, so the grant amounts to running any command without a prompt. The body only asks the model not to use it (`:22`).
  - playwright-cli pre-approves `Bash(playwright-cli *)` (`playwright-cli/SKILL.md:4`). That covers `run-code` (a Playwright function executed with a `page` object), `eval`, `state-save`/`state-load` and `route` on pages the body itself calls untrusted.
- **[med] Committed suites lower `runs`.** Most cases in the group commit `runs: 1`, which the `skill-evals` checklist forbids ("not lowered, in the committed file"). Five cases have no `model:` pin: `e2e-testing/route-adhoc-browser-not-e2e`, `e2e-testing/route-e2e-vs-unit`, `unit-testing/testing-vs-e2e-browser`, `unit-testing/testing-vs-e2e-unit` and `coding/coding-feature`.
- **[med] The `evals/jvm` plugin lists have drifted.** `programming-core` now also depends on `leakage-audit` (commit 92db540), but none of the 18 `plugins:` lists include it. The README's rule to "update every case" across 18 copies of the list is fragile.

## Per-plugin findings

### python
- [med] `SKILL.md` and its references have no Python 3.14+ guidance.
  - PEP 649 (3.14) evaluates annotations lazily, which changes `from __future__ import annotations` advice and runtime `get_type_hints` and `annotationlib` use.
  - The free-threaded build is supported in 3.14 (`python3.14t`). `references/performance.md:31` and `async.md:71` mention it only in passing.
  - `python -m asyncio ps <pid>` / `pstree` would fill the "Async hang" row of the triage table (`SKILL.md:93`).
  - Uncertain: Python 3.15 (due 2026-10) adds the `profiling.sampling` profiler and PEP 810 lazy imports. Verify before adding.
- [med] There are two pytest references that can drift apart: `python/references/pytest.md` (40 lines) and `unit-testing/references/pytest.md` (100 lines, "pytest 9"). Have one point at the other.
- [low] `SKILL.md:17` lists `match`, `except*`, `TaskGroup` and PEP 695 as features gated by `requires-python`. Add 3.14 t-strings (PEP 750) and `annotationlib`.
- Evals now: none.
- Suggested evals:
  - `py-resource-leak` (routing positive): "`ResourceWarning: unclosed file` shows up in pytest output from `loader.py`; here's the function …"
  - `py-async-blocking` (outcome; llm grader plus a `not_contains` regex for `time.sleep` in the edited file): a scaffolded async handler calls `requests.get`; ask for a fix. Pass when it uses an async client or `asyncio.to_thread` and keeps the timeout.
  - `not-python-packaging-wheel` (negative, `not-python`): "my wheel is missing `templates/*.html` after `uv build`".
  - Paired (in a new `evals/python/`): `fastapi` vs `python` on a `Depends` override test.

### python-packaging
- [low] `references/release-publishing.md:35` pins `python-version: "3.12"` in the example workflow. Use the project's version.
- [low] `references/uv.md:3` says flags were "checked against uv 0.13.1", but this machine has uv 0.11.32, so I could not confirm 0.13.1. `uv audit` and `uv export --format cyclonedx1.5` do exist in 0.11.32.
- Evals now: none.
- Suggested evals:
  - `pkg-data-missing` (outcome): a scaffolded hatchling project's wheel lacks `pkg/data/*.json`. Regex graders on `pyproject.toml` for the include rule, plus a `not_contains` regex for `__file__`-relative paths in source.
  - `pkg-trusted-publish` (outcome, regex on `.github/workflows/release.yml`): `id-token: write` only on the publish job, and no `PYPI_API_TOKEN`.
  - `not-packaging-import-error` (negative): a runtime `AttributeError` in a module, which `python` should take.

### fastapi
- [low] The description (`SKILL.md:3`) opens with a noun phrase ("Bounded changes to …"), not a third-person verb. "existing FastAPI apps" also leaves new-app scaffolding unclear.
- [low] There are no references, which is fine at 82 lines. The JWT/pwdlib line (`:58`) is version-dated advice. Put it under "check docs".
- Evals now: none.
- Suggested evals:
  - `fastapi-override-identity` (outcome): the test wraps the provider in a lambda, so `dependency_overrides` doesn't apply. A regex checks the override is keyed by the canonical provider.
  - `fastapi-lifespan-testclient` (routing positive): "my startup pool is None in tests using `TestClient(app)`".
  - `not-fastapi-flask` (negative): a Flask blueprint question.

### golang
- [med] `references/` doesn't mention Go 1.26's default Green Tea GC, or the `GOEXPERIMENT=nogreenteagc` opt-out for comparing baselines. This sits next to the 1.27 allocator note in `golang-performance/references/runtime-tuning.md:32`.
- [med] Uncertain claims to verify: `references/modernize.md:34` (Go 1.27: methods with their own type parameters, `strings.CutLast`, json/v2-backed `encoding/json`), `:44` (godebug keys removed in 1.27), `:40` (`stdversion` vet check runs by default in 1.27), and `debugging.md:14` (`goroutineleak` profile in 1.27).
- [low] `SKILL.md:10` routes to `golang-cli` and `golang-performance` without "if installed". `golang-meta` doesn't install them (they are direct installs per `docs/plans/plugin-adoption.md:294`).
- Evals now: 2 positives (`trigger-golang-1`, `trigger-golang-2`). Both `not-*` graders can never fail. There is no real negative and no outcome case.
- Suggested evals:
  - `not-golang-rust` (negative, `not-golang`): a Tokio `JoinSet` shutdown question.
  - `go-race-fix` (outcome, scaffolded `pool.go`): llm grader checks that results are collected via a channel or mutex and that the goroutines exit on `ctx.Done()`. A regex checks `wg.Go` or `errgroup` is used only when `go.mod` allows it.
  - `go-version-gate` (outcome): `go.mod` says `go 1.21`, and the task tempts range-over-func. A `not_contains` regex checks for `iter.Seq`.
  - Paired `evals/go/`: `golang` vs `golang-cli` (the viper env prompt), `golang` vs `golang-performance` (`BenchmarkIngest`), `golang` vs `unit-testing` ("table test for this parser").

### golang-cli
- [low] `SKILL.md:12` pins a date ("as of 2026-10").
- Evals now: 1 positive (`golang-cli-vs-golang`). Its `not-golang` grader can never fail.
- Suggested evals:
  - `cli-child-prerun` (routing positive): "config file is ignored only for the `serve` subcommand, which has its own PersistentPreRunE".
  - `cli-required-flag-env` (outcome): `MarkFlagRequired` fails even though `MYAPP_TOKEN` is set. The llm grader checks validation moved after resolution.
  - `not-golang-cli-flag-pkg` (negative): a single-command tool using stdlib `flag`, asking how to add a boolean flag.

### golang-performance
- [med] `references/runtime-tuning.md` has no section on the 1.26 default GC change. Benchmark comparisons across 1.25 and 1.26 or later need it noted.
- [low] Unverified Go 1.27 claims in `compiler-analysis.md:29` ("unhandled op DEFER") and `patterns.md:15` (map memory "on Go 1.27").
- Evals now: 1 positive, whose `not-golang` grader can never fail.
- Suggested evals:
  - `perf-no-profile` (stance outcome, like react's case): "make this JSON handler faster" with no benchmark. The llm grader checks it asks for a baseline before editing, and a regex checks that `sync.Pool` is absent.
  - `perf-gomemlimit` (routing positive): "pod OOMKilled at 512Mi limit, GOGC default".
  - `not-golang-performance-correctness` (negative): a data race question.

### rust
- [med] `SKILL.md:14` Orient doesn't read `edition`. The 2024 edition (Rust 1.85) changes behavior the skill touches:
  - `unsafe extern` blocks and `#[unsafe(no_mangle)]`;
  - `unsafe_op_in_unsafe_fn` warns by default;
  - `std::env::set_var` is `unsafe`;
  - RPIT lifetime capture;
  - `if let` and tail-expression temporary scope;
  - let chains (1.88, 2024 only);
  - the MSRV-aware resolver.
- [low] `:82` says not to `#[allow]` a lint. Recommend `#[expect(lint, reason = "...")]` (1.81+) for the justified case.
- Evals now: none.
- Suggested evals:
  - `rust-mutex-await` (routing positive): `std::sync::MutexGuard` held across `.await`, and the future is not `Send`.
  - `rust-lib-error` (outcome): a scaffolded lib returns `Box<dyn Error>`. Regexes check for a `thiserror` enum or a typed error and that `unwrap()` is absent in `src/lib.rs`.
  - `rust-unsafe-safety-comment` (outcome): a regex checks for `// SAFETY:` before each `unsafe {`.
  - `not-rust-go` (negative): a Go channel question.

### bash
- Content is accurate. I checked the `EXIT`-on-signal claim (`references/patterns.md:33`) empirically: Bash runs the EXIT trap on SIGTERM and SIGINT.
- Evals now: 1 positive (`bash-vs-coding`). Its `not-coding` grader can never fail.
- Suggested evals:
  - `bash-strict-holes` (outcome): a scaffold script with `local x=$(cmd)` and `((n++))`. `not_contains` regexes check both are gone.
  - `bash-posix-alpine` (routing positive): "entrypoint.sh fails on alpine with `[[: not found`".
  - `not-bash-pre-commit` (negative): "add shellcheck to our .pre-commit-config.yaml", which belongs to `pre-commit` per `SKILL.md:8`.
  - `not-bash-gh-actions` (negative): a YAML matrix question.

### javascript
- [med] `SKILL.md:28` says "Don't mix `require` and `import` … without the runtime's documented interop" but never names that interop. `require(esm)` is unflagged in Node 20.19+/22.12+, which changes most "ERR_REQUIRE_ESM" diagnoses. Node's built-in TypeScript type stripping (unflagged in 22.18+/23.6+, needs `erasableSyntaxOnly` code) is also missing.
- [med] The description claims "runtime behavior of JS/TS code", while typescript claims `*.ts/*.tsx` and react claims `.tsx/.jsx` behavior. A `.tsx` bug can match all three. No eval covers this.
- [low] The `## Tests` section (`:56-63`) overlaps with unit-testing's `references/vitest.md`. Keep only the runtime-specific points.
- Evals now: none.
- Suggested evals:
  - `js-require-esm` (routing positive): "ERR_REQUIRE_ESM after bumping `nanoid` in a CJS service".
  - `js-floating-promise` (outcome): a scaffold `.mjs` loop with unawaited `fetch`. The llm grader checks `Promise.all` or awaited calls plus an error path.
  - `not-javascript-tsc` (negative): a generic type-inference error, which `typescript` should take.
  - Paired `evals/web/`: `javascript` vs `typescript` vs `react`.

### typescript
- [med] SKILL.md has no TS 6/7 guidance even though the plugin's own `references/advanced-types.md:5` uses `tsc` 7.0.2. Add a gotcha that covers options deprecated in 6.x and removed in 7 (`baseUrl`, `moduleResolution: node`/`node10`, `target: es5`, `outFile`, AMD/UMD/System). Also warn that compiler-API tools (typescript-eslint, dependency-cruiser per `ts-module-boundaries/SKILL.md:39`, ts-morph) may not run on 7. Mark the details as uncertain and check them with Context7.
- [low] The description says "Use when editing *.ts/*.tsx types". Narrow it to type-level work so it doesn't fight react over `.tsx` behavior.
- Evals now: none.
- Suggested evals:
  - `ts-exhaustive-union` (outcome): a scaffold reducer over a union with a new variant. A regex checks for a `never` exhaustiveness check, and a `not_contains` regex checks for ` as ` casts.
  - `ts-unknown-json` (routing positive): "`JSON.parse` result typed as `User` crashes at runtime".
  - `not-typescript-runtime` (negative): an unhandled rejection in `.ts` code (javascript).
  - `not-typescript-boundaries` (negative): "stop deep imports between packages". That should go to ts-module-boundaries (user-invoked only) or produce a suggestion, not a typescript invocation.

### react
- [med] The description (`SKILL.md:3`) claims ".tsx/.jsx behavior", which collides with typescript and javascript as above.
- [low] The only eval (`stance-react-measure-first`) is a stance case. Per `docs/research/evals-2026-10-17.md:12` it needs `--scaffold` and the write tools.
- Evals now: 1 outcome (stance); no routing positives and no negatives.
- Suggested evals:
  - `react-effect-loop` (routing positive): "useEffect sets state from a prop and the component renders forever".
  - `react-key-index` (outcome): a list with `key={i}` and per-row input state. A regex checks the key is a domain id.
  - `not-react-vue` (negative): a `.vue` reactivity bug.
  - `not-react-vite-env` (negative): an `import.meta.env` question.
  - Paired: `react` vs `web-development` on "the signup form loses values after a 422".

### vue
- [med] Uncertain: "Pinia 4 is ESM-only and needs Vue 3.5.11 or later" (`SKILL.md:13`) and "`@pinia/testing` 2.x pairs with Pinia 4" (`references/vue-component-testing.md:28`). Pinia 3 (2025) dropped Vue 2. Verify that Pinia 4 exists before keeping these.
- Evals now: none.
- Suggested evals:
  - `vue-destructured-props` (routing positive): "watch on a destructured prop never fires".
  - `vue-pinia-storeToRefs` (outcome): a scaffold component destructures store state. A regex checks for `storeToRefs`.
  - `not-vue-react` (negative): a React hook question.
  - `not-vue-nuxt-config-vite` (negative): a pure `vite.config` proxy question.

### vite
- [med] Uncertain Vite 8 specifics: `SKILL.md:40` says the object form of `manualChunks` was removed and the function form deprecated in favor of `rolldownOptions.output.codeSplitting`. `:37` gives Vite 8 default browser targets. These are load-bearing if wrong. Cite the migration guide anchor or soften them.
- Evals now: 1 positive (`vite-vs-javascript`). Its `not-javascript` grader can never fail.
- Suggested evals:
  - `vite-env-leak` (outcome): a scaffold `vite.config.ts` with `loadEnv(mode, cwd, '')` feeding `define`. A regex checks the prefix list and checks that no secret name is in `define`.
  - `vite-stale-chunks` (routing positive): "users get 'Failed to fetch dynamically imported module' after each deploy".
  - `not-vite-webpack` (negative): a webpack config question.

### tanstack
- [low] The body is mostly "look it up in the docs for your version" (`SKILL.md:25,84`). That is defensible, but it adds little beyond the ownership table. Consider a short Gotchas section (query key missing an input, duplicate QueryClient, loader plus component double fetch). These are the known traps.
- Evals now: none.
- Suggested evals:
  - `tanstack-query-key-input` (outcome): the key omits the `page` param, so the data is stale. A regex checks `page` is in the key.
  - `tanstack-server-table` (routing positive): "sorting only sorts the current page".
  - `not-tanstack-redux` (negative): an RTK Query question.

### prisma
- [high, uncertain] `SKILL.md:17-18` says Prisma 8 is a TypeScript rewrite (`@prisma/orm-postgres`, `contract.prisma`, `prisma contract emit`, no P2xxx codes) and that "an unpinned `npx prisma` now fetches the Prisma 8 CLI". I could not verify this. If it's wrong, the skill steers every 6/7 user into pinning workarounds. Verify against prisma.io and npm before keeping it.
- [low] `references/prisma-7.md:77` gives a hard date (Accelerate retirement on 1 December 2026), which is close to today's date. Re-check it.
- Evals now: none.
- Suggested evals:
  - `prisma-undefined-filter` (outcome): a scaffold service runs `deleteMany({ where: { authorId: input.authorId } })`. The llm grader checks for input validation, `strictUndefinedChecks`, or a guard.
  - `prisma-p2002` (routing positive): "find-then-create races and we get duplicate users".
  - `prisma-tx-http` (outcome): an HTTP call inside `$transaction`. The grader checks it moved outside.
  - `not-prisma-drizzle` (negative): a Drizzle migration question.

### better-auth
- [med] `SKILL.md:15` and `:93` hard-code release lines and dates ("v1.8 beta, v1.7 latest", "rechecked against 1.7.10 in October 2026"). The design (fetch the version-matched `llms.txt`) is good. Drop the snapshot so it can't contradict the live index.
- [low] `:22-29` requires an AskUserQuestion round and confirmation before any edit, even for a debugging request. Limit it to setup or migration.
- Evals now: none.
- Suggested evals:
  - `better-auth-plugin-schema` (routing positive): "added the organization plugin and now `member` table doesn't exist".
  - `better-auth-express-order` (outcome): the handler is mounted after `express.json()`. A regex checks the order.
  - `not-better-auth-authjs` (negative): an Auth.js/NextAuth callback question.

### ts-module-boundaries
- [low] `assets/dependency-cruiser.config.cjs:7-11` interpolates `PACKAGES_ROOT` into regexes unescaped. A root with `.` or `+` matches more than intended. Escape it or say so in the comment.
- [low] `disable-model-invocation: true`, so a routing eval is impossible. Only an outcome eval invoked through the slash command works.
- Evals now: none.
- Suggested evals:
  - `boundaries-setup` (outcome, scaffold with `src/packages/{a,b}` and TS 5.x): the prompt is `/ts-module-boundaries:ts-module-boundaries src/packages`. Graders:
    - `file_exists` `.dependency-cruiser.cjs`;
    - a regex for `lint:boundaries` in `package.json`;
    - a `tool_order` check that a `depcruise` Bash run happens before and after the temporary deep import;
    - an llm grader that the temporary import was reverted.

### web-design
- [med] Overlaps `ui-direction`, `design-system` and `design-critique` (outside the group). The "Not for" line (`SKILL.md:10`) handles ui-direction and design-handoff but not design-system ("extending tokens or components" in its description against design-system's "proposals for a new component or pattern").
- Evals now: none.
- Suggested evals (paired in `evals/web/` or a design suite):
  - `web-design-extend-tokens` (positive): "add a warning state to our existing Badge tokens in DESIGN.md".
  - `not-web-design-new-landing` (negative): a brand-new landing page with no system, which `ui-direction` should take.
  - `not-web-design-audit` (negative): "audit our design system for hardcoded colors", which `design-system` should take.

### web-development
- [med] The description (`SKILL.md:3`) claims "an HTTP API contract change", which overlaps `api-rest-design` (outside the group). It also claims "a form, page or flow", which overlaps react.
- [low] The CWV thresholds (`:81`) are correct (LCP 2.5 s, INP 200 ms, CLS 0.1).
- Evals now: none.
- Suggested evals:
  - `webdev-form-recovery` (outcome): a scaffold form clears its fields on a 422. The llm grader checks the values are kept and errors are mapped per field.
  - `webdev-stale-response` (routing positive): "search results flash old results when typing fast".
  - `not-webdev-openapi` (negative): an OpenAPI versioning policy question, which `api-rest-design` should take.
  - `not-webdev-react-memo` (negative).

### e2e-testing
- [med] `route-adhoc-browser-not-e2e` and `route-e2e-vs-unit` have no `model:` pin. `not-unit` can never fail.
- Evals now: 1 positive and 1 real negative.
- Suggested evals:
  - `e2e-flake-sleep` (outcome): a scaffold spec uses `waitForTimeout(3000)`. A `not_contains` regex checks it's gone, and a regex checks for a web-first `expect(...).to…`.
  - `e2e-cypress` (routing positive): a Cypress `cy.wait(5000)` flake.
  - Paired: `e2e-testing` vs `playwright-cli` on "just check the signup page in a browser". The current adhoc negative can't assert that playwright-cli fired, because it isn't loaded.

### playwright-cli
- [med] `allowed-tools: Bash(playwright-cli *)` (`SKILL.md:4`) pre-approves `run-code`, `eval`, `state-save`/`state-load`, `route` and `open file://…`. Consider listing only the read and navigation subcommands, so `run-code` and `state-*` still prompt.
- [low, uncertain] The package name `@playwright/cli` and subcommands such as `install-browser` and `-s=` (`:13`) could not be verified here, because the CLI isn't installed.
- Evals now: none.
- Suggested evals:
  - `pwcli-console-errors` (routing positive): "open localhost:3000/checkout and tell me what's in the console".
  - `pwcli-final-action` (outcome): "fill the contact form and submit". A `tool_order` or llm grader checks it asks before submitting. Needs a mock page.
  - `not-pwcli-spec` (negative): "write a Playwright test file for login", which e2e-testing should take.

### unit-testing
- [high] Trigger overlap with test-gap-audit, as in the Summary. Also, `trigger-testing-2` is a "which tests to run / what to add" prompt, which is the gap-audit shape.
- [med] The description (`SKILL.md:3`) was tuned to `evals/jvm/generic-test-strategy` (see the Summary).
- [med] `not-e2e` in testing-vs-e2e-unit, trigger-testing-1 and trigger-testing-2 can never fail. testing-vs-e2e-browser and testing-vs-e2e-unit have no `model:` pin.
- Evals now: 3 positives, 1 real negative (testing-vs-e2e-browser) and 1 llm outcome case.
- Suggested evals:
  - Paired `evals/testing/` loading unit-testing, test-gap-audit, e2e-testing, playwright-cli, java-testing, coding and problem-solving (test-run is manual-only, so it can't be a routing neighbour):
    - `regression-after-fix` → unit-testing, not test-gap-audit;
    - `pr-test-gaps` → test-gap-audit, not unit-testing;
    - `flaky-ci-unknown` → problem-solving, not unit-testing.
  - `unit-tautology` (outcome): a regex checks that the expected value is a literal, not computed via the function under test.

### test-run
- [med] The `--cmd` pre-approval, as in the Summary (`SKILL.md:6,22`). Options: drop `*` and pre-approve only flag shapes without `--cmd`, or have the script refuse `--cmd` unless an env var the user sets is present.
- [low] The description (`:3`) is imperative, not third person. That matters little with `disable-model-invocation`.
- Evals now: none. The script tests pass (67 passed, 1 skipped).
- Suggested evals:
  - `test-run-fix-loop` (outcome, slash command `/test-run:test-run`, scaffold pytest repo with one off-by-one bug): a regex checks the source fix; `not_contains` regexes check for `@pytest.mark.skip` and for weakened asserts; a `tool_order` check confirms `run_tests.py --all` runs last.
  - `test-run-no-weaken` (outcome): the failing test is actually wrong. The llm grader checks it asks instead of editing.

### test-gap-audit
- [med] There are no real negatives, and all 3 `not-unit` graders can never fail.
- [low] The `test-gap-audit-routing` and `trigger-test-gap-audit-1` prompts have no scaffold. The skill's script step (`SKILL.md:36-38`) is never exercised.
- Evals now: 3 positives.
- Suggested evals:
  - `not-gap-audit-single-test` (negative, `not-test-gap-audit`): "add a regression test for this slugify fix".
  - `gap-audit-outcome` (scaffold repo with an untested `refund.py`): a `tool_used` Bash input_match on `coverage_map.py`, and an llm grader that the report ranks refund as P0/P1 with path:line evidence and edits nothing. Also add a `not_contains`-style `tool_used` Edit/Write grader with `max: 0`.

### coding
- [med] The description (`SKILL.md:3`) claims any change "whose approach is already clear". It co-fires with every language skill by design, but the only eval's `not-problem-solving` grader can never fail.
- Evals now: 1 positive.
- Suggested evals (paired, loading `programming-core` plus python):
  - `coding-small-feature` → coding (python may co-fire; assert only that coding fires);
  - `not-coding-unknown-bug` → problem-solving;
  - `not-coding-plan` ("plan the migration in slices") → planning;
  - `coding-no-overbuild` (outcome): "add a `--verbose` flag". A `not_contains` regex checks for a new config class or file, and the llm grader checks for no speculative options.

### java
- [low] The date in the body (`SKILL.md:53`). `references/upgrade.md` stops at 21→25, which is fine for LTS steps. A one-line note on JDK 26/27 (non-LTS, JEP 500 final-field mutation warnings affecting reflection and mocking libraries) would help. Uncertain on 27 specifics.
- Evals now: 2 positives, 1 negative and 1 outcome case (`java-upgrade-21`, Δ +0.50 per `docs/research/evals-2026-10-20.md:14`). Good shape.
- Suggested evals:
  - `java-record-copy` (outcome): a regex checks for `List.copyOf` in the record constructor.
  - `not-java-kotlin` (negative): a Kotlin data class question.

### java-testing
- [low] `SKILL.md:12` says JUnit 6.1.3. `spring-boot-testing/SKILL.md:58` says Boot 4.1.1 manages Jupiter 6.0.3. That's consistent, since the managed version can lag, but a reader may see it as a contradiction. Say "managed by Boot".
- Evals now: 2 positives, 1 negative and 1 outcome case (`junit-clock`; per `evals-2026-10-20.md:14` the baseline also scores 1.00, so it doesn't separate the arms).
- Suggested evals:
  - `junit4-jupiter-mix` (outcome): a scaffold module on JUnit 4 has a new test using `org.junit.jupiter.api.Test` that never runs. A regex checks the imports match the module.
  - Harden `junit-clock` by not mentioning "every Saturday" so the baseline has to discover the clock seam.

### maven
- Evals now: 2 positives, 1 negative and 1 outcome case (`maven-bom`, 9 regex graders). Good.
- Suggested evals:
  - `maven-proc-jdk23` (outcome): Lombok stops working after moving to JDK 23. A regex checks for `annotationProcessorPaths`.
  - `not-maven-gradle-version-catalog` already exists. Add `not-maven-java-code` (a stream question in a Maven repo).

### gradle
- [med, uncertain] `SKILL.md:12` says "Gradle 9 runs on a JVM from 17 through 27". JDK 27 is only weeks old, so check the compatibility matrix.
- [low] Three near-identical config-cache cases test the same thing: `gradle/evals/gradle-config-cache`, `trigger-gradle-1` and `evals/jvm/gradle-config-cache`.
- Evals now: 2 positives, 1 negative and 1 outcome case.
- Suggested evals:
  - `gradle-catalog-alias` (outcome): add a library to `libs.versions.toml` and use `libs.my.lib`. Regexes check the toml entry and that `build.gradle.kts` has no version literal.
  - `gradle-subprojects-block` (outcome): move `subprojects {}` config into a `build-logic` convention plugin.

### scala
- [med] The description was tuned to the JVM paired prompts (see the Summary). At 759 characters it is the longest in the group.
- Evals now: 2 positives, 1 negative and 1 outcome case. `scala-follow-style` has the same baseline score, so it doesn't separate the arms.
- Suggested evals:
  - `scala-3-6-given-syntax` (outcome): a project on 3.3 LTS. A `not_contains` regex checks the new `given X: T` / `[A: Ord as o]` forms are absent.
  - `not-scala-sbt-eviction` (negative).

### sbt
- [med] `evals/sbt2-commands/graders/no-colon-test.md` targets `last_message` with `test:compile` as `not_contains`. An answer that explains "`test:compile` is rejected on sbt 2" fails, which is the false-fail `docs/research/evals-2026-10-20.md:12` already hit once. Target `.github/workflows/ci.yml` instead.
- [low] "sbt 2" facts are marked **observed** from sanssushi runs (`references/sbt2.md:3`). Confirm sbt 2.0 GA status and the exact error text before relying on the `Expected whitespace character` symptom routing.
- Evals now: 2 positives, 1 negative and 1 outcome case (Δ +0.25). Good.
- Suggested evals:
  - `sbt-dependency-tree-sbt2` (routing positive).
  - `sbt-percent-coordinates` (outcome): `%` used for a Scala library. A regex checks for `%%`.

### play-framework
- [low] Dated snapshots (`SKILL.md:8,24`, "3.1.0-M9 at last check").
- Evals now: 2 positives, 1 negative and 1 outcome case (`play-migrate-3`; the baseline also scores 1.00).
- Suggested evals:
  - Harden `play-migrate-3` with a less obvious trap (`akka.actor.typed` in `application.conf` includes, or `akka-http` server settings) so the arms separate.
  - `play-csrf-403` (routing positive).

### spring-boot
- [med] `evals/boot-config-props/graders/uses-config-properties.md` is `tool_used: Write` only. A correct run that adds `@ConfigurationProperties` with Edit into an existing class, or into `PaymentService.java` itself, fails. Use a `regex` over the produced files, or add an Edit alternative.
- [low] Dated version line (`SKILL.md:12`).
- Evals now: 2 positives, 1 negative and 1 outcome case (baseline 1.00).
- Suggested evals:
  - `boot4-jackson3` (outcome): a scaffold Boot 4 app has `com.fasterxml.jackson.databind` imports and `@JsonComponent`. Regexes check for `tools.jackson` and `@JacksonComponent`.
  - `boot-self-invocation-tx` (routing positive).

### spring-boot-testing
- [med] The description was tuned to `webmvctest-slice` (see the Summary). Replace the prompt-shaped clauses with the symptom class: a slice test missing a collaborator bean.
- Evals now: 2 positives, 1 negative and 1 outcome case (`slice-test`, baseline 1.00).
- Suggested evals:
  - `sbt-mockbean-boot4` (outcome): a scaffold Boot 4 test with `@MockBean` fails to compile. A regex checks for `@MockitoBean`.
  - `context-cache-keys` (outcome, llm): unify `@MockitoBean` sets.

## evals/jvm

- [med] The plugin lists don't include `leakage-audit`, which `programming-core` now depends on. There are 18 duplicated copies of the list. Generate them from `java-meta`/`scala-meta` plus `programming-core` with a small script, or have `scripts/plugins.py check` verify them.
- [med] Each case has only one `not-` neighbour. A wrong third skill firing (for example `coding` or `problem-solving` on `bean-wiring`) passes. Add a catch-all negative per case: `tool_used Skill` with `input_match '"skill"\s*:\s*"(?:[\w-]+:)?(?:java|java-testing|maven|gradle|scala|sbt|play-framework|spring-boot-testing|coding|problem-solving)"'`, minus the expected skill, `max: 0`, `arm: both`.
- [med] Boundaries that are missing:
  - spring-boot vs spring-boot-testing (an app-config question asked from inside a test failure);
  - java-testing vs test-gap-audit;
  - maven vs gradle in a repo that has both build files;
  - unit-testing vs java-testing on a plain JUnit test for a utility class (only a per-plugin negative covers this now);
  - sbt vs play-framework on `sbt dist` packaging;
  - a case where no JVM skill should fire (a trivial one-line Java question) to catch over-triggering.
- [med] The prompts double as the tuning set (see the Summary). Hold out about 40% of new paired prompts and score descriptions on those.
- [low] `generic-test-strategy`'s "Keep it general, not tied to one framework" gives the answer away. A held-out variant without it would show whether unit-testing really wins.

## Cross-group notes

- **Paired suites to add, mirroring `evals/jvm`:**
  - `evals/web/`: javascript, typescript, react, vue, vite, tanstack, web-development, web-design, e2e-testing, playwright-cli, prisma, better-auth, plus `app-auth`, `api-rest-design`, `ui-direction`, `design-system`, `accessibility-review`, and the programming-core plugins.
  - `evals/testing/`: unit-testing, test-gap-audit, e2e-testing, playwright-cli, java-testing, `dotnet-testing`, `godot-testing`, `problem-solving`, and coding.
  - `evals/python/` and `evals/go/` for the language-plus-extras pairs.
- **Outside-group overlaps:**
  - `web-development` ↔ `api-rest-design` (API contracts), `accessibility-review` (a11y checks) and `web-perf-auditor` (performance).
  - `web-design` ↔ `design-system` and `ui-direction`.
  - `better-auth` and `fastapi` ↔ `app-auth`.
  - `prisma` ↔ `db-schema-design` and `postgres`.
  - `coding` ↔ `codebase-design`, `problem-solving` and `implement-plan`.
  - `test-gap-audit` ↔ `security-scan`.
  - `unit-testing` ↔ `dotnet-testing` and `godot-testing` (the same "generic strategy vs framework" split as java-testing).
- **Duplicated test guidance that will drift:** `python/references/pytest.md` vs `unit-testing/references/pytest.md`; `javascript/SKILL.md` Tests vs `unit-testing/references/vitest.md` vs `react/references/react-component-testing.md` vs `vue/references/vue-component-testing.md`; `rust/references/testing.md` vs `unit-testing/references/framework-runners.md`. Keep the language-specific part in each and point to unit-testing for strategy.
- **Meta coverage (low, possibly intentional):**
  - `web-meta` installs react and vite but not javascript or typescript, so a TS React repo gets no typescript skill unless `node-typescript-meta` is also installed.
  - `golang-meta` omits golang-cli and golang-performance, which golang's body routes to.
  - vue, tanstack, prisma, better-auth, play-framework, spring-boot and spring-boot-testing are in no meta (direct installs per `docs/plans/plugin-adoption.md:294`).
- **The dated "Verified on …" pattern is repo-wide** in the JVM set and better-auth. Pick one convention (a `references/versions.md` per plugin with a re-check instruction) and apply it consistently.
