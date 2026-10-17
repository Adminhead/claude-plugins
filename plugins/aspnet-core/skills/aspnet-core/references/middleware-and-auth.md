# Middleware, auth and cross-cutting services

Contents: pipeline order, authentication, authorization, CORS, rate limiting, caching (output cache, HybridCache), health checks, options validation, forwarded headers, SignalR, gRPC.

Check each API against the project's TFM; look up current details on Microsoft Learn or with Context7 when unsure.

## Pipeline order

```csharp
var app = builder.Build();

app.UseForwardedHeaders();        // first, when behind a proxy that terminates TLS
app.UseExceptionHandler();
if (!app.Environment.IsDevelopment()) app.UseHsts();
app.UseHttpsRedirection();
app.MapStaticAssets();            // .NET 9+; UseStaticFiles() on older TFMs
app.UseRouting();
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();             // after routing when policies are per-endpoint
app.UseOutputCache();             // after UseCors
app.UseAntiforgery();             // after auth; Blazor and form posts

app.MapHealthChecks("/healthz");
app.MapProducts();
app.Run();
```

- `WebApplication` adds routing at the start, and authentication/authorization when their services are registered, if you don't call them. Call them explicitly when anything must run between them, so the order is visible.
- Middleware that reads endpoint metadata (CORS policies, authorization, rate limit policies, output cache policies) must come after `UseRouting`.
- Custom middleware that needs the user goes after `UseAuthentication`; one that must see every error goes after `UseExceptionHandler`.

## Authentication

Choosing the design (sessions vs tokens, IdP, passkeys) belongs to `app-auth`; this is wiring.

```csharp
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.Authority = builder.Configuration["Auth:Authority"];
        o.Audience = builder.Configuration["Auth:Audience"];
        o.MapInboundClaims = false;   // keep "sub", "role" claim names as issued
    });
```

- Package `Microsoft.AspNetCore.Authentication.JwtBearer`. Validate issuer, audience, lifetime and signing key (the defaults do when `Authority` is set); never turn validation off to make a test pass.
- Cookie auth: `AddCookie()`. On .NET 10, API endpoints answer 401/403 instead of redirecting; override `OnRedirectToLogin`/`OnRedirectToAccessDenied` only if redirects are really wanted.
- Secrets come from configuration (user secrets locally, a vault in production), never source.

## Authorization

```csharp
builder.Services.AddAuthorizationBuilder()
    .AddPolicy("orders:write", p => p.RequireAuthenticatedUser().RequireClaim("scope", "orders.write"))
    .SetFallbackPolicy(new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build());

group.MapPost("/", Create).RequireAuthorization("orders:write");
app.MapGet("/healthz", () => "ok").AllowAnonymous();
```

- A fallback policy makes endpoints secure by default; mark public ones `AllowAnonymous()`.
- Resource-based checks (does this user own order 42?) use `IAuthorizationService.AuthorizeAsync(user, resource, requirement)` inside the handler, not just a role attribute.
- Controllers: `[Authorize(Policy = "...")]`, `[AllowAnonymous]`.

## CORS

```csharp
builder.Services.AddCors(o => o.AddPolicy("web", p => p
    .WithOrigins("https://app.example.com")
    .WithMethods("GET", "POST", "PUT", "DELETE")
    .WithHeaders("Content-Type", "Authorization")
    .AllowCredentials()));

app.UseCors();                         // between UseRouting and UseAuthorization
group.RequireCors("web");
```

`AllowAnyOrigin()` together with `AllowCredentials()` throws. CORS is a browser relaxation, not access control; it doesn't protect the API from non-browser clients.

## Rate limiting

```csharp
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;   // default is 503
    o.AddFixedWindowLimiter("per-client", l =>
    {
        l.PermitLimit = 100;
        l.Window = TimeSpan.FromMinutes(1);
        l.QueueLimit = 0;
    });
});

group.RequireRateLimiting("per-client");
```

Partition per user or API key with `PartitionedRateLimiter` / `o.AddPolicy(name, ctx => RateLimitPartition.GetFixedWindowLimiter(key, ...))`. Behind a proxy, partitioning by IP needs forwarded headers configured first. Limits are per instance; a cluster-wide limit needs a shared store or the gateway.

