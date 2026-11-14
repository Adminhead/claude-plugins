# G4 .NET skills and esp-idf, 2026-11-14

Scope: aspire, aspnet-core, blazor, csharp, dotnet-ai-apps, dotnet-diagnostics, dotnet-native-interop, dotnet-performance, dotnet-template-authoring, dotnet-testing, dotnet-upgrade-guide, ef-core, msbuild, nuget, roslyn-analyzers, esp-idf. I read every SKILL.md in full and sampled references (ai-apps agents.md, xunit-v3.md, net10-to-net11 notes, flash.sh, NOTICE files, evals layout). Large reference sets (msbuild 3100 lines, upgrade-guide 3400 lines, performance 1500 lines) were read by table of contents and spot checks only, not line by line. Nothing was run except a PyYAML parse of the 16 frontmatters (all parse; descriptions 321 to 352 characters) and two web lookups (below).

## Summary

- Verdicts (16): KEEP 6 (dotnet-testing, dotnet-ai-apps, aspire, msbuild, nuget, dotnet-native-interop), KEEP-FIX 5 (dotnet-upgrade-guide, esp-idf, roslyn-analyzers, ef-core, aspnet-core), SLIM 2 (csharp, blazor), MERGE 2 (dotnet-performance into dotnet-diagnostics, dotnet-template-authoring into nuget), DEPRECATE 0. dotnet-diagnostics is KEEP and is the merge target.
- **[high] The .NET 11 facts are now wrong.** The Microsoft support-policy page shows .NET 11 GA on 2026-11-10 (STS, supported to 2028-11-14), RC3 on 2026-10-25, and .NET 8 and 9 both out of support since 2026-11-10. Our files still say ".NET 11 is prerelease until its November 2026 GA" (`dotnet-upgrade-guide/SKILL.md:24`, six files under `references/net10-to-net11/`), tell the model to confirm the user wants a prerelease, and say nothing about .NET 8 or 9 being EOL (`SKILL.md:23`). F8 item 1 is therefore settled: it needs an edit, not just a source check.
- **[high] xunit.v3 4.x is real.** NuGet lists xunit.v3 4.0.0 to 4.0.3 stable. `dotnet-testing` handles 4.x and MTP v2 (`SKILL.md:102,105`). `dotnet-upgrade-guide`'s `xunit-v3.md:52-53` and `vstest-to-mtp.md` still do not (STILL OPEN from the 10-23 review). A model following the upgrade guide for a v2 to v3 move installs the latest (4.x) and then follows a VSTest path that is invalid under the .NET 10 SDK.
- **[med] Only 4 of 15 .NET plugins are reachable by default.** dotnet-meta installs csharp, msbuild, dotnet-testing, nuget. recommend-plugins proposes aspnet-core, ef-core, blazor and aspire (`recommend-plugins/SKILL.md:75-79`). dotnet-upgrade-guide, dotnet-diagnostics, dotnet-performance, dotnet-native-interop, roslyn-analyzers, dotnet-template-authoring, dotnet-ai-apps and esp-idf have no install path, and the 10-23 recommend-plugins rules are still missing. Fix: add dotnet-upgrade-guide to dotnet-meta, and add the evidence rules.
- Value picture: the highest-value content is what postdates training or is commonly wrong (list below). The lowest is textbook C#/EF/ASP.NET guidance that Sonnet 5.5 already follows. No outcome eval exists for any plugin in the family, so lift is unmeasured everywhere.
- Prior review: 16 items re-checked, 6 FIXED, 2 PARTLY, 8 STILL OPEN.
- The family has near-zero usage: esp-idf is the only plugin with a load (1 load, 1 call, 9 sessions listed). The four meta members were listed in 7 sessions each with 0 calls.

## Facts newer than training or commonly wrong (the part that earns its place)

