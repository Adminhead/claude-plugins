---
name: dotnet-ai-apps
description: Chooses and wires AI and ML in .NET apps with Microsoft.Extensions.AI (IChatClient, embeddings), Microsoft Agent Framework, vector search and RAG, ML.NET, ONNX Runtime and OllamaSharp. Use for adding an LLM call or chatbot to a .NET service, a tool-calling agent in C#, RAG over documents, or choosing between an LLM and ML.NET for a prediction.
---

# AI and ML in .NET apps

Pick the technology first, then deliver only what was asked. A request for a plan, comparison or architecture ("don't write code yet") gets that, not a scaffolded project.

Not for: Python, TypeScript or other non-.NET AI stacks; building an MCP server in C# (`mcp-server`); Anthropic API specifics such as model IDs, prompt caching or the Claude SDKs (use the Claude API docs or the `claude-api` skill if installed); general ASP.NET Core endpoint work (`aspnet-core`); package version policy (`nuget`); training deep-learning models (train in Python, export to ONNX, then come back here for inference).

## Orient

- Read the TFM. These libraries need .NET 8+; a .NET Framework project needs an upgrade first (`dotnet-upgrade-guide`).
- Read the existing `PackageReference`s and `Program.cs`. If the app already uses Semantic Kernel, an AI provider SDK or a vector store, extend it rather than adding a second stack.
- Check current package versions before writing references: `dotnet package search <id> --exact-match` (.NET 8.0.200+ SDK; `dotnet add package` without `--version` takes the latest stable), or NuGet.org. These packages ship monthly.
- For API shapes, query current docs with Context7 (`resolve-library-id`, then `query-docs`) for `microsoft/agent-framework` or `dotnet/extensions`. Code from older blog posts often uses removed names.

## 1. Classify the task

State which row applies and why.

| Task | Technology |
|---|---|
| Tabular classification, regression, clustering, anomaly detection, recommendation | **ML.NET** (`Microsoft.ML`) |
| Generate, summarize, extract, classify text: one prompt in, one response out, at most a bounded tool call | **Microsoft.Extensions.AI** `IChatClient` over a provider |
| Multi-step tool use, agent loops, multi-agent workflows, durable runs | **Microsoft Agent Framework** (`Microsoft.Agents.AI`) on `IChatClient` |
| Semantic search, RAG, embedding storage | `IEmbeddingGenerator` + **Microsoft.Extensions.VectorData** (MEVD) and a store connector |
| Parse, chunk, embed and load documents | `Microsoft.Extensions.DataIngestion` (preview) + MEVD |
| Run an existing ONNX model (vision, embeddings, custom) | **ONNX Runtime** (`Microsoft.ML.OnnxRuntime`) |
| Local or offline LLM (privacy, air-gapped, cost) | **OllamaSharp** behind `IChatClient` |
| Drive the GitHub Copilot runtime from a .NET app | **GitHub Copilot SDK** (`GitHub.Copilot.SDK`) |
| Predictions plus a natural-language explanation | Hybrid: ML.NET scores, an LLM explains |

Don't use an LLM for what ML.NET does well: tabular prediction with an LLM is slower, costlier and non-deterministic. Don't use Agent Framework for a single prompt and response. For new work prefer Microsoft.Extensions.AI and Agent Framework over Semantic Kernel unless the app already depends on Semantic Kernel features. Don't use Accord.NET (archived).

## 2. Layering rules

- Business code depends on `IChatClient` / `IEmbeddingGenerator<string, Embedding<float>>`, registered in DI with `services.AddChatClient(...)` / `AddEmbeddingGenerator(...)`. The provider SDK (`OpenAI`, `Azure.AI.OpenAI`, `OllamaSharp`, Foundry) appears only in that registration.
- Add cross-cutting behavior with the `ChatClientBuilder` pipeline: `.UseFunctionInvocation()`, `.UseOpenTelemetry()`, `.UseLogging()`, `.UseDistributedCache()`.
- Never mix a hand-written `HttpClient` call to a model API with Microsoft.Extensions.AI in the same workflow.
- Keys come from user-secrets, environment or Key Vault, or use keyless auth (`DefaultAzureCredential`). Never commit an `sk-...` key or put one in `appsettings.json`.
- Bind settings (endpoint, model or deployment name, limits) with `IOptions<T>`; don't hardcode deployment names.

