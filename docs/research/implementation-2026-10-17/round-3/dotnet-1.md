# Batch dotnet-1: csharp, msbuild, nuget

## Plugins created

| Name | Type | Description (exactly as in plugin.json) | Sources | Deps |
|---|---|---|---|---|
| `csharp` | skill | Writes, reviews, refactors and debugs C# and .NET code (types, nullable references, async and cancellation, exceptions, DI, options and logging in the generic host, file-based apps). Use for work in *.cs or *.csx files, "review this C# class", CS86xx nullable warnings, a deadlock or sync-over-async bug, or a rename across a solution. | dotnet/skills @ 10d85e25 (`csharp-refactoring`, `migrate-nullable-references`, `csharp-scripts`, `setup-local-sdk`, `dotnet11/process-api-net11`, `dotnet11/system-text-json-net11`); awesome-copilot @ cb64ad12 (`agents/CSharpExpert.agent.md`, `skills/system-commandline-cli`) | none |
| `msbuild` | skill | Diagnoses MSBuild failures and slow builds and reviews .NET build XML. Use for a failing dotnet build, restore, pack or publish, .csproj/.props/.targets conditions and custom targets, binlog capture and replay, "it rebuilds when nothing changed", slow evaluation or builds, bin/obj clashes, or Directory.Build.* layering. | dotnet/skills @ 10d85e25 (`plugins/dotnet/skills/msbuild` + its 12 references; `dotnet-msbuild` specialists `check-bin-obj-clash`, `eliminate-redundant-restores`, `directory-build-organization`, `item-management`, `property-patterns`, `target-authoring`, `including-generated-files`) | none |
| `nuget` | skill | Manages NuGet dependencies and packages in .NET repos. Use for Directory.Packages.props and Central Package Management, bumping or aligning package versions, NU1xxx restore warnings, nuget.config sources and source mapping, vulnerable-package audits, lock files, dotnet pack metadata, or publishing to nuget.org with trusted publishing. | dotnet/skills @ 10d85e25 (`dotnet-nuget/convert-to-cpm` + 6 refs, `dotnet-advanced/nuget-trusted-publishing` + 2 refs); new `sources-and-audit.md` from NuGet docs | none |

Layout per plugin: `.claude-plugin/plugin.json`, `LICENSE` (MIT; csharp lists both .NET Foundation and GitHub, Inc.), `NOTICE` (with the parseable `Upstream: <url> @ <sha>` / `Paths:` lines; csharp has two pairs), `skills/<name>/SKILL.md` + `references/`, `evals/` (3 trigger cases each: 2 positives with sibling hard-negative graders, 1 negative).

- csharp: SKILL.md 85 lines; refs `refactoring.md`, `nullable.md`, `file-based-apps.md`, `cli-apps.md`, `sdk-setup.md`, `net11-apis.md`.
- msbuild: SKILL.md 79 lines; the upstream entry's 12 references copied (PowerShell blocks converted to bash, attribution lines rewritten) plus new `bin-obj-clash.md`, `redundant-restores.md`, `directory-build.md`, `items-and-properties.md`, `targets.md`.
- nuget: SKILL.md 66 lines; refs `cpm.md`, `sources-and-audit.md`, `trusted-publishing.md`.

## Validation

- `claude plugin validate --strict plugins/{csharp,msbuild,nuget}`: all passed.
- `python3 .claude/skills/skill-authoring/scripts/validate_skill.py plugins/<p>/skills/<p>`: all valid.
- Relative-link check over every .md in the three plugins: no broken links.
- grep for `codegraph`, `claude-mem`, `coding-core:`, `github:`, `Efficient `, `ask_user`, Copilot/MCP/overlay leftovers, `omnisharp`, `maui`, upstream skill cross-links: none (only attribution lines and the NuGet MCP-server package type remain, which are intended).
- Evals were written but not run (`claude plugin eval` not executed).

## Deviations

