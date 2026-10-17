---
name: aspnet-core
description: Builds and reviews ASP.NET Core HTTP apps: minimal APIs and controllers, DTOs, validation, ProblemDetails, OpenAPI, middleware order, auth wiring, .http files, CRUD endpoints written without scaffolders. Use for Program.cs endpoint or middleware work, "add an endpoint", OpenAPI setup, or global error handling in a .NET web project.
---

# ASP.NET Core

Match the project's existing style and target framework first; most mistakes here are mixing styles or using an API the TFM doesn't have.

Not for: Blazor components (`blazor`), EF Core queries and migrations (`ef-core`), API contract policy such as versioning and pagination conventions (`api-rest-design`), choosing an auth design (`app-auth`), gRPC contract design (`api-grpc`), general C# (`csharp`), tests (`dotnet-testing`, which covers `WebApplicationFactory`).

## Orient

- Read `Program.cs`, the `.csproj` (`TargetFramework`, `Microsoft.NET.Sdk.Web`, package refs), `appsettings*.json`, `Properties/launchSettings.json`, and two or three existing endpoints.
- Find the style: classes deriving `ControllerBase` or marked `[ApiController]` mean controllers; `app.MapGet/MapPost/MapGroup` means minimal APIs. Continue in that style; never mix. A new project defaults to minimal APIs unless the user asks for controllers.
- Find callers and registrations with the codebase-memory tools when the repo is indexed (`search_graph`, `trace_path`), else the C# language server (csharp-ls) or Grep.
- Check APIs against the TFM: built-in OpenAPI needs .NET 9+, minimal API `AddValidation()` and XML-comment OpenAPI need .NET 10+. For library APIs use Context7 (`resolve-library-id`, `query-docs`) or Microsoft Learn.

## Endpoints

1. **DTOs.** Separate request and response types; never expose EF entities. `sealed record`: positional for responses, `required` + `init` properties with data annotations for requests. Names `Create{Entity}Request`, `Update{Entity}Request`, `{Entity}Response`. `DateTimeOffset` for timestamps. `<summary>` comments on API-facing types (they flow into OpenAPI on .NET 10 with `<GenerateDocumentationFile>true</GenerateDocumentationFile>`).
2. **Validation.** Controllers with `[ApiController]` validate automatically. Minimal APIs on .NET 10+: `builder.Services.AddValidation();` (returns a 400 validation problem; per-endpoint opt-out `.DisableValidation()`). It discovers types only in the assembly that calls it. Before .NET 10, validate explicitly in a filter or handler.
3. **Handlers.** Minimal APIs: one static class per resource with a `Map{Resource}(this IEndpointRouteBuilder app)` extension that uses `app.MapGroup("/api/products").WithTags("Products")`. Return `TypedResults`, and declare `Results<Ok<T>, NotFound>` when a handler has several outcomes. A bare ternary between `TypedResults.Ok(x)` and `TypedResults.NotFound()` without that declared return type fails to compile (CS1593).
4. **Status codes.** GET 200 (404 if missing); POST 201 with `Location` (`TypedResults.Created($"/api/products/{id}", body)` or `CreatedAtAction`); PUT/PATCH 200 or 204; DELETE 204; 400 validation, 409 conflict. Contract-level conventions belong to `api-rest-design`.
5. **Cancellation.** Every handler takes a `CancellationToken` and passes it to every async call (services, EF Core, `HttpClient`).
6. **Services.** Handlers call an injected service (interface plus `sealed` implementation registered `AddScoped`), not a `DbContext` directly, unless the project already does otherwise.
7. **OpenAPI.** .NET 9+: `builder.Services.AddOpenApi();` and `app.MapOpenApi();` (document at `/openapi/v1.json`, OpenAPI 3.1 by default on .NET 10). Don't add Swashbuckle to a .NET 9+ project; keep it where it already exists. Metadata: `.WithName()`, `.WithSummary()`, `.WithDescription()`, `.Produces<T>()`, `.ProducesProblem()`, `.ProducesValidationProblem()`. `.WithOpenApi()` is deprecated in .NET 10 (ASPDEPR002): remove it, and use `.AddOpenApiOperationTransformer(...)` for per-operation edits.
8. **JSON.** Serialize enums as strings unless asked otherwise: `ConfigureHttpJsonOptions(o => o.SerializerOptions.Converters.Add(new JsonStringEnumConverter()))` for minimal APIs, `AddControllers().AddJsonOptions(...)` for MVC. Stricter reading (`NumberHandling = Strict`, `PropertyNameCaseInsensitive = false`, `AllowDuplicateProperties = false` on .NET 10) only for new APIs or on request, since it breaks existing clients.
9. **`.http` file.** One request per new endpoint with realistic bodies and an error case; base URL from `launchSettings.json`; create parent records before children.

Read [references/web-api.md](references/web-api.md) for complete controller and minimal API examples, the exception handler and service layer code. Read [references/crud-scaffolding.md](references/crud-scaffolding.md) when asked to scaffold CRUD pages, views, components or endpoints for a model.

## Errors

```csharp
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<ApiExceptionHandler>();   // optional: map domain exceptions
app.UseExceptionHandler();
app.UseStatusCodePages();
```

No try/catch in individual handlers for cross-cutting errors. An `IExceptionHandler` that returns `true` has handled the exception; log it there, and never copy `exception.Message` into the response body. On .NET 10 the middleware no longer writes diagnostics for exceptions an `IExceptionHandler` handled. Put handler classes where the project keeps middleware (for example `Middleware/`).

## Pipeline, auth and cross-cutting services

Middleware order decides behavior. The usual order is exception handler, HSTS, HTTPS redirection, static files, routing, CORS, authentication, authorization, rate limiter, then endpoints. Read [references/middleware-and-auth.md](references/middleware-and-auth.md) when you change the pipeline, add authentication or authorization, CORS, rate limiting, output or hybrid caching, health checks, options validation, SignalR or gRPC.

## Verify

1. `dotnet build` with no new warnings (`-warnaserror` if the repo uses it).
2. Run the app (`dotnet run --launch-profile https` if that profile exists) and load `/openapi/v1.json`; confirm the new operations appear.
3. Send each `.http` request (or `curl`) in dependency order and check status codes, `Location` headers and ProblemDetails bodies.
4. Run the integration tests if the repo has them (`dotnet-testing` for the command form).

## Gotchas

- `AddValidation()` silently validates nothing for endpoint types declared in another assembly; call it from that assembly too.
- XML doc comments on lambdas never reach OpenAPI; move the handler to a named method to document it.
- On .NET 10, cookie-authenticated API endpoints (`[ApiController]`, JSON minimal APIs, `TypedResults`) return 401/403 instead of redirecting to the login page.
- `UseCors` must sit after `UseRouting` and before `UseAuthorization` (and before response caching) or endpoint CORS policies don't apply.
- `AllowAnyOrigin()` with `AllowCredentials()` is rejected at runtime; list origins.
- Rate limiter rejections default to 503; set `RejectionStatusCode = StatusCodes.Status429TooManyRequests`.
- .NET 10 reads request JSON through `PipeReader`; a custom `JsonConverter` that ignores `Utf8JsonReader.HasValueSequence` can break.