## 3. Branch essentials

Every answer, plan or code, covers the guardrails of its branch:

- **LLM call:** set `Temperature` and `MaxOutputTokens` in `ChatOptions`; pin a dated model or deployment version, not a floating alias; pass a `CancellationToken` and a timeout; rely on the provider SDK's retry for transient errors (the OpenAI and Azure clients retry 429 and 5xx by default) and tune it there or with a resilience pipeline; validate structured output with `GetResponseAsync<T>` and a fallback when parsing fails.
- **Agent:** build on `IChatClient` with `AsAIAgent(...)` or `new ChatClientAgent(...)`; cap the tool loop with `FunctionInvokingChatClient.MaximumIterationsPerRequest`; define each tool with `AIFunctionFactory.Create` and a clear description; enforce a token or cost budget from `UsageDetails`; log tool names and metadata, not raw sensitive content; require approval for tools with side effects; prefer one agent with tools over multi-agent.
- **RAG:** chunk on semantic boundaries (headings, paragraphs), not fixed character counts; embed once at ingestion and store the vectors, never re-embed the corpus per query; search through MEVD with the store the user asked for; drop hits below a minimum score; keep source attribution per answer.
- **ML.NET:** `new MLContext(seed: ...)`; `TrainTestSplit` and evaluate on the held-out set; report real metrics (MicroAccuracy, MacroAccuracy and LogLoss; AUC and F1; or RMSE and R²); serve with `PredictionEnginePool<TIn, TOut>`, never a singleton `PredictionEngine`.
- **ONNX:** one warmed `InferenceSession` from DI; validate input and output names, types and shapes at startup; dispose results; preprocess exactly as at training.

## 4. Decide depth

- Plan, comparison or architecture only: answer from this file. Cover the branch essentials; for RAG cover chat, ingestion and chunking, embeddings, vector store, attribution and the requested UI and storage.
- Writing code: read only the selected branch's reference (Hybrid reads both):
  - LLM calls with Microsoft.Extensions.AI: [references/llm.md](references/llm.md)
  - Agents with Agent Framework: [references/agents.md](references/agents.md)
  - RAG, embeddings, ingestion: [references/rag.md](references/rag.md)
  - ML.NET: [references/classic-ml.md](references/classic-ml.md)
  - ONNX Runtime and local models with Ollama: [references/local-inference.md](references/local-inference.md)
  - GitHub Copilot SDK: [references/copilot-sdk.md](references/copilot-sdk.md)

## Verify

- The choice follows the table, and only what was asked was produced.
- Clients come from DI, settings from `IOptions<T>`, secrets from a secure source.
- The branch essentials above hold in the code.
- Package IDs exist and versions were checked on NuGet at write time.
- `dotnet build` passes and existing tests run. Tests of LLM-calling code use a fake `IChatClient`, not a live model.

## Gotchas

- Microsoft.Extensions.AI has no `RetryingChatClient`, and Agent Framework has no `MaximumIterations` run option. Both appear in older samples. Use the provider's retry settings and `MaximumIterationsPerRequest`.
- `ChatClientAgent` adds its own `FunctionInvokingChatClient` unless the `IChatClient` it receives already has one. To set the iteration cap, build the client with `.UseFunctionInvocation(configure: f => f.MaximumIterationsPerRequest = 10)` before creating the agent.
- Agent conversations are `AgentSession`s (`await agent.CreateSessionAsync()`); `AgentThread` and `GetNewThread()` are the pre-1.0 names.
- The ingestion package is `Microsoft.Extensions.DataIngestion`, not `Microsoft.Extensions.AI.DataIngestion`, and it is still preview.
- `Microsoft.Extensions.AI.Ollama` is deprecated; use `OllamaSharp`, whose `OllamaApiClient` implements `IChatClient` and `IEmbeddingGenerator`.
- Temperature 0 is not deterministic across calls or model versions. Don't assert exact LLM output in tests.

Adapted from dotnet/skills `technology-selection` (MIT, .NET Foundation and Contributors).
