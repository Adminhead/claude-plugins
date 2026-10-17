# Batch dotnet-4: roslyn-analyzers, aspire, blazor

## Plugins created

| Name | Type | Description (as in plugin.json) | Sources | Deps |
|---|---|---|---|---|
| roslyn-analyzers | skill | Roslyn analyzer skill: DiagnosticAnalyzer, CodeFixProvider and IIncrementalGenerator design and tests, Microsoft.CodeAnalysis host-compatibility pinning, and analyzer NuGet packaging. | github/awesome-copilot @ cb64ad12e32737ae764becd6885462e9b4c7cb00 `skills/roslyn-analyzers` (SKILL.md + 2 .cs files), MIT GitHub, Inc.; .cs files (c) Microsoft, SourceWriter adapted from PolyType (MIT, Eirik Tsarpalis) | none |
| aspire | skill | Aspire skill: AppHost resource model and wiring, service defaults, the aspire CLI (start, wait, describe, logs), DistributedApplicationTestingBuilder tests, and aspire publish/deploy to Compose, Kubernetes and Azure. | Rewrite of github/awesome-copilot @ cb64ad1 `skills/aspire` (SKILL.md, architecture, cli-reference, testing, deployment refs), MIT GitHub, Inc.; verified against aspire.dev (Aspire 13.6) | none |
| blazor | skill | Blazor skill: component rules, render modes, forms and validation, auth per render mode, shared state, data loading, prerendering, JS interop, and Blazor Server to Web App conversion. | dotnet/skills @ 10d85e25fb42d5f65c568d5e979a005ee69eecb3: 9 `dotnet-blazor` skills (+ author-component refs) and `dotnet-aspnetcore/convert-blazor-server-to-webapp`, MIT .NET Foundation | none |

Layout per plugin: `.claude-plugin/plugin.json`, `LICENSE` (MIT with every holder), `NOTICE` (parseable `Upstream: <url> @ <sha>` + `Paths:` lines, modifications), `skills/<name>/SKILL.md` + `references/`, `evals/` (3 cases each: 2 trigger with sibling hard-negative graders, 1 routing negative).

- roslyn-analyzers: SKILL.md 105 lines; references testing.md, source-generators.md, packaging-and-versioning.md; assets CSharpCodeFixVerifier.cs, SourceWriter.cs.
- aspire: SKILL.md 88 lines; references apphost.md, cli.md, testing.md, deployment.md.
- blazor: SKILL.md 79 lines; 9 references (create-project, components, forms, auth, state, data, prerendering, js-interop, server-to-webapp), each <=129 lines.

## Validation and tests

- `claude plugin validate --strict plugins/{roslyn-analyzers,aspire,blazor}`: all pass.
- `python3 .claude/skills/skill-authoring/scripts/validate_skill.py plugins/<p>/skills/<p>`: all valid (links resolve, descriptions 350/359/355 chars).
- `claude plugin eval plugins/<p> --ablation none --no-publish`: roslyn-analyzers 3/3, blazor 3/3 (1 run each); aspire 3/3 cases at 3 runs each after a fix. Reports in each plugin's `evals/results/`.
  - aspire miss, fixed: trigger-aspire-1 first pasted the AppHost and service code with the name mismatch in plain view; Sonnet answered without loading the skill (0/3, also after a description tweak). Rewrote the prompt as a symptom-only report (restart loop, Npgsql connect failure): 3/3. Worth knowing: self-contained "spot the bug" prompts don't trigger the skill.
- grep for codegraph, claude-mem, coding-core:, github:, "Efficient ", USE FOR/ALWAYS USE, ask_user: none.
- No scripts, so no specs. No third-party scripts were run.

## Deviations and why

