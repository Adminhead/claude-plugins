# Agents with Microsoft Agent Framework

Read this when the task needs a loop of tool calls, multi-step reasoning, durable conversations or several cooperating agents. Agent Framework (`Microsoft.Agents.AI`) sits on Microsoft.Extensions.AI `IChatClient`; don't hand-roll a tool loop on `IChatClient`.

## Packages

Versions checked on NuGet in October 2026 (Agent Framework is GA, 1.x, and releases often); recheck before writing them.

| Package | Purpose | Version then |
|---|---|---|
| `Microsoft.Agents.AI` | `AIAgent`, `ChatClientAgent`, `AgentSession`, middleware | 1.25.0 |
| `Microsoft.Agents.AI.Workflows` | graph workflows and multi-agent orchestration | 1.25.0 |
| `Microsoft.Agents.AI.OpenAI` | helpers for OpenAI and Azure OpenAI clients | 1.25.0 |
| `Microsoft.Extensions.AI` (+ provider adapter) | the `IChatClient` underneath | 10.11.0 |

## Minimal agent

```csharp
IChatClient chat = new AzureOpenAIClient(new Uri(endpoint), new DefaultAzureCredential())
    .GetChatClient(deployment).AsIChatClient()
    .AsBuilder()
    .UseFunctionInvocation(configure: f => f.MaximumIterationsPerRequest = 10) // loop cap
    .Build();

AIAgent agent = chat.AsAIAgent(
    instructions: "Research the topic with the tools, then summarize findings with sources.",
    name: "Researcher",
    tools: [AIFunctionFactory.Create(SearchDocs), AIFunctionFactory.Create(TakeNote)]);

AgentSession session = await agent.CreateSessionAsync(ct);
AgentResponse result = await agent.RunAsync("What changed in our refund policy this year?", session, cancellationToken: ct);
Console.WriteLine(result.Text);
```

`new ChatClientAgent(chat, instructions: ..., name: ..., tools: ...)` is equivalent. Pass `ChatClientAgentOptions` for more control (description, `ChatOptions` such as `Temperature` and `MaxOutputTokens`, chat history providers).

`ChatClientAgent` adds a `FunctionInvokingChatClient` only when the client it receives lacks one, so configure the iteration cap on the client as above.

## Guardrails

1. **Bounded loop:** `MaximumIterationsPerRequest` on the function-invoking client; a wall-clock timeout via the `CancellationToken`.
2. **Cost ceiling:** sum `result.Usage` (input and output tokens) per session and stop when a budget is reached.
3. **Explicit tools:** one `AIFunctionFactory.Create` per tool, with a `[Description]` on the method and each parameter. Validate tool arguments inside the tool; the model can send anything.
4. **Approval for side effects:** wrap tools that write, send or spend with `new ApprovalRequiredAIFunction(tool)` and surface the approval request to a user instead of auto-running it.
5. **Observability:** `.UseOpenTelemetry()` on the agent builder (`agent.AsBuilder()`) or chat client; log tool names, durations and token counts, not raw prompts with personal data.
6. **Sessions:** persist a conversation with `agent.SerializeSessionAsync(session)` and restore it with `DeserializeSessionAsync`; don't keep sessions only in memory in a web app.
7. **Single agent first:** one agent with tools covers most needs. Reach for `Microsoft.Agents.AI.Workflows` (sequential, concurrent, handoff, group chat) only when steps need different instructions, models or permissions.

## Structured results

```csharp
AgentResponse<Plan> plan = await agent.RunAsync<Plan>("Plan the migration in steps.", session, cancellationToken: ct);
```

Works when the underlying chat client supports structured output; otherwise decorate the agent with `.AsBuilder().UseStructuredOutput(chat).Build()`.

## Hosting

In ASP.NET Core, register the `IChatClient` with `AddChatClient(...)` and the agent as a singleton built from it; keep one `AgentSession` per user conversation, loaded from and saved to your store per request.

## Migration notes

Samples from before 1.0 use `AgentThread`, `agent.GetNewThread()` and `AgentRunResponse`; the 1.x names are `AgentSession`, `CreateSessionAsync()` and `AgentResponse`. There is no `ChatClientAgentRunOptions.MaximumIterations`; use `MaximumIterationsPerRequest`. Semantic Kernel agent code can move to Agent Framework incrementally; Microsoft Learn has a migration guide.