| Plugin | Fact | Evidence |
|---|---|---|
| dotnet-testing | VSTest vs MTP command shape, the `--` bridge, xunit v3 `--filter-*` flags (a VSTest `--filter` passed to xunit v3 runs zero tests and exits 0), SDK 10 `global.json` `test.runner`, MTP v2 dropping the bridge, `dotnet new xunit` still emitting v2 | `dotnet-testing/SKILL.md:8,18-23,46,101-105` |
| dotnet-ai-apps | Agent Framework 1.x names (`AsAIAgent`, `AgentSession`, `CreateSessionAsync`; `AgentThread`/`GetNewThread` are pre-1.0), no `RetryingChatClient`, no `MaximumIterations` run option, `MaximumIterationsPerRequest`, package `Microsoft.Extensions.DataIngestion`, `Microsoft.Extensions.AI.Ollama` deprecated | `dotnet-ai-apps/SKILL.md:76-81` |
| aspire | Aspire 13.x CLI (`start`, `wait`, `describe`, `logs`, `otel`, `doctor`, `docs`), compute environments replacing `aspire publish -p`, `WithHttpHealthCheck`, `Aspire.Hosting.JavaScript`, file-based `apphost.cs`, TypeScript AppHost | `aspire/SKILL.md:46,59-66,77-79`; `aspire/NOTICE:14-23` lists upstream errors it corrected |
| dotnet-upgrade-guide | Per-hop breaking changes 8 to 9, 9 to 10, 10 to 11 (3400 lines); NU1510; test-framework floors (MSTest v4, xunit.v3) | `dotnet-upgrade-guide/SKILL.md:42-69,75-76` |
| aspnet-core | .NET 10: `AddValidation()` only sees its own assembly, `WithOpenApi()` deprecated (ASPDEPR002), XML comments on lambdas never reach OpenAPI, cookie auth returns 401/403 for API endpoints, request JSON read via `PipeReader` | `aspnet-core/SKILL.md:22,27,57-59,63` |
| blazor | .NET 10 `[PersistentState]` on a public property with `??=`, `HttpContext` null under interactive modes, `CascadingValue` not crossing render modes | `blazor/SKILL.md:54-57` |
| ef-core | EF 10: parameterized collections, named query filters, `LeftJoin`, log redaction, analyzer on raw SQL concatenation; EF 9 `PendingModelChangesWarning` throws | `ef-core/SKILL.md:42,63,92`; `references/ef-core-10.md` |
| dotnet-diagnostics | `dotnet-trace collect-linux` (.NET 10, kernel 6.4+, preview format), `--providers` drops default profiles, `--duration dd:hh:mm:ss`, plus ask-before-touching-production rules | `dotnet-diagnostics/SKILL.md:42,77-79` |
| dotnet-native-interop | `CLong`/`CULong` need `DisableRuntimeMarshalling` (SYSLIB1051), `bool` marshalling sizes, `size_t` is `nuint` | `dotnet-native-interop/SKILL.md:44-47,101` |
| nuget | `dotnet package list` on SDK 10+, trusted publishing, NU1008/1010/1507 meanings | `nuget/SKILL.md:29,53-60`; `references/trusted-publishing.md` |
| roslyn-analyzers | CS8032 host-version load failures, obsolete `*.Testing.XUnit` packages, `ForAttributeWithMetadataName`, RS1035 | `roslyn-analyzers/SKILL.md:85,92-96` |
| esp-idf | ESP-IDF v6.0 removed legacy ADC/DAC/timer-group/RMT/I2S/PCNT/MCPWM drivers, v6.1 is current, first-boot eFuse burn even in development flash-encryption mode | `esp-idf/SKILL.md:17,31-33` |

Mostly textbook (restates Microsoft Learn or common practice): `csharp` Types, Async, Errors and Host sections (`csharp/SKILL.md:24-67`), most of `aspnet-core/references/web-api.md` (232 lines) and `crud-scaffolding.md`, `blazor` component and async rules (`blazor/SKILL.md:32-50`) and the `components.md`/`forms.md`/`state.md` references, the `dotnet-performance` anti-pattern catalog (about 1100 reference lines), `ef-core` review workflow and fixes table (`ef-core/SKILL.md:20-57`), `dotnet-template-authoring` template.json basics.

## Prior findings re-checked