- LSP mentioned generically as "the C# language server (csharp-ls)" per the round-3 decision, not omnisharp.
- msbuild: no separate `build-parallelism` or `resolve-project-references` references; the copied `build-perf-baseline.md` (Steps 5-6: graph builds, `-m`, critical path) and `build-perf-diagnostics.md` (ResolveProjectReferences waits) already cover them. Items and properties merged into one reference; target authoring and generated files merged into `targets.md`.
- msbuild corrections versus upstream: dropped the claim that `BeforeTargets` on an SDK target fails when declared in `.props` (replaced with the real hazard: last same-named target wins, so `BeforeBuild` in an SDK project body is overridden); generated-file guidance uses output inference instead of upstream's separate pattern; dropped unverified `IMultiThreadableTask` and "SDK 9.0.1xx forwards -restore:false" claims (kept the version-independent `--no-restore -restore:false`).
- csharp: dropped `#:exclude` and `#:ref` from the file-based-apps reference because the current Learn page (2026-09) documents only `#:include`, `#:package`, `#:project`, `#:property`, `#:sdk`. Refactoring classification gate simplified (no fixed "Not a behavior-preserving refactor" wording). Upstream's contradictory nullable guidance (annotate-only vs "prefer null checks") resolved: migrations are annotation-only, ordinary code may guard. Team install scripts (bash/PowerShell) not ported; described in one paragraph.
- nuget: CPM report template and six references condensed into one `cpm.md`; trusted-publishing package-type reference folded into a table; workflow template updated to `actions/checkout@v7`, `actions/setup-dotnet@v6` (checked on GitHub releases) with a SHA-pinning note pointing at `gh-actions`, `global-json-file`, and a tag/version check via `dotnet msbuild -getProperty:Version` instead of `sed`.
- Evals: 3 per plugin (design asked 3-5).

## Verified (Context7 / web)

- NuGet: `NuGetAuditMode` defaults to `all` for net10.0 targets (`direct` before), NU1901-NU1904, `NuGetAuditSuppress`, `auditSources`, `data.nuget.org` endpoint, package source mapping syntax, lock-file properties and CLI flags, CPM `VersionOverride`/`CentralPackageVersionOverrideEnabled`/transitive pinning/`GlobalPackageReference`, trusted publishing policy fields, 7-day temporary policy for private repos, 1-hour key lifetime, one key per token (NuGet docs via Context7).
- File-based apps: directives, SDK 10.0.300 for `#:include`, PublishAot default, `--file` behaviour inside a project folder, `dotnet project convert`, inheritance of Directory.Build/global.json, `#:package` version rule (Microsoft Learn page dated 2026-09-10).
- System.CommandLine 2.0: `Required`, `Recursive`, `Validators`, `DefaultValueFactory`, `Aliases`, `ProcessTerminationTimeout` (Context7 DeepWiki of dotnet/command-line-api).
- Action versions: actions/checkout v7.0.1, actions/setup-dotnet v6.0.0 (GitHub releases).

## Unverified / TODO

- .NET 11 Process and System.Text.Json API shapes are from upstream (preview); marked preview until GA (Nov 2026). Recheck at GA.
- `dotnet package list` noun-first syntax for SDK 10+ and `dotnet nuget config paths` taken from upstream / memory; the latter is hedged ("on SDKs that have it").
- System.CommandLine `InvocationConfiguration` `Output`/`Error` for tests not directly confirmed.
- `csharp` description mentions `*.csx` (dotnet-script files); harmless but csx is not covered in depth.
- Evals not run; trigger rates against `dotnet-testing`, `aspnet-core`, `coding` untested.

## Suggested follow-ups

- Run `claude plugin eval` for the three plugins after the coordinator registers them, alongside the other dotnet batches, to check cross-routing (csharp vs coding, msbuild vs nuget vs dotnet-upgrade-guide).
- Coordinator: create `dotnet-meta` with `csharp-lsp@claude-plugins-official`; update `recommend-plugins` detection.
- `dependency-vetting`: NuGet section (MSBuild `build/` targets in packages run at build time; dependency confusion via source mapping, which `nuget/references/sources-and-audit.md` already covers from the consumer side).
- Consider adding upstream's `resx-source-generator-migration` (awesome-copilot) as an msbuild reference later, per the design.