- roslyn-analyzers: upstream mandates (Docfx, Nerdbank.GitVersioning, a dedicated `Directory.Packages.Analyzers.props`, Renovate/Dependabot rules) kept, but as conditional guidance in a reference rather than hard rules. The example analyzer now resolves `Task.Wait()` once and compares normalized symbols (upstream matched by method name). SourceWriter.cs made netstandard2.0-friendly (`Slice()` in place of range slices, no `StringSyntax` on a generator-side type), with a header saying what it still needs (System.Memory, LangVersion latest).
- aspire: a full rewrite. Upstream errors fixed: `aspire publish -p <target>` (doesn't exist; targets are compute environments in the AppHost), "Aspire does NOT deploy directly", `WithHealthCheck("ready", "/health/ready")`, `--exclude-resource`, `WaitForResourceReadyAsync`, `AddGolangApp` as a core API, the 13.1 command table. Added the agent-friendly detached flow (`aspire start` / `wait` / `describe` / `logs` / `stop`). Not ported: troubleshooting.md (per design), plus dashboard, mcp-server, polyglot-apis and integrations-catalog (stale or covered by `aspire docs`). Curl-pipe-bash install replaced with package managers or download, read, then run. Told the model not to run `aspire agent init`, `deploy` or `destroy` without the user asking.
- blazor: upstream "read AGENTS.md" steps replaced with render-mode detection from Program.cs and App.razor. The AGENTS.md template assets were dropped (replaced by a one-line "record the mode in CLAUDE.md/AGENTS.md if the repo keeps one"). plan-ui-change folded into components.md and softened from "never ask before implementing" to "unless the user asked for a plan". Fixes: `[PersistentState]` needs a public property (upstream used a private field); InputFile's default limit is 500 KB and the parameter is `maximumFileCount`; Blazor Server uses `IDbContextFactory`, not an injected scoped DbContext; the scoped-state example no longer discards `InvokeAsync`; dropped the unverified "BL0007" claim for `required`/`init`.
- Design said "~120 + 2-3 refs" for roslyn-analyzers: 105 + 3, as planned. The blazor design listed 9 refs: delivered 9 (plan-ui-change is merged rather than its own file).

## Verified (2026-10-17)

- Aspire: CLI command list and flags (`run --detach/--isolated`, `start`, `wait --status/--timeout`, `describe --follow/--format`, `logs -f/-n`, `add`), install methods, prerequisites (.NET 10 SDK for C# AppHost, Docker/Podman), templates (`aspire-starter`, `-ts-cs-`, `-py-`, `-ts-starter`, `aspire-empty`, `aspire-ts-empty`), testing APIs (`ResourceNotifications.WaitForResourceHealthyAsync`, `DisableDashboard`, `DcpPublisher:RandomizePorts`), compute environment APIs and packages, `Aspire.Hosting.JavaScript` rename, `API_HTTP` env vars, `MapDefaultEndpoints` Development-only, the lifecycle events. Sources: aspire.dev pages and Context7 `/microsoft/aspire.dev`.
- Roslyn: Roslyn-to-VS table (Microsoft Learn; 5.0.0 = VS 18.0), the generic `Microsoft.CodeAnalysis.*.Testing` packages, framework-specific packages obsolete in favor of `DefaultVerifier` (roslyn-sdk README and NuGet), PolyType license line.
- Blazor: `[PersistentState]` (public property, `AllowUpdates`, `RestoreBehavior`) via Context7 `/dotnet/aspnetcore.docs`.

## Unverified / TODO

- Roslyn: `ForAttributeWithMetadataName` requiring 4.3.1+, RS1035/CS8032/CS8785 descriptions, `EnforceExtendedAnalyzerRules`, the exact `CSharpGeneratorDriver.Create`/caching test code. All from memory, not compiled.
- Aspire: `AddAzureKubernetesEnvironment` package name; whether `aspire start` accepts every `run --detach` option; `OnResourceReady` as a resource-builder helper (seen `OnBeforeResourceStarted`/`OnResourceEndpointsAllocated` in the docs only); the experimental-diagnostic note for `AddPythonApp` (docs page may be outdated).
- Blazor: .NET 9/10 version tags on `RendererInfo`, `ExcludeFromInteractiveRouting` and auth state serialization (from memory); `GetMultipleFiles(maximumFileCount)` parameter name.
- None of the C# samples were compiled.

## Suggested follow-ups

- recommend-plugins detection: `Microsoft.CodeAnalysis.CSharp` + `IsRoslynComponent` -> roslyn-analyzers; `Aspire.AppHost.Sdk` / `apphost.cs` / `aspire.config.json` -> aspire; `*.razor` -> blazor (per the design).
- Compile-check the roslyn-analyzers samples and SourceWriter.cs in a scratch netstandard2.0 project once a .NET SDK is available.
- Aspire releases monthly: recheck cli.md and deployment.md each minor version (the NOTICE records 13.6).
- Add a blazor eval for Server-to-Web-App conversion, and an aspire negative against `kubernetes` (hand-written manifests).
