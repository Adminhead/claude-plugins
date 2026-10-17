# Testing an Aspire app

`Aspire.Hosting.Testing` starts the real AppHost (containers, projects, executables) from a test. It is a closed-box integration test: you can't replace services in the apps' DI containers; influence them through configuration and environment variables. For one service in isolation use `WebApplicationFactory<T>`.

## Project setup

- A test project referencing `Aspire.Hosting.Testing` (same version as the AppHost SDK) and a `ProjectReference` to the AppHost project, which generates the `Projects.*` type. The `aspire-starter` template includes one to copy from.
- A container runtime on the test machine (CI included).

## Template

```csharp
public class ApiTests
{
    private static readonly TimeSpan DefaultTimeout =
        Environment.GetEnvironmentVariable("CI") is not null ? TimeSpan.FromMinutes(5) : TimeSpan.FromSeconds(60);

    [Fact]
    public async Task GetProducts_ReturnsOk()
    {
        using var cts = new CancellationTokenSource(DefaultTimeout);
        var ct = cts.Token;

        var appHost = await DistributedApplicationTestingBuilder
            .CreateAsync<Projects.MyApp_AppHost>(ct);
        appHost.Services.ConfigureHttpClientDefaults(http => http.AddStandardResilienceHandler());

        await using var app = await appHost.BuildAsync(ct).WaitAsync(DefaultTimeout, ct);
        await app.StartAsync(ct).WaitAsync(DefaultTimeout, ct);

        await app.ResourceNotifications.WaitForResourceHealthyAsync("api", ct);

        using var http = app.CreateHttpClient("api");
        using var response = await http.GetAsync("/products", ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
```

## Rules

- Bound every await (`BuildAsync`, `StartAsync`, `WaitForResourceHealthyAsync`, requests) with a timeout; container pulls make the first CI run slow, so use a longer timeout when `CI` is set.
- Wait for health (`WaitForResourceHealthyAsync`) before the first request; `StartAsync` returning doesn't mean dependencies are ready.
- `await using` the app so containers are cleaned up when a test fails.
- Get a connection string for direct checks with `await app.GetConnectionStringAsync("catalogdb", ct)`.
- Defaults: the dashboard is off and proxied ports are randomized so several app instances can run at once. Turn the dashboard on for debugging with `CreateAsync<T>(args: [], configureBuilder: (o, _) => o.DisableDashboard = false)`; fix ports with the argument `"DcpPublisher:RandomizePorts=false"`.
- Pass configuration to the AppHost through the `args` array (`"Key=Value"`) and branch in the AppHost on it to leave out resources a test doesn't need.
- Starting the whole AppHost per test is slow; share one app per test class with the framework's class or assembly fixture when tests don't mutate shared state.
- Raise logging for the AppHost and `Aspire.` categories through `appHost.Services.AddLogging(...)` when diagnosing startup failures.

Run them like any other test project (`dotnet test`); see `dotnet-testing` for the runner and filter syntax.
