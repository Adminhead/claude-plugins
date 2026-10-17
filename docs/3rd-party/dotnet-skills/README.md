# dotnet/skills

Source: https://github.com/dotnet/skills · License: MIT (Copyright .NET Foundation and Contributors) · Last commit: 2026-10-16 (`10d85e2`, merge of #1301 `adjust-grid-css-path`) · Catalog: [catalog.md](catalog.md)

## Purpose

The .NET team's official skills and custom agents for coding agents (Copilot CLI, Claude Code, VS Code, Cursor, Codex). It covers C# refactoring, MSBuild, NuGet, testing, test-framework migrations, version upgrades, runtime diagnostics, ASP.NET Core, Blazor, MAUI, WinForms, EF Core and .NET AI. Each skill is backed by an `eval.yaml` scenario suite, and a public dashboard (https://dotnet.github.io/skills/) reports activation, token use and pass rates per skill and model. Very active: 100+ commits in the 30 days before the survey, 65 contributors, a nightly `skill-validator` release.

## Layout

- `.claude-plugin/marketplace.json`: the `dotnet-agent-skills` marketplace, 16 plugins. `plugins/dotnet-experimental/` exists on disk but is not listed.
- `plugins/<plugin>/`: one directory per plugin with three manifests (`plugin.json` for agent-plugins.org, `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`), `skills/<name>/SKILL.md` with `references/`, sometimes `scripts/` and `assets/`, and Copilot-format `agents/*.agent.md`.
- `plugins/dotnet/`: also declares a C# LSP (`lsp.json` and `.lsp.json`) that runs `dnx roslyn-language-server --prerelease` and needs the .NET 10 SDK.
- `plugins/dotnet-msbuild/`: also declares a `binlog` MCP server (`dotnet dnx Microsoft.AITools.BinlogMcp --yes --prerelease`, unpinned).
- `tests/<plugin>/<skill>/eval.yaml`: 109 eval suites with fixtures (some, such as `dotnet-aot-compat`, are full before/after projects).
- `eng/`: the skill-validator, evaluation runners, dashboard and coverage tooling.
- `agentic-workflows/`: GitHub Agentic Workflows (build-failure analysis, MSBuild review, test-failure analysis, unskip-closed-tests).
- `.agents/skills/` (5) and `.github/`: maintainer-only skills (create-skill, create-skill-test, improve-skill-quality, authoring-github-workflows, create-custom-agent), CI and CODEOWNERS.

## Counts

- 1 marketplace, 16 listed plugins (17 on disk, each with 3 manifests, so the catalog shows 51).
- 105 plugin skills, plus 8 maintainer skills under `.agents/` and `.github/` (catalog: 113).
- 17 plugin agents (`.agent.md`, Copilot custom-agent format), plus 5 repo-internal (catalog: 22).
- 0 hooks files. 1 LSP declaration, 1 MCP server.

| Plugin | Skills | Agents | Description listing (chars) |
|---|---|---|---|
| dotnet-test | 24 | 10 | ~14,200 |
| dotnet-msbuild | 19 | 3 (+ binlog MCP) | ~12,100 |
| dotnet-blazor | 10 | 0 | ~6,500 |
| dotnet-maui | 8 | 0 | ~6,100 |
| dotnet-template-engine | 6 | 1 | ~4,700 |
| dotnet-upgrade | 6 | 0 | ~4,300 |
| dotnet-test-migration | 6 | 1 | ~3,800 |
| dotnet-diag | 7 | 1 | ~3,800 |
| dotnet | 4 (+ LSP) | 0 | ~2,800 |
| dotnet-advanced | 4 | 0 | ~1,800 |
| dotnet11, dotnet-aspnetcore, dotnet-data | 2 each | 0 | ~1,200 each |
| dotnet-ai, dotnet-nuget, dotnet-winforms | 1 each | 0 | ~600-900 each |
| dotnet-experimental (unlisted) | 2 | 0 | ~1,300 |

## Themes

