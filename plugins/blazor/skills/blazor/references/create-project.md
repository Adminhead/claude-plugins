# Creating a Blazor Web App

## Ask first if unclear

Main screens and features; how interactive (forms and data display, real-time updates, offline, rich drag-and-drop); who uses it and on what network; authentication (none, individual accounts, organizational).

## Pick the lowest interactivity that works

```
Static SSR -> Interactive Server (per page) -> Interactive Server (global) -> WebAssembly -> Auto
simplest                                                                        most moving parts
```

| The app needs | Template flags | Why |
|---|---|---|
| Content, links, simple forms | `-int None` | No circuit, no WebAssembly; forms post as HTML; enhanced navigation keeps it snappy |
| Mostly static, a few live components (search-as-you-type, wizards) | `-int Server` | **Default choice.** Only components with `@rendermode InteractiveServer` hold a circuit |
| Rich interactivity on most pages (dashboards, chat) | `-int Server -ai` | Everything interactive; every user holds a SignalR circuit |
| Low latency on poor networks, offline | `-int WebAssembly` | Runs in the browser; needs a `.Client` project, an API for data, and a runtime download on first visit; PWA support is added by hand |
| Fast first load and client-side execution later | `-int Auto` | Server first, WebAssembly once cached; only when both Server-only and WebAssembly-only fall short |

Add `-ai` (all interactive) to any interactive mode for global scope. Add `-au Individual` for ASP.NET Core Identity (SQLite from the CLI); the `blazor` template supports only `Individual`. For Microsoft Entra ID, start from `Individual` or none and add `Microsoft.Identity.Web`/OIDC.

Auto mode constraints: interactive components live in `.Client`; no `DbContext`, file system or server-only services from them; both `Program.cs` files register every service an interactive component injects; no `HttpContext`; test both the Server and the WebAssembly path.

Don't use `dotnet new blazorwasm` for a new site (standalone SPA without server rendering) unless that is explicitly wanted. Don't choose WebAssembly or Auto without a concrete reason.

## Scaffold

```bash
dotnet new blazor -o MyApp -int Server            # per-page Interactive Server
dotnet new blazor -o MyApp -int Server -ai        # global
dotnet new blazor -o MyApp -int WebAssembly       # creates MyApp and MyApp.Client
dotnet new blazor -o MyApp -int Auto -au Individual
```

Check `dotnet new blazor --help` for the installed SDK's options (for example `--empty`, `-f net10.0`).

## What you get

Single project (None, Server):

```
MyApp/
  Components/
    App.razor          root document: <HeadOutlet/>, <Routes/>, blazor.web.js
    Routes.razor       <Router>
    Layout/MainLayout.razor (+ .razor.css)
    Pages/Home.razor   @page "/"
  Program.cs
  wwwroot/
```

Two projects (WebAssembly, Auto): the server project keeps `App.razor`, layouts and static pages; `MyApp.Client/` holds interactive pages, its own `Program.cs` and `_Imports.razor`. A WebAssembly or Auto component in the server project works during prerender and then fails after handoff.

## Program.cs wiring

```csharp
// Static SSR
builder.Services.AddRazorComponents();
app.MapRazorComponents<App>();

// Server
builder.Services.AddRazorComponents().AddInteractiveServerComponents();
app.MapRazorComponents<App>().AddInteractiveServerRenderMode();

// WebAssembly (server Program.cs)
builder.Services.AddRazorComponents().AddInteractiveWebAssemblyComponents();
app.MapRazorComponents<App>()
   .AddInteractiveWebAssemblyRenderMode()
   .AddAdditionalAssemblies(typeof(MyApp.Client._Imports).Assembly);

// Auto: both component registrations and both render modes, plus AddAdditionalAssemblies
```

The pipeline also needs `app.UseAntiforgery()` (after authentication/authorization) and static assets (`app.MapStaticAssets()` on .NET 9+). Switching modes later means changing `Program.cs`, `App.razor` and the `@rendermode` directives together; for a big change, compare against a freshly scaffolded template.

## App.razor: per page vs global

```razor
@* per page: no render mode on Routes; pages opt in with @rendermode *@
<HeadOutlet />
...
<Routes />

@* global *@
<HeadOutlet @rendermode="InteractiveServer" />
...
<Routes @rendermode="InteractiveServer" />
```

Use `InteractiveWebAssembly` or `InteractiveAuto` as appropriate. `@using static Microsoft.AspNetCore.Components.Web.RenderMode` in `_Imports.razor` makes the short names available.

## After scaffolding

1. `dotnet build`, then `dotnet run` in the server project.
2. Replace the template's Counter and Weather pages with the real pages.
3. If the repo keeps a CLAUDE.md or AGENTS.md, record the chosen mode, scope and where interactive components go, so later sessions don't have to rediscover it. Identity pages under `Components/Account/` stay static SSR: never add `@rendermode` to them.
