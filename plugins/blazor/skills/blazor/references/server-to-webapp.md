# Converting a Blazor Server app to a Blazor Web App

For .NET 6/7 Blazor Server apps (`AddServerSideBlazor`, `MapBlazorHub`, `Pages/_Host.cshtml`) moving to .NET 8+. If `Program.cs` already has `AddRazorComponents` and `MapRazorComponents`, it is already a Web App: stop and say so. Not for Blazor WebAssembly or hosted WebAssembly apps (different path) or apps staying on the legacy model (just bump the TFM). Commit after each step. Official guide: https://learn.microsoft.com/aspnet/core/migration/70-to-80#convert-a-blazor-server-app-into-a-blazor-web-app

## 1. Project file

Set `<TargetFramework>` to the target (`net8.0` or later) and move every `Microsoft.AspNetCore.*`, `Microsoft.EntityFrameworkCore.*`, `Microsoft.Extensions.*` and `System.Net.Http.Json` package to the matching version. Larger TFM hops: `dotnet-upgrade-guide`.

## 2. Routes.razor from App.razor

Move the whole `<Router>` from `App.razor` into a new `Routes.razor`. Drop a `<CascadingAuthenticationState>` wrapper (replaced by a service in step 5). Keep `<AuthorizeRouteView>` if present. Leave `App.razor` empty.

## 3. _Host.cshtml becomes App.razor

Move the HTML shell from `Pages/_Host.cshtml` into `App.razor` and convert it:

1. Delete `@page "/"`, `@namespace`, `@addTagHelper ...` and the `Microsoft.AspNetCore.Components.Web` using.
2. `<base href="~/" />` becomes `<base href="/" />`.
3. `<component type="typeof(HeadOutlet)" render-mode="ServerPrerendered" />` becomes `<HeadOutlet @rendermode="InteractiveServer" />`.
4. `<component type="typeof(App)" render-mode="ServerPrerendered" />` becomes `<Routes @rendermode="InteractiveServer" />`.
5. `<environment include="...">` tag helpers become `@inject IHostEnvironment Env` plus `@if (Env.IsDevelopment()) { ... } else { ... }`.
6. `_framework/blazor.server.js` becomes `_framework/blazor.web.js`.
7. Add `@using static Microsoft.AspNetCore.Components.Web.RenderMode` to `_Imports.razor`.
8. Delete `Pages/_Host.cshtml` (and `.cshtml.cs`).

If the old host used `render-mode="Server"` (no prerendering), keep that with `new InteractiveServerRenderMode(prerender: false)` on both `HeadOutlet` and `Routes`; turning prerendering on breaks components that call JS during initialization.

## 4. Program.cs

```csharp
// before
builder.Services.AddServerSideBlazor(o => { o.DetailedErrors = true; });
app.UseRouting();
app.MapBlazorHub();
app.MapFallbackToPage("/_Host");

// after
builder.Services.AddRazorComponents()
    .AddInteractiveServerComponents(o => { o.DetailedErrors = true; });   // carry over circuit options
app.UseAntiforgery();                                                     // after UseAuthentication/UseAuthorization
app.MapRazorComponents<App>()
    .AddInteractiveServerRenderMode();
```

- Remove `MapFallbackToPage("/_Host")` and `MapBlazorHub()`. Drop an explicit `UseRouting()` unless other middleware needs it.
- `UseAntiforgery()` is required: without it, form posts fail with 400.
- Make sure `App` resolves to the new `App.razor` component (namespace using).

## 5. Authentication state

Replace the removed `<CascadingAuthenticationState>` with `builder.Services.AddCascadingAuthenticationState();`. The component wrapper doesn't cross render-mode boundaries in Web Apps.

## 6. Optional improvements (say they're optional)

- `app.MapStaticAssets()` instead of `UseStaticFiles()` on .NET 9+ (fingerprinting, compression).
- `@attribute [StreamRendering]` on pages with slow `OnInitializedAsync`.
- Check the CSS isolation link `<link href="{AssemblyName}.styles.css" rel="stylesheet" />` matches the assembly name.
- Per-page interactivity (removing the global `@rendermode`) is a later, separate change.

## 7. Verify

- Build clean on the new TFM; `grep -rn "AddServerSideBlazor\|MapBlazorHub\|MapFallbackToPage\|blazor.server.js\|_Host" --include=*.cs --include=*.razor --include=*.cshtml .` returns nothing.
- `App.razor` is a full HTML document; `Routes.razor` holds the router.
- Run the app: pages render, interactive handlers and forms work, navigation works, login/logout work, existing tests pass.
