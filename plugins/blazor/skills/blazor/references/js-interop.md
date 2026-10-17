# JavaScript interop

First check whether CSS (custom properties, `data-*` attributes, pseudo-classes) or a built-in component already does the job; every interop call on Server is a network round trip.

## Collocated modules

Put JS in a `.razor.js` file next to the component and `export` functions; no `window.*` globals or `<script>` tags.

```javascript
// Components/Pages/ChartPanel.razor.js
export function initialize(canvas, dotNetRef) { /* ... */ }
export function updateData(points) { /* ... */ }
export function dispose() { /* ... */ }
```

Import path: `"./Components/Pages/ChartPanel.razor.js"` (path from the project root) in the app, `"./_content/{AssemblyName}/{path}.razor.js"` from a Razor class library.

## Timing

All interop happens in `OnAfterRenderAsync` or event handlers, never in `OnInitialized*`, `OnParametersSet*` or constructors (no JS during prerender). For parameter-driven updates, set a flag in `OnParametersSet` and apply it in `OnAfterRenderAsync`:

```csharp
protected override void OnParametersSet() => dataChanged = true;

protected override async Task OnAfterRenderAsync(bool firstRender)
{
    if (firstRender)
    {
        chart = new ChartInterop(JS);
        await chart.InitializeAsync(canvasRef);
    }
    else if (dataChanged && chart is not null)
    {
        dataChanged = false;
        await chart.UpdateDataAsync(DataPoints);
    }
}
```

## Typed wrapper per feature

```csharp
public sealed class ChartInterop(IJSRuntime js) : IAsyncDisposable
{
    internal const string ModulePath = "./Components/Pages/ChartPanel.razor.js";
    private IJSObjectReference? module;

    private async ValueTask<IJSObjectReference> GetModuleAsync() =>
        module ??= await js.InvokeAsync<IJSObjectReference>("import", ModulePath);

    public async ValueTask InitializeAsync(ElementReference canvas) =>
        await (await GetModuleAsync()).InvokeVoidAsync("initialize", canvas);

    public async ValueTask UpdateDataAsync(IReadOnlyList<DataPoint> points) =>
        await (await GetModuleAsync()).InvokeVoidAsync("updateData", points);

    public async ValueTask DisposeAsync()
    {
        try
        {
            if (module is not null)
            {
                await module.InvokeVoidAsync("dispose");
                await module.DisposeAsync();
            }
        }
        catch (JSDisconnectedException) { }   // Server circuit already gone
    }
}
```

- Keep module paths and function names as constants in the wrapper, not string literals across components.
- A concrete class is enough; tests substitute `IJSRuntime`, which is already an interface.
- `InvokeVoidAsync` when nothing is returned, not `InvokeAsync<object>`.
- Pass elements as `ElementReference` (`@ref="canvasRef"`), not string IDs.

## Batch calls

If two calls always happen together, in either direction, make them one function: `applyPreferences(theme, locale)` instead of two calls; one `invokeMethodAsync('OnPlayerStateChanged', { volume, isPlaying })` instead of two callbacks. Keep chains that don't need .NET (create a token, store it) entirely in JS.

## JS calling .NET

```csharp
dotNetRef = DotNetObjectReference.Create(this);
await module.InvokeVoidAsync("initialize", dotNetRef);

[JSInvokable]
public async Task OnClipboardChanged(string text) =>
    await InvokeAsync(() => { lastClipboard = text; StateHasChanged(); });
```

```javascript
const ON_CLIPBOARD_CHANGED = 'OnClipboardChanged';
let controller;

export function initialize(dotNetRef) {
  controller = new AbortController();
  document.addEventListener('copy', async () => {
    try {
      const text = await navigator.clipboard.readText();
      await dotNetRef.invokeMethodAsync(ON_CLIPBOARD_CHANGED, text);
    } catch { /* circuit lost or permission denied */ }
  }, { signal: controller.signal });
}

export function dispose() { controller?.abort(); }
```

- `[JSInvokable]` methods must be `public`; a non-public one fails at runtime.
- Name .NET methods with `const` strings in JS; a typo fails silently.
- Wrap every `invokeMethodAsync` in `try/catch`: circuit loss throws.
- Remove listeners on dispose (an `AbortController` makes this one call).
- Dispose the `DotNetObjectReference` in the component's `DisposeAsync`, after the JS cleanup call.

## Disposal

```csharp
public async ValueTask DisposeAsync()
{
    if (chart is not null) await chart.DisposeAsync();
    dotNetRef?.Dispose();
}
```

Always `IAsyncDisposable` for interop cleanup; sync `IDisposable` can't await the JS call. On Server, catch `JSDisconnectedException` around JS calls made during disposal.

## Security

On Server, JS runs in the user's browser and `[JSInvokable]` methods are callable by any script on the page: validate arguments as untrusted input, and never pass secrets to JS.
