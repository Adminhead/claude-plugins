# AppHost reference

## Contents

- AppHost forms
- Resource types
- Wiring and waiting
- Endpoints and service discovery
- Parameters and configuration
- Lifetimes and data
- Service defaults
- Eventing
- Migrating from Docker Compose

## AppHost forms

| Form | Recognize by | Packages |
|---|---|---|
| C# project | `<Project Sdk="Aspire.AppHost.Sdk/13.x.y">`, `ProjectReference`s to services | `PackageReference Include="Aspire.Hosting.*"` |
| C# file-based | `apphost.cs` starting `#:sdk Aspire.AppHost.Sdk@13.x.y` | `#:package Aspire.Hosting.Redis@13.x.y` lines |
| TypeScript | `apphost.ts`/`apphost.mts` + `aspire.config.json` | `packages` in `aspire.config.json`, then `aspire restore` regenerates `.aspire/modules/` |

All forms share the same resource model; TypeScript method names are camelCase (`addRedis`, `withReference`) and usually awaited. Not every C# API has a TypeScript equivalent; check the integration's page.

## Resource types

```csharp
builder.AddProject<Projects.Api>("api");                       // .NET project (ProjectReference-generated type)
builder.AddProject("api", "../Api/Api.csproj");                // by path (file-based AppHost)
builder.AddContainer("mailpit", "axllent/mailpit", "v1.20")    // any OCI image; pin a tag
       .WithHttpEndpoint(targetPort: 8025);
builder.AddDockerfile("legacy", "../legacy");                  // build from a Dockerfile
builder.AddExecutable("tool", "mytool", "../tool", "--serve"); // local process

// Aspire.Hosting.Python
builder.AddUvicornApp("pyapi", "../pyapi", "main:app").WithUv();
builder.AddPythonApp("worker", "../worker", "worker.py");

// Aspire.Hosting.JavaScript (renamed from Aspire.Hosting.NodeJs in 13.0)
builder.AddViteApp("web", "../web");                           // Vite dev server, HMR, publish Dockerfile
builder.AddJavaScriptApp("spa", "../spa").WithHttpEndpoint(env: "PORT");
builder.AddNodeApp("node-api", "../node-api", "server.js").WithHttpEndpoint(env: "PORT");
```

Backing services come from integrations: `AddPostgres(...).AddDatabase(...)`, `AddSqlServer`, `AddRedis`, `AddRabbitMQ`, `AddKafka`, `AddMongoDB`, Azure resources (`AddAzureStorage`, `AddAzureServiceBus`, ...). Go, Java, Rust and others come from `CommunityToolkit.Aspire.Hosting.*` packages. Find packages with `aspire add <partial-name>` or `aspire docs search`.

## Wiring and waiting

| Call | Effect |
|---|---|
| `.WithReference(r)` | Injects `r`'s connection string or endpoints into the consumer; adds a dependency edge for discovery, not for startup order |
| `.WaitFor(r)` | Consumer starts after `r` is running and all its health checks pass |
| `.WaitForStart(r)` | Consumer starts after `r` is running (ignores health) |
| `.WaitForCompletion(r)` | Consumer starts after `r` exits (one-shot jobs: migrations, seeders) |
| `.WithHttpHealthCheck("/health")` | HTTP health check on the resource's endpoint, so `WaitFor` has a signal |
| `.WithEnvironment("KEY", value)` | Plain or parameter-backed environment variable |
| `.WithArgs(...)` | Command-line arguments |

Pattern for EF Core migrations: a small worker project that applies migrations and exits, `api.WaitForCompletion(migrator)`.

## Endpoints and service discovery

- `WithHttpEndpoint(port?, targetPort?, name?, env?)` / `WithHttpsEndpoint(...)` / `WithEndpoint(...)`. `targetPort` is what the process listens on; `port` is the proxied port the outside sees (random if omitted). `env: "PORT"` tells the process its port through an environment variable.
- Projects get endpoints from `launchSettings.json`.
- Injected into consumers of `WithReference(api)`:
  - `services__api__http__0`, `services__api__https__0` (read by `Microsoft.Extensions.ServiceDiscovery`; .NET clients use `https+http://api` as the base address);
  - `API_HTTP`, `API_HTTPS` (13.0+, convenient for non-.NET apps).
- Connection resources inject `ConnectionStrings__<name>`; .NET reads it with `builder.Configuration.GetConnectionString("<name>")` or the client integration.
- `.WithExternalHttpEndpoints()` marks endpoints public in deployment targets.

## Parameters and configuration

```csharp
var apiKey = builder.AddParameter("weather-api-key", secret: true);
builder.AddProject<Projects.Api>("api").WithEnvironment("WEATHER_API_KEY", apiKey);
```

Values resolve from the AppHost configuration section `Parameters:<name>` (user secrets via `aspire secret set`, environment variables `Parameters__<name>`, `appsettings.json`), otherwise the dashboard or CLI prompts for them. `builder.AddConnectionString("legacy-db")` references an existing external database by connection string.

## Lifetimes and data

- `.WithDataVolume()` (named volume, survives container recreation) or `.WithDataBindMount("../data")`.
- `.WithLifetime(ContainerLifetime.Persistent)` keeps the container running across AppHost restarts; a persistent container with a generated password needs a fixed password parameter, or the next run's password won't match the stored data.

## Service defaults

The ServiceDefaults project's `AddServiceDefaults()` configures OpenTelemetry (logs, metrics, traces to the dashboard's OTLP endpoint), default health checks, service discovery, and `AddStandardResilienceHandler()` on every `HttpClient`. `MapDefaultEndpoints()` maps `/health` (all checks) and `/alive` (checks tagged `live`) in Development only. Call both from every .NET service the AppHost runs; a service missing them shows no traces and gives `WithHttpHealthCheck` nothing to hit.

## Eventing

```csharp
catalogDb.OnResourceReady(async (db, evt, ct) =>
{
    // runs once the database is healthy, e.g. seed data
});
```

Resource-scoped helpers (9.4+): `OnBeforeResourceStarted`, `OnResourceEndpointsAllocated`, `OnResourceReady`; the underlying events (`BeforeResourceStartedEvent`, `ResourceEndpointsAllocatedEvent`, `ResourceReadyEvent`, and app-wide `BeforeStartEvent`) can also be subscribed through `builder.Eventing.Subscribe<T>(...)`. `AfterEndpointsAllocatedEvent` and lifecycle hooks are deprecated. Keep handlers short and idempotent; prefer a migrator resource with `WaitForCompletion` for real work.

## Migrating from Docker Compose

| Compose | AppHost |
|---|---|
| `image:` service | `AddContainer(name, image, tag)` or the matching integration (`AddPostgres`) |
| `build:` | `AddDockerfile` or `AddProject` |
| `depends_on` | `.WithReference(x)` plus `.WaitFor(x)` |
| `ports:` | `.WithHttpEndpoint(port, targetPort)` |
| `environment:` | `.WithEnvironment(...)` or `.WithReference(...)` |
| `volumes:` | `.WithDataVolume()` / `.WithBindMount(...)` |
| secrets in `.env` | `AddParameter(..., secret: true)` |

Start from `aspire new aspire-empty` (or `aspire init` in the existing repo), move one service at a time, and run `aspire start` + `aspire describe` after each.