## Caching

- Output cache (server-side HTTP response cache): `builder.Services.AddOutputCache();`, `app.UseOutputCache();`, `.CacheOutput(p => p.Expire(TimeSpan.FromSeconds(30)).Tag("products"))`; evict with `IOutputCacheStore.EvictByTagAsync("products", ct)`. Authenticated requests and responses that set cookies aren't cached by default.
- HybridCache (in-memory plus optional distributed L2, with stampede protection): package `Microsoft.Extensions.Caching.Hybrid`, `builder.Services.AddHybridCache();`, then

```csharp
public sealed class ProductReader(HybridCache cache, AppDbContext db)
{
    public ValueTask<ProductResponse?> GetAsync(int id, CancellationToken ct) =>
        cache.GetOrCreateAsync($"product:{id}",
            async token => await db.Products.Where(p => p.Id == id)
                .Select(p => new ProductResponse(p.Id, p.Name, p.Price, p.Category, p.IsAvailable, p.CreatedAt))
                .FirstOrDefaultAsync(token),
            tags: ["products"],
            cancellationToken: ct);
}
```

Prefer HybridCache over hand-rolled `IMemoryCache` + `IDistributedCache` combinations. Cache keys that include user input must be normalized and bounded.

## Health checks

```csharp
builder.Services.AddHealthChecks()
    .AddDbContextCheck<AppDbContext>(tags: ["ready"]);   // Microsoft.Extensions.Diagnostics.HealthChecks.EntityFrameworkCore

app.MapHealthChecks("/healthz/live", new() { Predicate = _ => false });
app.MapHealthChecks("/healthz/ready", new() { Predicate = c => c.Tags.Contains("ready") });
```

Liveness checks nothing external (a failing database shouldn't restart the pod); readiness checks dependencies.

## Options validation

```csharp
builder.Services.AddOptions<SmtpOptions>()
    .BindConfiguration("Smtp")
    .ValidateDataAnnotations()
    .ValidateOnStart();
```

Fails at startup instead of on first use. Inject `IOptions<T>` (singleton snapshot), `IOptionsSnapshot<T>` (per request, scoped) or `IOptionsMonitor<T>` (change notifications) as needed; a singleton must not take `IOptionsSnapshot<T>`.

## Forwarded headers

Behind a reverse proxy or load balancer:

```csharp
builder.Services.Configure<ForwardedHeadersOptions>(o =>
{
    o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    o.KnownProxies.Add(IPAddress.Parse("10.0.0.10"));   // or KnownNetworks; don't trust every sender
});
```

Without it, `HttpContext.Connection.RemoteIpAddress` is the proxy and HTTPS redirection can loop.

## SignalR

```csharp
builder.Services.AddSignalR();
app.MapHub<OrdersHub>("/hubs/orders").RequireAuthorization();

public sealed class OrdersHub : Hub<IOrdersClient>
{
    public Task Subscribe(int orderId) => Groups.AddToGroupAsync(Context.ConnectionId, $"order:{orderId}");
}
```

- Push from elsewhere with `IHubContext<OrdersHub, IOrdersClient>`.
- WebSockets can't send an `Authorization` header from browsers; JWT bearer must read `access_token` from the query string for hub paths (`JwtBearerEvents.OnMessageReceived`), and that token then appears in logs, so keep its lifetime short.
- Several server instances need a backplane (Redis, or Azure SignalR Service) and sticky sessions unless clients use WebSockets only with `SkipNegotiation`.
- Check group membership authorization in hub methods; joining a group is not access control by itself.

## gRPC

```csharp
builder.Services.AddGrpc();
app.MapGrpcService<OrdersService>();
```

Package `Grpc.AspNetCore`; `.proto` files in the `.csproj` as `<Protobuf Include="Protos/orders.proto" GrpcServices="Server" />`. Needs HTTP/2 (Kestrel over TLS, or `Http2` endpoints configured for h2c behind a proxy). Browsers need gRPC-Web (`Grpc.AspNetCore.Web`, `app.UseGrpcWeb()`, `.EnableGrpcWeb()`). Contract design, versioning and error-status conventions belong to `api-grpc`. Server-side `CancellationToken` is `context.CancellationToken`; pass it on.
