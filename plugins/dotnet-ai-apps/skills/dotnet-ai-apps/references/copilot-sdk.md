# GitHub Copilot SDK

Read this only when a .NET app must drive the GitHub Copilot agent runtime (custom developer workflows that use Copilot's tools, models and permissions). It is not a general LLM client; use `IChatClient` for that.

## Package

`GitHub.Copilot.SDK` (namespace `GitHub.Copilot`): 1.0.22 stable in October 2026, with 1.0.x previews shipping often. Pin an exact version and read the release notes before upgrading.

At build time the package downloads a pinned Copilot CLI runtime for the build RID from the `github/copilot-cli` releases and checks it against the release's `SHA256SUMS.txt`. In offline or locked-down builds set `CopilotCliBinaryPath` to a preinstalled binary, `CopilotCliReleaseBaseUrl` to a mirror, or `CopilotSkipCliDownload=true`.

## Guardrails

1. Create and start one `CopilotClient` for the app and dispose it at shutdown.
2. Create one session per workflow with an explicit `SessionConfig`: model, working directory, system message, available tools, and a permission handler. Dispose the session afterwards.
3. Default permission requests to deny when no user is present. `PermissionHandler.ApproveAll` is for trusted local experiments only.
4. Subscribe to session events (assistant messages, errors, usage, idle) before sending a prompt.
5. Enforce a timeout with a `CancellationToken`, and record token usage without logging prompt content.
6. Authenticate with the logged-in user or a `GitHubToken` from a secret store; never commit a token.

## Minimal shape

```csharp
using GitHub.Copilot;

await using var client = new CopilotClient();
await client.StartAsync();

await using var session = await client.CreateSessionAsync(new SessionConfig
{
    Model = model,                          // from configuration
    OnPermissionRequest = DenyUnlessApproved, // your handler
});

var done = new TaskCompletionSource();
session.On<SessionEvent>(evt =>
{
    if (evt is AssistantMessageEvent msg) Console.WriteLine(msg.Data.Content);
    else if (evt is SessionIdleEvent) done.TrySetResult();
});

await session.SendAsync(new MessageOptions { Prompt = prompt });
await done.Task.WaitAsync(TimeSpan.FromMinutes(5), ct);
```

The SDK's README (https://github.com/github/copilot-sdk/tree/main/dotnet) documents MCP servers, custom agents, tool filtering and telemetry options; check it for the current `SessionConfig` fields.
