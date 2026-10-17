# Batch dotnet-5: optional .NET specialists

Upstream for all three: https://github.com/dotnet/skills @ 10d85e25fb42d5f65c568d5e979a005ee69eecb3 (MIT, .NET Foundation and Contributors). Each plugin has a LICENSE file (the upstream MIT text) and a NOTICE with the `Upstream:` / `Paths:` lines and a list of what was changed.

## Plugins created

| Name | Type | Description (exactly as in plugin.json) | Sources | Deps |
|---|---|---|---|---|
| `dotnet-native-interop` | skill | Writes, reviews and debugs .NET native interop with P/Invoke and LibraryImport, covering signatures from C headers, string and struct marshalling, memory ownership, SafeHandle, callbacks and library loading. Use for wrapping a C library, a DllNotFoundException or AccessViolationException at a native call, or moving DllImport to LibraryImport for AOT. | `plugins/dotnet-advanced/skills/dotnet-pinvoke/` (SKILL.md + 2 refs) | none |
| `dotnet-ai-apps` | skill | Chooses and wires AI and ML in .NET apps with Microsoft.Extensions.AI (IChatClient, embeddings), Microsoft Agent Framework, vector search and RAG, ML.NET, ONNX Runtime and OllamaSharp. Use for adding an LLM call or chatbot to a .NET service, a tool-calling agent in C#, RAG over documents, or choosing between an LLM and ML.NET for a prediction. | `plugins/dotnet-ai/skills/technology-selection/` (SKILL.md + 7 refs) | none |
| `dotnet-template-authoring` | skill | Authors, validates and packages custom `dotnet new` templates, covering template.json from an existing project, symbols and conditional content, post-actions, constraints and template packs. Use for "turn this project into a template", a template missing from `dotnet new list` after install, or reviewing a template.json before publishing. | `plugins/dotnet-template-engine/skills/template-authoring/` + `template-validation/` | none |

Layout per plugin: `.claude-plugin/plugin.json`, `LICENSE`, `NOTICE`, `skills/<name>/SKILL.md` (107 / 83 / 96 lines), `references/` (4 / 6 / 3 files), `evals/` (4 / 5 / 4 cases plus one `results/` run each).

- native-interop references: `type-mapping.md`, `memory-and-callbacks.md`, `loading-and-tooling.md`, `diagnostics.md`.
- ai-apps references: `llm.md`, `agents.md`, `rag.md`, `classic-ml.md`, `local-inference.md` (ONNX and Ollama merged), `copilot-sdk.md`.
- template-authoring references: `template-json.md`, `validation-rules.md`, `packaging.md`.

## Validation and tests

- `claude plugin validate --strict plugins/<name>`: passed for all three.
- `.claude/skills/skill-authoring/scripts/validate_skill.py plugins/<name>/skills/<name>`: valid for all three.
- YAML frontmatter of every eval prompt and grader parses with PyYAML. All descriptions are quoted.
- The stale-name grep (codegraph, claude-mem, `coding-core:`, `github:`, `Efficient `, upstream skill names, ALWAYS/MUST USE) found nothing.
- `claude plugin eval plugins/<name> --ablation none` (sonnet-5-5):
  - native-interop: 4 of 4 cases pass, 1 run each ($0.20).
  - template-authoring: 4 of 4 pass, 1 run each ($0.18).
  - ai-apps: the first pass failed `trigger-ai-churn-plan` (the model answered the "LLM vs ML.NET, no code" question without loading the skill). I added "choosing between an LLM and ML.NET for a prediction" to the description. That case then passed 2 of 3 runs alone, and the full suite passed 5 of 5 cases × 2 runs ($1.26). I deleted the superseded result folders.
- Hard negatives: a JSON IL2026 trim warning (should not route to native-interop); a C# MCP server and a Python LangChain RAG app (should not route to ai-apps); plain `dotnet new xunit` usage (should not route to template-authoring). Positive cases also assert that sibling skills don't fire: `csharp`, `dotnet-diagnostics`, `dotnet-upgrade-guide`, `mcp-server`, `msbuild`, `nuget`. Those siblings aren't installed in the eval sandbox, so the not-sibling graders are weak signals.

## Version-sensitive facts rechecked (2026-10-17)

I checked these against the NuGet flat-container API, GitHub source through `gh api`/`gh search code` (dotnet/extensions, microsoft/agent-framework, github/copilot-sdk), Context7 (`/microsoft/agent-framework`) and json.schemastore.org/template.

