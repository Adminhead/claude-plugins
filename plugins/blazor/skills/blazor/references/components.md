# Components: decomposition, async, disposal

## Decompose before building a big page

For a page with three or more distinct regions or interacting sub-features, sketch the tree first, then implement it straight away (the plan is a working aid, not something to stop and ask approval for unless the user asked for a plan).

1. **Map regions.** Each region with its own data, behavior or layout is a candidate: distinct responsibility, repeated structure (list items, cards), independent interactivity, or more than ~150 lines of markup.

   ```
   InventoryDashboard   page: owns products and filters
   ├── StockSummaryBar  read-only stats
   ├── InventoryFilters search, category, toggle
   ├── InventoryTable   sorting
   │   └── InventoryRow inline edit/delete
   └── AddProductForm
   ```

2. **Pick the state owner** for each piece of data. Data flows down via `[Parameter]`; changes flow up via `EventCallback<T>`; the parent owns the data and passes filtered views; children never mutate parameters. When data must pass through more than two levels that don't use it, use a cascading value or a scoped service ([state.md](state.md)).
3. **Reuse** existing components (generic tables, pagination, filters) before writing new ones; extract a generic only once reuse is real.
4. **Build bottom-up**: models, services, leaf components, containers, the page, then DI and render-mode wiring. Every file should compile when written.
5. Name components for what they render (`ProductCard`, `OrderFilters`), not what they do internally.

Smells: a 500-line page; ten parameters drilled through intermediates; children fetching the same data their parent already has; inline complex list-item markup.

### Patterns

- **Siblings:** two blocks with no shared state become two components composed by a parent.
- **List items:** extract the item into its own component and render with `<TaskItem @key="task.Id" Task="task" OnToggle="HandleToggle" />`.
- **Parent cascades itself:** a container (`TabSet`) wraps children in `<CascadingValue Value="this" IsFixed="true">`; each child (`Tab`) takes `[CascadingParameter] TabSet? Container` and registers in `OnInitialized`. `IsFixed="true"` when the reference never changes avoids re-render subscriptions.

## Async in depth

| Avoid | Why | Use instead |
|---|---|---|
| `.Result`, `.Wait()` | Blocks the sync context; deadlocks the circuit | `await` all the way up |
| `Task.Run` | Leaves the sync context; `StateHasChanged` then throws | `await` the service; `await Task.Yield()` to let the UI paint first |
| `ContinueWith` | Continuation runs off the sync context | Code after `await` |
| `new Thread`, `Thread.Start` | Same | `await` |
| `ConcurrentDictionary`, `Channel<T>`, `BlockingCollection<T>` | Unneeded: access is already single-threaded | `Dictionary`, `List`, `Queue` |

Intermediate updates between awaits:

```csharp
status = "Step 1...";
await Step1Async();
status = "Step 2...";
StateHasChanged();
await Step2Async();
```

Long CPU loops: process in chunks and `await Task.Yield()` every N items after `StateHasChanged()`. Indivisible long calls: `while (task != await Task.WhenAny(task, Task.Delay(1000))) { status = "Still working..."; StateHasChanged(); }`.

Fire-and-forget only when a sync signature forces it, and route errors to the error boundary:

```csharp
private void SendReport() => _ = SendReportCore();

private async Task SendReportCore()
{
    try { await ReportSender.SendAsync(); StateHasChanged(); }
    catch (Exception ex) { await DispatchExceptionAsync(ex); }
}
```

External events (timers, service events) use `async void` handlers, the one place `async void` belongs in Blazor:

```csharp
private async void OnExternalEvent(object? sender, EventArgs e)
{
    try { await InvokeAsync(() => { count++; StateHasChanged(); }); }
    catch (Exception ex) { await DispatchExceptionAsync(ex); }
}
```

Debounce: cancel and replace a CTS on each keystroke, `await Task.Delay(300, token)`, then do the work; catch `OperationCanceledException` from your own cancellation and ignore it.

Polling: loop in `OnInitializedAsync` with `await Task.Delay(interval, token)` and a CTS cancelled on disposal.

## Disposal

Implement `IAsyncDisposable` when the component owns event subscriptions, timers, a `CancellationTokenSource`, or JS references (`IJSObjectReference`, `DotNetObjectReference<T>`). Otherwise skip it.

```razor
@implements IAsyncDisposable
@inject NavigationManager Navigation

@code {
    private readonly CancellationTokenSource cts = new();

    protected override void OnInitialized() => Navigation.LocationChanged += OnLocationChanged;

    private void OnLocationChanged(object? sender, LocationChangedEventArgs e) { }

    public async ValueTask DisposeAsync()
    {
        Navigation.LocationChanged -= OnLocationChanged;
        await cts.CancelAsync();
        cts.Dispose();
    }
}
```

- Unsubscribe with the same delegate instance you subscribed (store lambdas in a field).
- Null-check fields created in lifecycle methods; disposal may run before `OnInitializedAsync` completes.
- Don't call `StateHasChanged` in `DisposeAsync`.
- Catch `JSDisconnectedException` when disposing JS references on Server ([js-interop.md](js-interop.md)).
- If a `System.Timers.Timer` is unavoidable, its `Elapsed` handler follows the `async void` + `InvokeAsync` + `DispatchExceptionAsync` pattern above, and `DisposeAsync` disposes the timer.