| Prior finding (10-23 G4 / plan) | Status | Evidence |
|---|---|---|
| Inert `not-<sibling>` graders (C1/V26) | FIXED | No `not-*` grader files remain under any of the 16 plugins' `evals/` |
| No outcome evals in the family | STILL OPEN | `ls plugins/*/evals` shows no `outcome-*` case in any of the 16 |
| All cases `runs: 1` (V28/F3) | STILL OPEN | 53 of 53 cases have `runs: 1` |
| aspnet-core, ef-core, dotnet-testing models unpinned | STILL OPEN | 12 cases unpinned (aspnet-core 4, dotnet-testing 4, ef-core 4); the other 13 plugins pin `claude-sonnet-5-5` |
| aspnet-core and ef-core category `meta` | FIXED | `marketplace.json:1162,1232` now `development` (the lines near 1169/1239 also read `development`) |
| Strict-YAML failures (V20), aspire and aspnet-core among them | FIXED for this family | `yaml.safe_load` succeeds on all 16 SKILL.md frontmatters |
| .NET 8/9 EOL not mentioned, upgrade chain 8 to 11 | STILL OPEN, now worse | `grep -i "end of support\|EOL\|NETSDK1138"` over upgrade-guide, csharp, dotnet-testing and aspnet-core: no hits. Policy page says EOL 2026-11-10 |
| xunit.v3 4.x and MTP v2 missing from upgrade-guide | STILL OPEN | `xunit-v3.md:52-53` still `IsTestingPlatformApplication=false` VSTest path; no 4.x mention; 4.0.0 to 4.0.3 exist on NuGet |
| .NET 11 files only through Preview 3 | STILL OPEN, now stale | Files say "prerelease until November 2026 GA"; GA was 2026-11-10 |
| csharp description omits CA/IDE warnings, `.editorconfig` | STILL OPEN | `csharp/SKILL.md:3` unchanged (`SKILL.md:73` owns them, `roslyn-analyzers/SKILL.md:10` hands them over) |
| csharp TFM map stops at net10.0; no `godot-csharp` in Not-for | STILL OPEN | `csharp/SKILL.md:16` stops at C# 14; no `godot` hit in the file |
| aspire `logs --tail` vs `-n` | STILL OPEN | `aspire/SKILL.md:63` `--tail 200`; `references/cli.md:35` `[-f] [-n N]` |
| aspire `.aspire/settings.json` fallback signal | STILL OPEN | only `aspire.config.json` at `SKILL.md:8,16` |
| roslyn-analyzers `AsSourceGenerator` wording | STILL OPEN | `SKILL.md:29` vs `references/source-generators.md:65,77` |
| dotnet-testing `public partial class Program;` on .NET 10 | PARTLY | `references/xunit-nunit-tunit.md:119` still gives the line without a version note (not re-verified that a .NET 10 generator makes it redundant; UNVERIFIED) |
| esp-idf `flash.sh` claims to check sdkconfig but does not | STILL OPEN | `templates/scripts/flash.sh:4-5` comment, no grep in the body (lines 11-21) |
| unit-testing and dotnet-testing boundary | PARTLY | `dotnet-testing/SKILL.md:10` names `unit-testing`; unit-testing SKILL.md has no `dotnet` mention |
| recommend-plugins rules for the orphans | STILL OPEN | `recommend-plugins/SKILL.md:75-79` has only dotnet-meta, aspnet-core, ef-core, blazor, aspire |
| Missing hard-negative eval cases (esp-idf 1 case only) | STILL OPEN | esp-idf has one trigger case (`esp-panic-routing`) |

## Per-plugin