- Current versions: Microsoft.Extensions.AI 10.11.0; Microsoft.Agents.AI 1.25.0 (GA); Microsoft.Extensions.VectorData.Abstractions 10.11.0; Microsoft.Extensions.DataIngestion 10.11.0-preview; OllamaSharp 5.5.0; GitHub.Copilot.SDK 1.0.22; ML.NET 5.0.1 (6.0 preview); AutoML 0.23.1; ONNX Runtime 1.31.0; OpenAI 2.14.0; Azure.AI.OpenAI 2.1.0 stable; Microsoft.ML.Tokenizers 2.0.1; SK vector connectors 1.74.x-preview. The references give each version as "version then (Oct 2026)" and tell the model to recheck.
- Upstream errors I corrected:
  - `RetryingChatClient` does not exist in MEAI.
  - `ChatClientAgentRunOptions.MaximumIterations` does not exist. The cap is `FunctionInvokingChatClient.MaximumIterationsPerRequest`, and `ChatClientAgent` reuses an existing FICC (I checked the source).
  - The package `Microsoft.Extensions.AI.DataIngestion` returns 404. The real one is `Microsoft.Extensions.DataIngestion`.
  - The 1.x Agent Framework names are `AgentSession` / `CreateSessionAsync` / `AgentResponse`.
  - The Copilot SDK is no longer pre-1.0. It downloads the Copilot CLI at build time.
  - `Microsoft.Extensions.AI.Ollama` is deprecated in favour of OllamaSharp.
  - The template choice parameter example used an object keyed by name; the schema requires an array of `{choice}` entries.
  - P/Invoke version floors: `UnmanagedCallersOnly` is .NET 5+, and `nuint` is the same type as `UIntPtr` on .NET 7+.
- I also confirmed these API names: `AsAIAgent`, `ApprovalRequiredAIFunction`, `ChatResponse<T>.TryGetResult`, `AddMessages`, `AddChatClient`, `UseFunctionInvocation(configure:)`, the MEVD attribute members (`IsIndexed`, `IsFullTextIndexed`, `DistanceFunction`), `EnsureCollectionExistsAsync`, the `SearchAsync<TInput>(value, top, ...)` signature, and the Copilot SDK `CopilotClient` / `SessionConfig` / `SendAsync` shape.

## Deviations

- I created the plugins by hand (no `plugins.py new`), per the round-3 brief.
- I merged template-authoring and template-validation into one skill (the design lists both as sources). The discovery, instantiation, comparison and smart-defaults skills were skipped, per the design's Skips table.
- In ai-apps I merged upstream `ollama.md` and `onnx.md` into `local-inference.md`.
- I wrote NOTICE prose modelled on `dependency-vetting`, plus the required parseable `Upstream:` and `Paths:` lines.
- Each plugin keeps one eval `results/` run, matching `golang`.

## Unverified / TODO

- These came from upstream or from memory and were not checked against live docs:
  - Exact Agent Framework middleware method names: `agent.AsBuilder().UseOpenTelemetry()` and `UseStructuredOutput`. A design-decision doc shows the latter, but I did not confirm the shipped name.
  - `UsageDetails`-based budgeting is described as a pattern, not an API.
  - ONNX Runtime GenAI and DirectML package status.
  - `Microsoft.TemplateEngine.Authoring.CLI` tool command names (the docs list `localize` and `verify` commands, no flags).
  - The template `sources` default excludes.
  - Host constraint ID list (from upstream).
- I did not run any code: there is no .NET SDK in this session, and the C# snippets are illustrative.
- Eval runs are small (1-2 runs per case), so `trigger-ai-churn-plan` may still be flaky (it passed 4 of 5 runs after the change).

## Suggested follow-ups

- Coordinator: register all three in `marketplace.json` as direct installs (not in `dotnet-meta`). Add recommend-plugins evidence rules:
  - `[DllImport]`/`[LibraryImport]` or `AllowUnsafeBlocks` → `dotnet-native-interop`
  - `Microsoft.Extensions.AI`/`Microsoft.Agents.AI`/`Microsoft.ML` package refs → `dotnet-ai-apps`
  - a `.template.config/template.json` or `<PackageType>Template</PackageType>` → `dotnet-template-authoring`
- When the sibling .NET plugins land, re-run these evals with the siblings installed so the not-sibling graders mean something. Add 1-2 runs to the churn case.
- `dotnet-ai-apps` versions go stale fastest. Recheck at the next upstream sync (`git diff 10d85e2..HEAD -- plugins/dotnet-ai/`).
