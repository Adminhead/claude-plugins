# Authentication and authorization by render mode

## Matrix

| Render mode | `HttpContext.User` | `SignInManager` | Auth state source | Key requirement |
|---|---|---|---|---|
| Static SSR | Available | Works | Request pipeline | Redirect via cookie `LoginPath` or a redirect component; `<NotAuthorized>` content isn't rendered for SSR route auth |
| Interactive Server | Not reliable | Throws | `AddCascadingAuthenticationState()` | Use `[Authorize]`, `AuthorizeView`, `Task<AuthenticationState>` |
| WebAssembly | None | Throws | Serialized from the server | `AddAuthenticationStateSerialization()` + `AddAuthenticationStateDeserialization()` (.NET 9+) |
| Auto | None after handoff | Throws | Serialized from the server | As WebAssembly; register in both `Program.cs` files |

## Services

```csharp
builder.Services.AddCascadingAuthenticationState();
builder.Services.AddAuthorization();

// ASP.NET Core Identity (what -au Individual scaffolds)
builder.Services.AddAuthentication(o =>
{
    o.DefaultScheme = IdentityConstants.ApplicationScheme;
    o.DefaultSignInScheme = IdentityConstants.ExternalScheme;
}).AddIdentityCookies();

builder.Services.AddIdentityCore<ApplicationUser>()
    .AddRoles<IdentityRole>()
    .AddEntityFrameworkStores<ApplicationDbContext>()
    .AddSignInManager()
    .AddDefaultTokenProviders();
```

`AddCascadingAuthenticationState()` replaces the old `<CascadingAuthenticationState>` wrapper, which doesn't cross render-mode boundaries. Pipeline order: `UseAuthentication()`, `UseAuthorization()`, then `UseAntiforgery()`.

## Router

```razor
<Router AppAssembly="typeof(Program).Assembly">
    <Found Context="routeData">
        <AuthorizeRouteView RouteData="routeData" DefaultLayout="typeof(Layout.MainLayout)">
            <NotAuthorized>
                @if (context.User.Identity?.IsAuthenticated != true) { <RedirectToLogin /> }
                else { <p>You are not authorized to access this resource.</p> }
            </NotAuthorized>
        </AuthorizeRouteView>
        <FocusOnNavigate RouteData="routeData" Selector="h1" />
    </Found>
</Router>
```

## Protecting pages and UI

```razor
@page "/admin"
@attribute [Authorize(Roles = "Admin")]      @* or [Authorize(Policy = "RequireManager")] *@

<AuthorizeView Roles="Admin,Manager">
    <Authorized>Welcome, @context.User.Identity?.Name</Authorized>
    <NotAuthorized><a href="Account/Login">Log in</a></NotAuthorized>
</AuthorizeView>
```

In code:

```csharp
[CascadingParameter] private Task<AuthenticationState>? AuthState { get; set; }

protected override async Task OnInitializedAsync()
{
    if (AuthState is not null)
    {
        var user = (await AuthState).User;
        isAdmin = user.IsInRole("Admin");
    }
}
```

UI checks are cosmetic. Every API endpoint a WebAssembly or Auto component calls must enforce the same policy server-side (`.RequireAuthorization("Policy")`).

## Identity pages stay static SSR

`SignInManager` and `UserManager` depend on `HttpContext` and throw in interactive components. Login, register and manage pages must render through static SSR.

- **Per-page apps:** Identity pages have no `@rendermode`, so nothing to do. Don't add one.
- **Global apps:** mark each Identity page `@attribute [ExcludeFromInteractiveRouting]` (.NET 9+), and make `App.razor` pick the render mode per request:

```razor
<HeadOutlet @rendermode="PageRenderMode" />
...
<Routes @rendermode="PageRenderMode" />

@code {
    [CascadingParameter] private HttpContext HttpContext { get; set; } = default!;

    private IComponentRenderMode? PageRenderMode =>
        HttpContext.AcceptsInteractiveRouting() ? InteractiveServer : null;
}
```

## WebAssembly and Auto

```csharp
// server Program.cs
builder.Services.AddAuthenticationStateSerialization(o => o.SerializeAllClaims = true); // only if the client needs all claims

// .Client Program.cs
builder.Services.AddAuthorizationCore();
builder.Services.AddCascadingAuthenticationState();
builder.Services.AddAuthenticationStateDeserialization();
```

Without these, components see an anonymous user once WebAssembly takes over from prerendering. Serializing all claims exposes them to the browser; keep it off unless needed.

## Common mistakes

| Symptom | Cause | Fix |
|---|---|---|
| Null or stale user in an interactive component | Reading `HttpContext.User` | `Task<AuthenticationState>` cascading parameter |
| `InvalidOperationException` from `SignInManager` | Called from an interactive component | Move to a static SSR page |
| Anonymous after WebAssembly loads | No state serialization | Serialization on server, deserialization on client |
| Identity pages crash in a global app | No `AcceptsInteractiveRouting()` switch | `[ExcludeFromInteractiveRouting]` + `App.razor` switch |
| `Task<AuthenticationState>` is null | Service not registered | `AddCascadingAuthenticationState()` |