| Theme | Skills |
|---|---|
| C# core | csharp-expert (router), csharp-refactoring, setup-local-sdk, csharp-scripts (file-based apps), dotnet-pinvoke, vectorization |
| MSBuild and NuGet | msbuild (consolidated entry with 9 references), 19 specialist MSBuild skills (binlogs, perf baseline and diagnostics, incremental, eval perf, items, properties, targets, extension points, Directory.Build, modernization, antipatterns), convert-to-cpm, nuget-trusted-publishing |
| Testing | run-tests, platform-detection, filter-syntax, writing-mstest-tests, scaffold-dotnet-test-project, mtp-hot-reload, coverage-analysis, crap-score, testability seams (detect-static-dependencies, generate-testability-wrappers, migrate-static-to-wrapper, testability-obstacle), polyglot audits (assertion-quality, test-anti-patterns, test-smell-detection, test-gap-analysis, grade-tests, test-tagging, test-value-evidence, find-untested-sources, code-testing) |
| Migrations | .NET 8 to 9, 9 to 10, 10 to 11 (one reference per area), nullable references, Native AOT and trimming, Thread.Abort; MSTest v1/v2 to v3, v3 to v4, xUnit v2 to v3, xUnit or NUnit to MSTest, VSTest to MTP |
| Diagnostics | analyzing-dotnet-performance (~50 anti-patterns), dotnet-trace-collect, dump-collect, microbenchmarking (BenchmarkDotNet), Android and Apple crash symbolication, CLR activation logs |
| Web | dotnet-webapi, convert-blazor-server-to-webapp, create-datadriven-aspnetcore, optimizing-ef-core-queries, 10 Blazor skills (components, forms, auth, state, data, prerendering, JS interop, project creation, UI planning, Ignite UI) |
| Apps | 8 MAUI skills (doctor, lifecycle, CollectionView, binding, DI, safe area, Shell, theming), winforms-expert, technology-selection (.NET AI: MEAI, Agent Framework, ML.NET, ONNX) |
| .NET 11 | process-api-net11, system-text-json-net11 |

## Install / use

```
/plugin marketplace add dotnet/skills
/plugin install <plugin>@dotnet-agent-skills
```

VS Code (`chat.plugins.marketplaces`), Cursor's marketplace and Codex installs are also documented. Agentic workflows install with `gh aw add-wizard dotnet/skills/agentic-workflows@main`.

## Highlights

- `plugins/dotnet/skills/msbuild/SKILL.md`: one routed entry (troubleshoot, performance, authoring review) that loads the specialist MSBuild guidance as local references. Already the consolidated shape this marketplace wants.
- `plugins/dotnet/skills/csharp-refactoring/SKILL.md`: classify before editing, rename by bindings (LSP or Roslyn) not text, preserve serialized, reflected and public contracts, verify per target framework.
- `plugins/dotnet-aspnetcore/skills/dotnet-webapi/SKILL.md`: concrete, current Web API rules (sealed record DTOs, `AddValidation()` on .NET 10, ProblemDetails, OpenAPI from XML docs, strict JSON only for new APIs).
- `plugins/dotnet-data/skills/optimizing-ef-core-queries/SKILL.md`: evidence-gated EF Core review (materialization tracing, sargable predicates, split queries, bulk updates), with an explicit rule against manufacturing findings.
- `plugins/dotnet-upgrade/skills/migrate-dotnet9-to-dotnet10/`: a short workflow plus ten per-area breaking-change references.
- `plugins/dotnet-blazor/skills/author-component/SKILL.md`: a 65-line rule sheet (parameters, EventCallback, disposal, async) with references.
- `plugins/dotnet-diag/skills/analyzing-dotnet-performance/`: signal-driven loading of seven topic references by scan depth.

## Quality notes

- Content is concrete, current (.NET 10, C# 14, MTP, .NET 11 previews) and eval-backed. It is the strongest .NET source surveyed.
- Descriptions are long (median ~650 characters, up to ~1,000) and tuned for routing in their own eval harness: "ALWAYS USE", "MUST USE", "ACTIVATION PREREQUISITE" and long DO NOT USE lists. Installing whole plugins costs about 3,000 to 3,500 tokens of listing each for `dotnet-test` and `dotnet-msbuild`.
- Many skills are 300 to 535 lines. Several duplicate each other on purpose (the `msbuild` entry bundles copies of the MSBuild specialists; the README says both surfaces are kept in sync).
- `csharp-expert` is a router that tells the agent to install more plugins from the `dotnet-agent-skills` marketplace.
- `dotnet-test` is partly polyglot (code-testing, test-anti-patterns, test-gap-analysis cover pytest, Vitest, Go), so it competes with general testing skills outside .NET. Its skills read a repo overlay file (`.agents/skill-overlays/...`) first.
- Agents are GitHub Copilot `.agent.md` files with Copilot frontmatter (`agents:`, `user-invocable`, handoffs); they are not native Claude Code subagents.
- Bundled scripts are mostly PowerShell (coverage, symbolication, nullable readiness), plus a Roslyn file-based C# app and a Python fallback in `find-untested-sources`.
- `use-igniteui-blazor` promotes a vendor component library (Infragistics Ignite UI).
- The LSP and binlog MCP both run `dnx ... --prerelease` with no version pin.

## Relevance to adminhead

- Primary source for the .NET plugins in `docs/plans/` (see the dotnet design). MIT, so port with the copyright notice and record the upstream commit in each plugin's NOTICE so later diffs are easy.
- Not a good cross-marketplace dependency: the plugins are multi-skill bundles (up to 24 skills and 10 agents), the descriptions are long and aggressive, and allowlisting exposes all 16 plugins and the router.
- Our plugin names must not reuse its plugin names (`dotnet`, `dotnet-test`, `dotnet-upgrade` and so on), so a user can install an upstream specialist next to ours without a name clash.
