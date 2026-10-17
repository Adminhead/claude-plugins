# LLM calls with Microsoft.Extensions.AI

Read this when writing code for prompt-in, response-out work (generation, summarization, extraction, classification of text). For multi-step tool use, read `agents.md` instead.

## Packages

Versions checked on NuGet in October 2026; recheck before writing them.

| Package | Purpose | Version then |
|---|---|---|
| `Microsoft.Extensions.AI` | `IChatClient`, `ChatClientBuilder`, middleware (function invocation, OpenTelemetry, logging, caching) | 10.11.0 |
| `Microsoft.Extensions.AI.OpenAI` | `AsIChatClient()` / `AsIEmbeddingGenerator()` adapters for the `OpenAI` and `Azure.AI.OpenAI` clients | 10.11.0 |
| `OpenAI` | OpenAI client | 2.14.0 |
| `Azure.AI.OpenAI` + `Azure.Identity` | Azure OpenAI client with keyless auth | 2.1.0 stable (2.9 in beta) |
| `OllamaSharp` | local models (see `local-inference.md`) | 5.5.0 |
| `Microsoft.ML.Tokenizers` | client-side token counting | 2.0.1 |

Provider libraries other than these (Foundry, Anthropic, Google, Amazon Bedrock) ship their own `IChatClient` adapters; check the provider's docs for the current package.

## Registration

```csharp
// Program.cs
builder.Services.AddOptions<AiOptions>().BindConfiguration("Ai").ValidateOnStart();

builder.Services.AddChatClient(sp =>
    {
        var o = sp.GetRequiredService<IOptions<AiOptions>>().Value;
        return new AzureOpenAIClient(new Uri(o.Endpoint), new DefaultAzureCredential())
            .GetChatClient(o.Deployment)      // a dated model deployment, not a floating alias
            .AsIChatClient();
    })
    .UseOpenTelemetry()
    .UseLogging();

// OpenAI instead:
// new OpenAIClient(o.ApiKey).GetChatClient(o.Model).AsIChatClient()
// with o.ApiKey from user-secrets (`dotnet user-secrets set Ai:ApiKey ...`), env or Key Vault.
```

Consumers take `IChatClient` by constructor injection and never see the provider type.

## Calling

```csharp
public sealed class Summarizer(IChatClient chat)
{
    private static readonly ChatOptions Options = new() { Temperature = 0f, MaxOutputTokens = 1024 };

    public async Task<string> SummarizeAsync(string document, CancellationToken ct)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(60));

        ChatResponse response = await chat.GetResponseAsync(
            [new(ChatRole.System, "Summarize the document in five bullet points."),
             new(ChatRole.User, document)],
            Options, timeout.Token);
        return response.Text;
    }
}
```

- Stream with `GetStreamingResponseAsync` for chat UIs.
- `response.Usage` (`UsageDetails`) has input and output token counts; log them for cost tracking.
- Keep a conversation by appending `response.Messages` to your message list (`messages.AddMessages(response)`).

## Structured output

```csharp
public sealed record Triage(string Category, int Severity, string Reason);

ChatResponse<Triage> r = await chat.GetResponseAsync<Triage>(prompt, Options, cancellationToken: ct);
if (!r.TryGetResult(out Triage? triage)) { /* fallback: retry once, or route to a human */ }
```

Output still varies at temperature 0; validate ranges and enums in the result, not only that it parsed.

## Resilience

- The `OpenAI` and `Azure.AI.OpenAI` clients retry transient failures (429, 5xx) with backoff by default; set `RetryPolicy` and `NetworkTimeout` on their client options to tune them.
- For a uniform policy across providers, wrap calls in a `Microsoft.Extensions.Resilience` / Polly pipeline, or add a small `DelegatingChatClient` subclass that applies one. There is no built-in `RetryingChatClient`.
- Always pass a `CancellationToken`; model calls can take tens of seconds.

## Bounded tool calls

A single request that may call one or two local functions doesn't need Agent Framework:

```csharp
builder.Services.AddChatClient(inner).UseFunctionInvocation(configure: f => f.MaximumIterationsPerRequest = 3);

var options = new ChatOptions { Tools = [AIFunctionFactory.Create(GetOrderStatus)] };
```

When the work becomes a loop of planning and tool calls, move to `agents.md`.

## Testing

Unit-test consumers with a fake `IChatClient` (implement the interface or subclass `DelegatingChatClient`) that returns canned `ChatResponse`s. Evaluate prompt quality separately with `Microsoft.Extensions.AI.Evaluation` and its `.Quality` package against a recorded set of inputs, not in the unit test run.
