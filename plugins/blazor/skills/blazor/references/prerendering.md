# Prerendering

Interactive render modes prerender by default: the server renders static HTML first, then the Server or WebAssembly runtime attaches and renders again. Static SSR has no handoff, so none of this applies there.

- `OnInitializedAsync` runs twice on a full page load: during prerender and when the runtime attaches.
- `OnAfterRenderAsync` doesn't run during prerender.
- Navigation between interactive pages (interactive routing) skips prerendering; only full loads prerender.

## Persist state across the handoff

.NET 10: `[PersistentState]` on a **public** property, plus a `??=` guard:

```razor
@page "/forecasts"
@rendermode InteractiveServer

@if (Forecasts is null) { <p>Loading...</p> }
else { @foreach (var f in Forecasts) { <p>@f.Date: @f.TemperatureC °C</p> } }

@code {
    [PersistentState]
    public WeatherForecast[]? Forecasts { get; set; }

    protected override async Task OnInitializedAsync()
    {
        Forecasts ??= await ForecastService.GetForecastsAsync();
    }
}
```

- The value is serialized with System.Text.Json into the prerendered HTML: keep it small and don't put secrets in it.
- Options: `[PersistentState(AllowUpdates = true)]` lets enhanced navigation refresh read-only data; `RestoreBehavior = RestoreBehavior.SkipInitialValue` skips restoring from prerender.
- Several instances of the same component on a page need `@key` so their state doesn't collide.

Before .NET 10 (or for dynamic keys), use the service:

```csharp
@inject PersistentComponentState AppState
@implements IDisposable

@code {
    private List<Order>? orders;
    private PersistingComponentStateSubscription subscription;

    protected override async Task OnInitializedAsync()
    {
        subscription = AppState.RegisterOnPersisting(() =>
        {
            AppState.PersistAsJson("orders", orders);
            return Task.CompletedTask;
        });

        if (!AppState.TryTakeFromJson<List<Order>>("orders", out var restored))
            orders = await OrderService.GetOrdersAsync();
        else
            orders = restored;
    }

    public void Dispose() => subscription.Dispose();
}
```

## Disable prerendering (last resort)

It costs perceived load time and SEO, so first try persisting state.

```razor
@rendermode @(new InteractiveServerRenderMode(prerender: false))            @* on a component definition *@
<MyChart @rendermode="new InteractiveServerRenderMode(prerender: false)" />  @* on one instance *@
<Routes @rendermode="new InteractiveServerRenderMode(prerender: false)" />   @* whole app, in App.razor (HeadOutlet too) *@
```

Use the matching `InteractiveWebAssemblyRenderMode` / `InteractiveAutoRenderMode` type. A parent that disables prerendering can't be overridden by a child.

## Pages that need HttpContext in a global app

Cookies, request headers or response status codes need static SSR. Mark the page and switch the render mode per request in `App.razor` (.NET 9+):

```razor
@page "/privacy"
@attribute [ExcludeFromInteractiveRouting]
```

```razor
<Routes @rendermode="PageRenderMode" />
@code {
    [CascadingParameter] private HttpContext HttpContext { get; set; } = default!;
    private IComponentRenderMode? PageRenderMode =>
        HttpContext.AcceptsInteractiveRouting() ? InteractiveServer : null;
}
```

Navigating to such a page does a full reload.

## Detect where you're running (.NET 9+)

```csharp
if (RendererInfo.IsInteractive)
{
    await StartHubConnectionAsync();   // skip during prerender
}
```

`RendererInfo.Name` is `"Static"` during prerender, then `"Server"` or `"WebAssembly"`. `AssignedRenderMode` tells you what the component was assigned.

## Client-only services during prerender

Components in `.Client` prerender on the server, where client-only registrations (for example `IWebAssemblyHostEnvironment`) don't exist. Fix by one of: register an equivalent server implementation; put an interface in `.Client` with an implementation per project; or disable prerendering for that component.

## Don't

- Call JS interop in `OnInitializedAsync`; use `OnAfterRenderAsync(firstRender)`.
- Assume `OnInitializedAsync` runs once.
- Read `HttpContext` in interactive components.
