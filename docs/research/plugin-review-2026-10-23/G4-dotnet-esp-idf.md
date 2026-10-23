# G4 review: .NET and embedded

Scope: aspire, aspnet-core, blazor, csharp, dotnet-ai-apps, dotnet-diagnostics, dotnet-native-interop, dotnet-performance, dotnet-template-authoring, dotnet-testing, dotnet-upgrade-guide, ef-core, msbuild, nuget, roslyn-analyzers, esp-idf, plus how dotnet-meta routes them. Checks run: `python3 scripts/plugins.py check` printed ok. `claude plugin validate` passed on all 16 plugins and on dotnet-meta. `skill-authoring/scripts/validate_skill.py` passed on all 16 skills, so no YAML or description-limit problems. No eval results for this group are in `docs/research/evals-*.md`.

## Summary

- **[high] Most "not-<sibling>" graders can never fail.** `claude plugin eval` loads only the plugin under test, with no other plugins (`.claude/skills/skill-evals/references/cli.md:132`). Every single-skill plugin here ships `not-ef-core`, `not-csharp`, `not-unit-testing`, `not-dotnet-performance`, `not-problem-solving` and similar graders inside positive cases. They pass every run and test nothing. That is 22 of the group's 32 `not-*` graders, including every overlap check the brief asked about (perf/diag, testing/unit-testing, csharp/roslyn). The `not-<own-skill>` hard negatives do work; the `not-<sibling>` ones do not. The overlaps need a different test: a multi-plugin harness or a `claude -p` sweep with both plugins installed. Until then, the real coverage is the own-skill negatives.
- **[high] No outcome evals anywhere in the group, and every case is committed with `runs: 1`.** All 56 cases are routing cases. skill-evals lists `runs: 1` in a committed suite as an anti-pattern. aspnet-core, ef-core and dotnet-testing also leave `model` unpinned while the other 13 pin `claude-sonnet-5-5`.
- **[med] aspnet-core and ef-core are tagged `"category": "meta"`. Confirmed wrong.** See `.claude-plugin/marketplace.json:1168` and `:1238`. Both ship a skill, and README:404 itself calls them "ordinary plugins". `scripts/plugins.py` only sets the category when it registers a plugin (`category_for`, :530-536), and `check` never validates it, so the error has survived since the import commit 6f2697e. recommend-plugins reads `category` (`recommend-plugins/SKILL.md:22`) and sorts `*-core` names toward bundles (:30). Fix: set both to `development`, and make `check` assert that `category == "meta"` if and only if `is_meta(name)`, and `"bundle"` if and only if the plugin has only deps.
- **[med] dotnet-meta installs 4 of the 15 .NET plugins** (csharp, msbuild, dotnet-testing, nuget), and recommend-plugins proposes only 4 more (aspnet-core, ef-core, blazor, aspire; `recommend-plugins/SKILL.md:73-77`). That leaves no install path for dotnet-upgrade-guide, dotnet-performance, dotnet-diagnostics, dotnet-native-interop, roslyn-analyzers, dotnet-template-authoring, dotnet-ai-apps or esp-idf. The four plugins dotnet-meta does install send work to these by name in their "Not for" lines, so those handoffs point at skills that are usually missing. dotnet-upgrade-guide is the strongest candidate for dotnet-meta. The rest need recommend-plugins evidence rules, listed under Cross-group notes.
- **[med] .NET 8 and .NET 9 reach end of support on 2026-11-10, 18 days from now.** No file in the group says so. dotnet-upgrade-guide (`SKILL.md:23`) chains 8 -> 9 -> 10 with no warning against stopping on net9.0, and csharp, dotnet-testing and aspnet-core present net8.0 as a normal baseline.
- **[med] The testing guidance has not caught up with xunit.v3 4.x and MTP v2** (xunit.v3 4.0.0 shipped 2026-08-14 and ended MTP v1 support). dotnet-testing covers it (`SKILL.md:102,105`, `references/xunit-nunit-tunit.md:9`). dotnet-upgrade-guide's `test-frameworks/xunit-v3.md` and `vstest-to-mtp.md` never mention 4.x. Their VSTest path (`xunit-v3.md:20-22`: keep `xunit.runner.visualstudio` and set `IsTestingPlatformApplication=false`) and the .NET 9 SDK bridge advice (`vstest-to-mtp.md:66,79`) are not checked against 4.x under the .NET 10 SDK, where 4.x needs `xunit.v3.mtp-off` or the `global.json` runner.
- **[med] dotnet-testing and unit-testing overlap, and both are always installed together** (dotnet-meta pulls in programming-core, which includes unit-testing). unit-testing claims "write/run tests in any language" and "which tests should I run?". Its runner reference (`unit-testing/SKILL.md:36`) never hands .NET off to dotnet-testing. The only boundary eval (`dotnet-testing-vs-unit-strategy`) uses a Python prompt, which is an easy negative, not a hard one.
- **[low] Most version facts are current and dated** (Aspire 13.6 checked 2026-10, EF Core 10 LTS, C# 14, Agent Framework 1.25, BenchmarkDotNet 0.15.8, ESP-IDF v6.1). The stale items are small and listed per plugin.

## Per-plugin findings

### aspire
- [low] `SKILL.md:63` uses `aspire logs api --tail 200`, but `references/cli.md:35` documents `aspire logs [<resource>] [-f] [-n N]`. Make the two agree; the cli.md form comes from the 13.6 reference.
- [low] `SKILL.md:8,16` uses `aspire.config.json` as the detection signal. That file is new in 13.2. Repos on Aspire 13.0/13.1 have `.aspire/settings.json` instead, so add it as a fallback signal.

Evals now: 2 positive, 1 hard negative (vs docker), 0 outcome. `not-ef-core` in trigger-aspire-1 can never fail.

Suggested evals:
- `aspire-vs-kubernetes` (hard negative, guards against kubernetes/helm): "Our Helm chart for the catalog API sets no resource limits and the readiness probe hits /. Fix the chart."
- `aspire-vs-aspnet-core` (hard negative): "In Catalog.Api (one of our Aspire services), add a GET /products/{id} endpoint that returns 404 ProblemDetails."
- `trigger-aspire-deploy` (positive): "We run `aspire run` locally; how do we get this onto Azure Container Apps with the Postgres password as a secret?"
- `outcome-aspire-waitfor` (outcome, llm plus regex on last_message): the AppHost snippet from trigger-aspire-1 has `.WithReference(db)` and no `.WaitFor(db)`. PASS if the answer adds `WaitFor` and checks that the resource name matches the client integration name.

### aspnet-core
- [med] Its marketplace category is `meta`; see Summary.
- [low] Model is unpinned in all 4 cases, unlike the rest of the group.
- [low] The eval prompt in `aspnet-core-vs-ef-query` is word for word the same as `ef-core/evals/trigger-ef-core-1`. That is acceptable, but a different N+1 wording would widen coverage.

Evals now: 3 positive, 1 hard negative (vs ef-core), 0 outcome. `not-api-rest-design` can never fail.

Suggested evals:
- `aspnet-core-vs-blazor` (hard negative): "Products.razor calls the API twice on load under InteractiveServer; fix it."
- `aspnet-core-vs-app-auth` (hard negative): "Should our SPA plus API use cookies with BFF or bearer tokens? Compare the options for us; don't write code."
- `outcome-validation-net10` (outcome; regex on a file and llm): scaffold a .NET 10 minimal API. PASS if it uses `AddValidation()`, returns `TypedResults.Created` with a declared `Results<...>`, and contains no `.WithOpenApi()` (regex `not_contains`).

### blazor
- [low] 5 reference files over 100 lines have no table of contents: `references/auth.md`, `data.md`, `js-interop.md`, `components.md`, `prerendering.md`.

Evals now: 2 positive, 1 hard negative (vs aspnet-core), 0 outcome. `not-aspnet-core` and `not-csharp` can never fail.

Suggested evals:
- `trigger-blazor-httpcontext-null` (positive): "HttpContext is null in my component after I added @rendermode InteractiveServer; I need the user's claims."
- `blazor-vs-razor-pages` (hard negative): "Add a Razor Pages form at /Account/Profile with model binding and antiforgery."
- `outcome-persistent-state` (outcome): .NET 10 prerender double-load. PASS if the answer uses `[PersistentState]` on a public property with `??=`, and does not disable prerendering as the only fix.

### csharp
- [med] The description (`SKILL.md:3`) does not mention CA/IDE analyzer warnings or `.editorconfig` severities. csharp owns them (`SKILL.md:73`) and roslyn-analyzers hands them to csharp (`roslyn-analyzers/SKILL.md:10`). As written, the `roslyn-analyzers-vs-csharp` prompt has no description that matches it. Add "CA/IDE analyzer warnings and .editorconfig severities" to the description.
- [low] `SKILL.md:16` maps TFMs to C# versions up to net10.0 = C# 14 and stops. Add net11.0 = C# 15 (preview until the November 2026 GA), since `references/net11-apis.md` already covers net11.0.
- [low] The "Not for" line omits `godot-csharp`. A `.cs` file next to `project.godot` matches both descriptions.

Evals now: 2 positive, 1 hard negative (vs msbuild), 0 outcome. Its sibling graders can never fail.

Suggested evals:
- `csharp-ca-warnings` (positive, tests the description fix): the prompt from `roslyn-analyzers-vs-csharp`, expecting csharp to fire.
- `csharp-vs-godot` (hard negative): "Player.cs beside project.godot: GD0201 error after renaming my signal."
- `outcome-nullable-no-bang` (outcome; regex on a file): seed the OrderDto/OrderLookup files. PASS if no `null!`/`default!` is added, CS8603 is fixed with `T?`, and `x?.M()` is not used to silence CS8602.

### dotnet-ai-apps
- [low] Pinned package versions (`references/*.md`, for example llm.md:11-16 and agents.md:11-14) will go stale within a month. That is acceptable because the skill says to recheck, but date each table the way agents.md:7 does.

Evals now: 3 positive, 2 hard negatives (mcp-server, Python RAG), 0 outcome. Good balance. `not-mcp-server` in trigger-ai-agent-tools can never fail.

Suggested evals:
- `ai-vs-claude-api` (hard negative): "Which Claude model ID and prompt-caching headers should our C# service send?"
- `outcome-churn-mlnet` (outcome, llm): the churn-plan prompt. PASS if it picks ML.NET over an LLM, names held-out metrics (AUC/F1), and writes no code.

### dotnet-diagnostics
- No content defects found. The tool matrix and the production-safety rules are strong.

Evals now: 3 positive, 2 hard negatives (benchmark, flaky rounding bug), 0 outcome. `not-dotnet-performance` and `not-problem-solving` can never fail.

Suggested evals:
- `diag-vs-perf-ambiguous` (positive, the overlap boundary): "Prod API on Linux: CPU sits at 90% since Tuesday's deploy; I need to know which methods are hot." diagnostics should fire because the evidence has to be collected first.
- `diag-vs-observability` (hard negative): "Add OpenTelemetry metrics and an alert for GC pause time to our ASP.NET Core service."
- `outcome-ask-before-prod` (outcome, llm): k8s OOM prompt. PASS if the answer asks before setting `DOTNET_DbgEnableMiniDump` or running `kubectl debug`, and warns that a full dump can cause an OOM kill.

### dotnet-native-interop
- No content defects found.

Evals now: 3 positive, 1 hard negative (AOT JSON), 0 outcome. Its sibling graders can never fail.

Suggested evals:
- `interop-vs-com` (hard negative): "Call this Excel COM automation interface from .NET 10 with ComWrappers."
- `outcome-clong-header` (outcome; regex on last_message): the libtiles header. PASS if `unsigned long` maps to `CULong`, `size_t` to `nuint`, `tiles_last_error` is not freed, and the wrapper uses a `SafeHandle`.

### dotnet-performance
- [low] `SKILL.md:24` says to read `references/critical-patterns.md` (284 lines) "every time". skill-authoring says that content belongs in the body; at least move its Critical list into SKILL.md.

Evals now: 2 positive, 3 hard negatives (csharp, dump, ef-core), 0 outcome. Well balanced.

Suggested evals:
- `perf-vs-unit-testing` (hard negative): "Write xUnit tests for LogLineParser.Parse edge cases."
- `outcome-benchmark-setup` (outcome; regex): base64url prompt. PASS if the answer includes `[MemoryDiagnoser]`, `Baseline = true`, a `--filter`, Release, and runtimes for both net8.0 and net10.0.

### dotnet-template-authoring
- [low] `references/template-json.md` is 153 lines with no table of contents.

Evals now: 3 positive, 1 hard negative, 0 outcome. `not-msbuild` and `not-nuget` can never fail.

Suggested evals:
- `outcome-template-validate` (outcome; regex on last_message): the trigger-template-missing JSON. PASS if the verdict starts "Not ready" and the answer flags shortName `list` as reserved, `identity` containing spaces, the missing `description`/`defaultValue`, and the `auth`/`authMode` prefix clash.

### dotnet-testing
- [med] Overlap with unit-testing; see Summary. The description should name the boundary ("not test strategy: `unit-testing`"), and unit-testing should hand .NET runner syntax to dotnet-testing.
- [low] `references/xunit-nunit-tunit.md:119` tells users to add `public partial class Program;`. On .NET 10 a source generator already makes `Program` public. Mark the line as needed for .NET 9 and earlier only.
- [low] Model is unpinned in all 4 cases.

Evals now: 3 positive, 1 negative (Python, so not a hard negative), 0 outcome.

Suggested evals:
- `dotnet-testing-vs-unit-testing-csharp` (hard negative, the real boundary): "For our C# OrderService, what deserves unit tests versus integration tests, and what should we stop mocking?"
- `dotnet-testing-vs-upgrade` (hard negative): "Migrate our 12 xUnit v2 projects to xunit.v3."
- `outcome-mtp-filter` (outcome; regex on last_message): the trigger-dotnet-testing-3 prompt. PASS if the answer contains `--filter-class` (or `--filter-query`) after `--`, and does not contain `ClassName=`.

### dotnet-upgrade-guide
- [med] `SKILL.md:23-24` gives no end-of-support notice. .NET 8 and .NET 9 reach end of support on 2026-11-10. Say so, tell users not to stop on net9.0, and note the NETSDK1138 EOL warning.
- [med] `references/test-frameworks/xunit-v3.md:12-22` and `vstest-to-mtp.md:64-79` do not cover xunit.v3 4.x or MTP v2 (default since 2026-08). Add a step to choose between 3.x and 4.x, and note that under the .NET 10 SDK, 4.x without `xunit.v3.mtp-off` needs the `global.json` MTP runner. dotnet-testing `SKILL.md:102,105` already states this.
- [low] The .NET 11 area files cover changes only through Preview 3 (`net10-to-net11/overview.md:7`). Plan a refresh after the November GA.
- [low] At 3570 lines this is the largest plugin in the group, but the progressive-disclosure tables are good.

Evals now: 3 positive, 2 hard negatives, 0 outcome.

Suggested evals:
- `upgrade-vs-modernize` (hard negative): "Plan moving our WebForms + WCF system to .NET; we need phases, a risk list and exit criteria."
- `upgrade-vs-nuget` (hard negative): "Bump Serilog across the solution to 4.x."
- `outcome-net8-eol` (outcome, llm): the net8-to-net10 prompt. PASS if it goes through the 9 checklist and does not stop at net9.0, updates the Docker tags and `global.json`, and flags NU1510.

### ef-core
- [med] Its marketplace category is `meta`; see Summary.
- [low] Model is unpinned in all 4 cases.

Evals now: 3 positive, 1 hard negative (vs db-schema-design), 0 outcome. `not-db-schema-design` can never fail.

Suggested evals:
- `ef-core-vs-postgres` (hard negative): "This Postgres query plan shows a seq scan on bookings(tenant_id, starts_at); which index should we add?" (raw SQL, no EF).
- `outcome-migrate-race` (outcome, llm): the trigger-ef-core-2 prompt. PASS if the answer removes `Migrate()` at startup across 3 instances, recommends an idempotent script or bundle, and asks before `database update`.
- `outcome-raw-sql-injection` (outcome; regex): the Dapper ORDER BY prompt. PASS if the fix uses a whitelist and does not interpolate the column name.

### msbuild
- [low] References run to 3278 lines, and 9 files over 100 lines have no table of contents (build-perf-baseline.md has 474 lines). Links go two levels deep: `references/msbuild-antipatterns.md:185,268,286,312,383` link into `antipatterns/`, and those files link back up with `../`. skill-authoring says to keep links one level deep. Merge `antipatterns/additional-antipatterns.md` and `msbuild-antipatterns.md`, or link them directly from SKILL.md.

Evals now: 2 positive, 1 hard negative (package alignment), 0 outcome.

Suggested evals:
- `msbuild-vs-upgrade` (hard negative): "Convert this ToolsVersion=15 csproj with packages.config to SDK-style."
- `outcome-noop-target` (outcome; regex on last_message): the GenerateVersionInfo target. PASS if it adds `Inputs`/`Outputs`, adds the file to `FileWrites`, and moves the output to `$(IntermediateOutputPath)`.

### nuget
- No content defects found. `dotnet package list` on SDK 10+ is correct.

Evals now: 2 positive, 1 hard negative, 0 outcome. Its sibling graders can never fail.

Suggested evals:
- `nuget-vs-dependency-vetting` (hard negative): "Is the NuGet package `FastCsv.Pro` trustworthy enough to add? It has 3k downloads."
- `outcome-cpm-props` (outcome; regex on file contents, with a scaffold): 3 csproj files with different versions. PASS if `Directory.Packages.props` has `ManagePackageVersionsCentrally`, no `Version=` remains on any `PackageReference`, and no version is raised above the highest one already in use.

### roslyn-analyzers
- [low] `SKILL.md:29` says not to wrap a generator with `AsSourceGenerator`, but `references/source-generators.md:77` uses `AsSourceGenerator()` for the test driver and explains why. The SKILL.md line can steer tests away from the standard `CSharpGeneratorDriver.Create(gen.AsSourceGenerator())`. Say "don't wrap an `ISourceGenerator`".

Evals now: 2 positive, 1 hard negative (CA warnings in app code), 0 outcome. `not-csharp` can never fail.

Suggested evals:
- `trigger-roslyn-cs8032` (positive): "Our analyzer NuGet works in dotnet build but VS shows CS8032 and nothing runs."
- `outcome-generator-cache` (outcome; regex): the trigger-roslyn-analyzers-2 prompt. PASS if it uses `ForAttributeWithMetadataName`, drops `.Combine(CompilationProvider)`, and uses a value-equatable model.

### esp-idf
- [med] `templates/scripts/flash.sh:4-5` says to "Check sdkconfig for security options first", but the script never does. The skill's own gate (`SKILL.md:33`) names the keys. Make flash.sh grep the resolved `sdkconfig` for `CONFIG_SECURE_BOOT`, `CONFIG_SECURE_FLASH_ENC_ENABLED`, `CONFIG_SECURE_DISABLE_ROM_DL_MODE`, `CONFIG_BOOTLOADER_APP_ANTI_ROLLBACK` and `CONFIG_NVS_SEC_KEY_PROTECT_USING_HMAC`, and refuse unless `ACK_EFUSE=1` is set. This is the one irreversible-hardware path, so the code should enforce the gate rather than rely on prose.
- [low] Version facts carry an "as of 2026-10-17" date stamp (`SKILL.md:17`) and match the v6.1 release. They will go stale; consider moving them to a reference file.
- [low] It is in no meta and has no recommend-plugins rule (see Cross-group notes).

Evals now: 1 positive, 0 negatives, 0 outcome. This is the weakest suite in the group, and its `not-problem-solving` grader can never fail.

Suggested evals:
- `trigger-esp-ota-rollback` (positive): "After an OTA the device boots the new image, then reverts to the old one after a reset. idf_component.yml and partitions.csv attached."
- `trigger-esp-secure-boot` (positive, casual): "how do i turn on flash encryption on my esp32-s3 for prod".
- `esp-vs-stm32` (hard negative): "HardFault on STM32F4 with HAL when I enable the DMA on USART2."
- `esp-vs-arduino` (hard negative, or document the intent if it should fire): "Arduino sketch for an ESP32 DevKit: debounce a button on GPIO0."
- `outcome-flash-gate` (outcome; regex on last_message plus tool_used with max 0 on Bash): the sdkconfig has `CONFIG_SECURE_FLASH_ENC_ENABLED=y`. PASS if the answer names the permanent eFuse effects and asks before flashing.

## Cross-group notes

- **The eval harness makes sibling checks impossible (systemic).** This affects every plugin in the repo that ships a single skill, not just this group. The house pattern copied from `archive/plugins/api` worked because that plugin held both skills. Options: (a) drop the `not-<sibling>` graders and keep only the `not-<own-skill>` hard negatives; (b) put overlapping pairs into one eval target, for example a scratch plugin whose dependencies are both; (c) test boundaries with a `claude -p` sweep with the meta installed (skill-authoring:96). Add a line to skill-evals saying this.
- **Add a category consistency check to `plugins.py check`**, so mis-tags like aspnet-core and ef-core fail the build.
- **Missing recommend-plugins evidence rules** (`plugins/recommend-plugins/skills/recommend-plugins/SKILL.md:71-90`):
  - `<TargetFramework>` net8.0/net9.0, `ToolsVersion` or `packages.config` → dotnet-upgrade-guide (or add it to dotnet-meta)
  - a `BenchmarkDotNet` package → dotnet-performance
  - `Microsoft.CodeAnalysis.CSharp` or `IsRoslynComponent` → roslyn-analyzers
  - `.template.config/template.json` → dotnet-template-authoring
  - `Microsoft.Extensions.AI*`, `Microsoft.Agents.AI*` or `Microsoft.ML` → dotnet-ai-apps
  - `LibraryImport`/`DllImport` in `*.cs` → dotnet-native-interop
  - `sdkconfig`, `idf_component.yml` or `CMakeLists.txt` with `idf_component_register` → esp-idf

  dotnet-diagnostics has no repo signal (Dockerfile or k8s plus csproj at most). Consider adding it, with dotnet-performance, to dotnet-meta.
- **unit-testing (programming-core) and dotnet-testing are both installed by dotnet-meta.** Edit both descriptions so each names the other in its "not for" boundary.
- **csharp versus godot-csharp**: both match `.cs` files; csharp should name godot-csharp in its "Not for" line.
- **dotnet-ai-apps routes to `claude-api`**, which is not an adminhead plugin (it says "if installed", so this is fine). aspnet-core, csharp and others call codebase-memory tools (`search_graph`, `trace_path`) that only exist when an external MCP is installed; the fallbacks are present, so this is fine too.
