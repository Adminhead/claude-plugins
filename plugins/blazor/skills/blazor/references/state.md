# Sharing state between components

## Choose the mechanism

| Need | Mechanism |
|---|---|
| Parent to direct child | `[Parameter]` down, `EventCallback<T>` up |
| A subtree in one render mode (theme inside a layout) | `<CascadingValue>` |
| App-wide, across render-mode boundaries (current user info, theme, feature flags) | `AddCascadingValue` / `CascadingValueSource<T>` in DI |
| Mutable state many components read and write within a circuit (cart, notification count, filters) | Scoped service with a change event |
| Surviving prerender to interactive | `[PersistentState]` ([prerendering.md](prerendering.md)) |

## `<CascadingValue>` for a subtree

```razor
<CascadingValue Value="theme" IsFixed="true">
    @Body
</CascadingValue>
```

Consumers: `[CascadingParameter] private ThemeInfo? Theme { get; set; }`. Values match by type; add `Name="PrimaryTheme"` and `[CascadingParameter(Name = "PrimaryTheme")]` for two values of one type. `IsFixed="true"` when the value never changes.

It does **not** cross render-mode boundaries: a `<CascadingValue>` in a statically rendered layout is invisible to interactive children (they see null).

## `CascadingValueSource<T>` for app-wide values

```csharp
builder.Services.AddCascadingValue(sp =>
    new CascadingValueSource<ThemeInfo>(new ThemeInfo { ButtonClass = "btn-primary" }, isFixed: false));
```

Consume with `[CascadingParameter]` as above. To change it, inject the source and notify:

```razor
@inject CascadingValueSource<ThemeInfo> ThemeSource

@code {
    private async Task ToggleDark()
    {
        isDark = !isDark;
        await ThemeSource.NotifyChangedAsync(new ThemeInfo { ButtonClass = isDark ? "btn-dark" : "btn-primary" });
    }
}
```

- `NotifyChangedAsync(newValue)` replaces and notifies; `NotifyChangedAsync()` notifies after mutating in place. Without a notify call, no subscriber re-renders. Never use `NavigationManager.Refresh(forceReload: true)` to propagate state; it tears down the circuit.
- Each notify re-renders every subscriber, so cascade small, separate types (`ThemeState`, `UserPreferences`), not one app-state object.
- For WebAssembly and Auto, register in both `Program.cs` files and keep the type in a shared assembly.

## Scoped state service

```csharp
public sealed class CartState
{
    private readonly List<CartItem> items = [];
    public IReadOnlyList<CartItem> Items => items;
    public event Action? Changed;

    public void Add(CartItem item) { items.Add(item); Changed?.Invoke(); }
    public void Remove(CartItem item) { items.Remove(item); Changed?.Invoke(); }
}

builder.Services.AddScoped<CartState>();
```

```razor
@inject CartState Cart
@implements IDisposable

<span class="badge">@Cart.Items.Count</span>

@code {
    protected override void OnInitialized() => Cart.Changed += OnCartChanged;

    private async void OnCartChanged()
    {
        try { await InvokeAsync(StateHasChanged); }
        catch (Exception ex) { await DispatchExceptionAsync(ex); }
    }

    public void Dispose() => Cart.Changed -= OnCartChanged;
}
```

`InvokeAsync` makes the handler safe when the event fires off the sync context (timers, background work, hub messages). Subscribe a method (or a lambda stored in a field) so `Dispose` removes the same handler; a missed unsubscribe leaks the component for the life of the circuit.

## Lifetimes per mode

| Lifetime | Server | WebAssembly |
|---|---|---|
| Scoped | Per circuit (one user connection) | Per tab (effectively singleton) |
| Singleton | Shared by **all users** | Per tab |
| Transient | Per injection | Per injection |

- Never keep per-user state in a singleton on Server: one user's cart leaks into another's.
- Code that must run in both (Auto) uses scoped.
- Scoped `DbContext` on Server lives as long as the circuit and isn't thread-safe across overlapping awaits; inject `IDbContextFactory<T>` and create a context per operation ([data.md](data.md)).
- State created during prerender doesn't carry over to the interactive runtime; persist what you need with `[PersistentState]`.