### dotnet-testing — KEEP (high)
- Value: K-private plus K-decision. The detect-then-command procedure (`SKILL.md:12-49`) fixes the mistake models make most here, using a VSTest filter or flag on an MTP project. It also holds the post-training xunit.v3 4.x and MTP v2 facts (`:101-105`).
- Evidence: listed 7 sessions, 0 calls; no outcome evals; in dotnet-meta.
- Fixes: [med] add a version note at `references/xunit-nunit-tunit.md:119` for `Program` visibility. [med] add the hard-negative against `unit-testing` (C# strategy prompt) and pin the model in all 4 cases. [med] add outcome case `outcome-mtp-filter` (PASS: `--filter-class` or `--filter-query` after `--`, no `ClassName=`). [low] `references/run-and-filter.md:22` says "Starting with .NET 11 Preview 6"; reword now that 11 is GA, and confirm the GA behavior (needs source check).

### dotnet-upgrade-guide — KEEP-FIX (high)
- Value: K-private. Per-hop breaking-change checklists from the .NET team's migration skills, which postdate training for 9 to 10 and 10 to 11 (`SKILL.md:42-69`). This is the plugin most worth adding to dotnet-meta.
- Evidence: listed 7 sessions, 0 calls; 40 files, 3450 lines; no outcome eval.
- Fixes: [high] `SKILL.md:23-24` and the six `net10-to-net11/*.md` notes: replace the prerelease framing with ".NET 11 GA 2026-11-10 (STS, to 2028-11-14)", drop "confirm the user wants a prerelease", and recheck the "(Preview N)" items against the GA release notes. [high] Add: .NET 8 and 9 are out of support since 2026-11-10, so never stop a chain on net9.0; mention the NETSDK1138 EOL warning; recommend .NET 10 LTS as the default target for production. [high] `references/test-frameworks/xunit-v3.md:45,52-53` and `vstest-to-mtp.md:64-79`: add a choose-3.x-or-4.x step. Under the .NET 10 SDK, 4.x without `xunit.v3.mtp-off` needs the `global.json` runner (state taken from `dotnet-testing/SKILL.md:102`, which should be confirmed against xunit docs). [med] Add to dotnet-meta (see Cross-plugin). [low] Add outcome case `outcome-net8-eol`.
- Upstream: `dotnet-upgrade` (6 skills, MIT, last commit 2026-10-16). Our merge into one skill with hop tables is the better listing shape; keep the fork but refresh from upstream's GA commits.

### dotnet-ai-apps — KEEP (high)
- Value: K-private. `SKILL.md:76-81` lists exactly the names that older blog posts and model memory get wrong. The classify-first table (`:23-33`) is also K-decision (ML.NET vs LLM).
- Evidence: listed 6 sessions, 0 calls (not in a meta); 5 trigger cases, no outcome.
- Fixes: [low] date each package table like `references/agents.md:7` does (llm.md and rag.md tables). [low] `outcome-churn-mlnet`. Upstream `dotnet-ai` (1 skill) exists, but this fork carries corrections upstream does not (`NOTICE`); do not swap.

### aspire — KEEP (medium-high)
- Value: K-private (Aspire 13.x CLI and APIs after training; `NOTICE:14-23` records corrections of the awesome-copilot upstream). Upstream awesome-copilot is a collection, not an installable plugin, so there is nothing to link.
- Evidence: listed 4 sessions, 0 calls; 3 cases, no outcome.
- Fixes: [low] `SKILL.md:63` use `aspire logs api -n 200` to match `references/cli.md:35`. [low] add `.aspire/settings.json` as a fallback detection signal at `SKILL.md:8,16`. [med] needs source check: Aspire 13.6 versions and command names (dated 2026-10-17; releases roughly monthly).

### aspnet-core — KEEP-FIX (medium)
- Value: K-private for the .NET 10 gotchas (`SKILL.md:22,27,57-59,63`); the rest (DTO naming, status codes, cancellation, CRUD scaffolding) is common practice. Competes with upstream `dotnet-aspnetcore` (2 skills) which it was merged from.
- Evidence: listed 3 sessions, 0 calls; 4 cases, none pinned.
- Fixes: [med] pin the model in all 4 cases; add `outcome-validation-net10` (PASS: `AddValidation()`, `Results<...>`, no `.WithOpenApi()`). [low] cut `references/crud-scaffolding.md` (42 lines) and trim `web-api.md` examples to the version-gated parts (about 100 lines saved). If trimmed hard, verdict becomes SLIM.

### blazor — SLIM (medium)
- Value: K-private for .NET 9/10 APIs and render-mode traps (`SKILL.md:19,54-57`). The component and async rules (`:32-50`) and `references/components.md`, `forms.md`, `state.md`, `create-project.md` are largely standard Blazor guidance.
- Evidence: listed 9 sessions (most in this family besides esp-idf), 0 calls.
- Keep: SKILL.md, `prerendering.md`, `auth.md`, `js-interop.md`, `server-to-webapp.md`, about 550 of 1056 lines. Cut or fold the rest.
- Fixes: [low] add a table of contents to the five reference files over 100 lines (auth, data, js-interop, components, prerendering). [med] add `outcome-persistent-state`.
- Loses: Haiku-tier reminders on EventCallback and disposal.

### csharp — SLIM (medium; Haiku would lose some)
- Value: mixed. K-decision where the model's habits are wrong: `null!` and `x?.M()` to silence CS8602 (`:35,37`), contract preservation (`:9`), file-based apps and System.CommandLine v2 references. About 45 lines of Types, Async, Errors and Host bullets (`:24-67`) restate what Sonnet 5.5 already does.
- Evidence: in dotnet-meta, listed 6 sessions, 0 calls.
- Keep about 40 of 83 SKILL.md lines (Orient, Nullability, Verify, references); move any non-obvious async rule (`Task.WhenAny` loser, `Lock`, no `await` in `lock`) to a short list.
- Fixes: [med] description (`:3`) add "CA/IDE analyzer warnings and .editorconfig severities"; the Not-for line add `godot-csharp`. [med] `:16` add net11.0 = C# 15 (GA 2026-11-10); remove "preview until .NET 11 GA" at `:83`, and check `references/net11-apis.md` for GA changes. [low] add `outcome-nullable-no-bang`.

### msbuild — KEEP-FIX (medium)
- Value: Tooling-adjacent K-decision (binlog replay with `dotnet msbuild x.binlog`, `-getProperty`, `-pp`, root-cause-vs-cascade, `-bl:name` overwrite warning, `SKILL.md:16,18,72`). Models do read a binlog badly without this. 3133 lines, ported from upstream (`dotnet/skills` `dotnet-msbuild`, 19 skills plus an unpinned `binlog` MCP server, which we rightly did not take).
- Evidence: in dotnet-meta, listed 15 sessions (highest in the family), 0 calls; 3 cases.
- Fixes: [low] flatten two-level links (`references/msbuild-antipatterns.md:185,268,286,312,383` into `antipatterns/`); merge the two antipattern catalogs. [low] add a TOC to nine reference files over 100 lines. [low] add `msbuild-vs-upgrade` hard negative and `outcome-noop-target`.

### nuget — KEEP (medium)
- Value: K-decision (guard on `packages.config`, alignment rule "never raise past the highest version in scope", `SKILL.md:17-18,34`) plus current facts (SDK 10 `dotnet package list`, trusted publishing, NU codes). Small (408 lines).
- Evidence: in dotnet-meta, listed 3 sessions, 0 calls.
- Fixes: [low] add `outcome-cpm-props`, `nuget-vs-dependency-vetting` hard negative. If template-authoring merges here, extend the description by one clause.

### dotnet-diagnostics — KEEP (medium-high; merge target)
- Value: K-private plus Enforcement-in-prose. The ask-before-production rules (`SKILL.md:14-19`) change the model's behavior, the tool matrix covers `collect-linux`, and the gotchas (`:77-83`) are commonly wrong.
- Evidence: listed 10 sessions, 0 calls; 5 cases; upstream `dotnet-diag`.
- Fixes: [low] add `outcome-ask-before-prod` and `diag-vs-perf-ambiguous`.

### dotnet-performance — MERGE into dotnet-diagnostics (medium-low)
- Value: partly K-decision, mostly Generic. The hot-path gate (`SKILL.md:12-20`), benchmark rules (`:54-61`) and the "common mistakes" table (`:65-77`) change behavior. The detection recipes and reference catalog (async, strings, LINQ, regex, collections, JSON; about 1100 lines) are textbook for current models.
- Evidence: listed 10 sessions (installed somewhere), 0 calls; 5 cases; overlaps diagnostics by design (its own text hands off to diagnostics at `:20`).
- Move: gate, BenchmarkDotNet rules and references (`benchmarkdotnet*.md`, `critical-patterns.md`, `simd.md`) into a `references/` area of dotnet-diagnostics, with the description gaining "BenchmarkDotNet, hot-path review, SIMD". Drop the generic anti-pattern references or keep only Critical items. Lost: Haiku-tier recipe lists.
- Fix if kept separate: [low] `SKILL.md:24` says to read `critical-patterns.md` "every time"; move its Critical list into SKILL.md.

### dotnet-native-interop — KEEP (medium)
- Value: K-private and commonly wrong (CLong/CULong, `bool` sizes, ownership, delegate rooting; `SKILL.md:44-47,101-105`). Rarely triggered but cheap (442 lines) and the failures it prevents are silent corruption. Upstream is `dotnet-advanced/dotnet-pinvoke`, ours is a rewrite with corrected version floors (`NOTICE`).
- Fixes: [low] `outcome-clong-header`.

### dotnet-template-authoring — MERGE into nuget (low-medium; DEPRECATE is the alternative)
- Value: K-decision on a narrow task. The gotchas (reserved `shortName`s, restore post-action GUID, `<!--#if` in XML, parameter-name prefix clash; `SKILL.md:55-58,90-94`) are real but a model gets template.json mostly right, and `dotnet new` help covers the rest. Upstream `dotnet-template-engine` (6 skills plus agent) is maintained but too heavy to link.
- Evidence: listed 3 sessions, 0 calls; 4 cases, none outcome. nuget already owns "template packages" (`nuget/SKILL.md:21`).
- Move `references/template-json.md`, `validation-rules.md`, `packaging.md` (about 330 lines) under nuget, loaded only on "dotnet new template" requests, plus the gotcha list. Lost: a standalone trigger for "template missing from dotnet new list"; keep that phrase in nuget's description. If the owner does not author templates, DEPRECATE (Unused) loses only that checklist.

### ef-core — KEEP-FIX (medium)
- Value: mixed. K-decision where it overrides habit (gate source-only findings `:27-32`, `ExecuteUpdate` caveats `:89`), K-private for EF 9/10 (`:42,63,92`, `ef-core-10.md`), plus a Dapper reference. The review workflow and fixes table are known to Sonnet 5.5.
- Evidence: listed 4 sessions, 0 calls; 4 cases, none pinned.
- Fixes: [med] pin the model in all 4 cases. [med] add `outcome-migrate-race` and `outcome-raw-sql-injection`. [low] add `ef-core-vs-postgres` hard negative.

### roslyn-analyzers — KEEP-FIX (medium)
- Value: K-decision and K-private. Expert rules (`IOperation` first, no `ToDisplayString` comparisons, separate Workspaces assembly, CS8032, obsolete testing packages; `SKILL.md:20-29,92-96`). Niche but the generator caching rules fail silently without it. Source: awesome-copilot, not installable as a plugin.
- Evidence: listed 3 sessions, 0 calls.
- Fixes: [low] `SKILL.md:29` change to "don't wrap an `ISourceGenerator`"; `references/source-generators.md:65,77` is the correct driver usage. [low] `outcome-generator-cache` and `trigger-roslyn-cs8032`.

### esp-idf — KEEP-FIX (medium-high)
- Value: K-private plus Enforcement-by-prose. The v6.0 driver removals and v6.1 current version (`SKILL.md:17`) postdate training, and the eFuse confirmation gate (`:27-33`) covers the irreversible-hardware path. It is the only plugin in the family with a real load (1 load, 1 call, 9 listed).
- Fixes: [med] `templates/scripts/flash.sh:4-5` promises a security check that is not in the script. Add a grep of `sdkconfig` for the keys at `SKILL.md:33` and refuse without `ACK_EFUSE=1`. [med] move the dated version block (`SKILL.md:17`) to a reference and recheck v6.1 facts (needs source check). [med] evals: add `trigger-esp-ota-rollback`, `esp-vs-arduino`, `outcome-flash-gate`. [low] add to recommend-plugins (`sdkconfig`, `idf_component.yml`, `idf_component_register`).

## Cross-plugin findings

- **dotnet-meta membership.** Add `dotnet-upgrade-guide` (the one orphan whose content is mostly K-private and whose trigger, "upgrade to .NET 10", fires on any repo targeting net8.0 or net9.0, both now out of support). Leave the other orphans opt-in and give them recommend-plugins rules, as listed in the 10-23 review: `BenchmarkDotNet` package to dotnet-performance (or diagnostics after the merge), `Microsoft.CodeAnalysis.CSharp`/`IsRoslynComponent` to roslyn-analyzers, `Microsoft.Extensions.AI*`/`Microsoft.Agents.AI*`/`Microsoft.ML` to dotnet-ai-apps, `LibraryImport`/`DllImport` to dotnet-native-interop, `.template.config/template.json` to nuget (post-merge), and the ESP-IDF files to esp-idf.
- **Merged shape, 15 .NET plugins to 13.** dotnet-performance into dotnet-diagnostics, and dotnet-template-authoring into nuget. dotnet-meta then installs csharp, msbuild, dotnet-testing, nuget and dotnet-upgrade-guide (5 listings). The owner-facing plugins behind recommend-plugins stay: aspnet-core, ef-core, blazor, aspire, dotnet-ai-apps, roslyn-analyzers, dotnet-native-interop, dotnet-diagnostics.
- **Link upstream instead of forking?** Upstream `dotnet/skills` is installable (`.claude-plugin/marketplace.json`, name `dotnet-agent-skills`, 16 plugins, MIT, last commit 2026-10-16, eval suite per skill). `docs/research/design-dotnet.md:11,29-39` already rejected a cross-dependency, and the reasons still hold: allowlisting exposes all 16 plugins, `dotnet-test` is 24 skills and 10 agents, `dotnet-msbuild` is 19 skills plus an unpinned prerelease MCP server, and upstream descriptions are routing-tuned ("ALWAYS USE"). The only small upstream plugins that map one-to-one (`dotnet-nuget` 1 skill, `dotnet-ai` 1 skill, `dotnet-aspnetcore` 2, `dotnet-data` 2) are the ones where we carry our own corrections, so linking loses those. Recommendation: keep the forks, but record the pinned upstream commit (all NOTICEs pin `10d85e2`, 2026-10-16) and re-diff `dotnet-upgrade` and `dotnet-test` (the two with fast-moving facts) when .NET 11 GA content lands upstream. aspire and roslyn-analyzers come from awesome-copilot, which has no installable plugin, so there is nothing to link.
- **No `claude-api`-style collision**: dotnet-ai-apps routes Anthropic specifics to `claude-api` (`SKILL.md:10`), which is a built-in skill here; fine.
- **Sibling overlap**: testing vs `unit-testing` (handoff still one-way), performance vs diagnostics (merge resolves), csharp vs roslyn-analyzers (needs the csharp description fix).

## Needs source check

- .NET 11 GA 2026-11-10 STS, .NET 8/9 EOL 2026-11-10, RC3 2026-10-25: from the Microsoft support-policy page (fetched 2026-11-14); the "supported to 2028-11-14" figure and "latest patch 10.0.15" were read from that page as summarized. Recheck GA-version breaking changes before rewriting the net10-to-net11 notes ("Preview N" labels throughout).
- xunit.v3 4.0.0 to 4.0.3 exist (NuGet flat container, fetched). The claims that 4.x removed MTP v1 and that the .NET 10 SDK needs `xunit.v3.mtp-off` or the `global.json` runner are UNVERIFIED here (taken from `dotnet-testing/SKILL.md:102,105`).
- C# 15 as the net11.0 default language version: UNVERIFIED.
- Aspire 13.6 CLI surface, Agent Framework 1.25.0, Microsoft.Extensions.AI 10.11.0, BenchmarkDotNet 0.15.8: dated October 2026 in the files, not rechecked.
- ESP-IDF v6.1 (2026-08-27), v6.0 driver removals and I2C end-of-life: not rechecked.
- `Program` visibility on .NET 10 (`xunit-nunit-tunit.md:119`): claim from the prior review, not rechecked.
