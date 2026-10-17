# Loading and sending data

## Where data comes from

| Mode | Data access |
|---|---|
| Static SSR | Inject services directly; `@attribute [StreamRendering]` so the page shows a loading state while `OnInitializedAsync` runs |
| Interactive Server | Inject services directly. For EF Core inject `IDbContextFactory<AppDbContext>` and `await using var db = await factory.CreateDbContextAsync(ct)` per operation (a scoped context lives for the whole circuit) |
| WebAssembly | `HttpClient` to your API only |
| Auto | Through an abstraction with a server and a client implementation (below) |

Don't call your own server through `HttpClient` from server-rendered components; inject the service.

## HttpClient

```csharp
builder.Services.AddHttpClient<CatalogClient>(c => c.BaseAddress = new Uri("https://api.example.com/"));
```

Typed clients for external APIs; in WebAssembly the template registers an `HttpClient` with the host's base address. For WebAssembly or Auto with prerendering, register clients in both `Program.cs` files.

## Load

```razor
@if (products is null) { <p>Loading…</p> }
else if (products.Length == 0) { <p>No products.</p> }
else { @foreach (var p in products) { <ProductRow @key="p.Id" Product="p" /> } }

@code {
    private Product[]? products;
    protected override async Task OnInitializedAsync() => products = await Catalog.GetProductsAsync();
}
```

- Load in `OnInitializedAsync`, never in the constructor.
- With prerendering, persist the result so it isn't fetched twice: `[PersistentState] public Product[]? Products { get; set; }` and `Products ??= await ...` (.NET 10; the property must be public) ([prerendering.md](prerendering.md)).

## Errors

- Default: let exceptions reach an `<ErrorBoundary>` around the content in the layout or parent, with an `<ErrorContent>` message. No per-component catch needed.
- `ComponentBase` swallows `OperationCanceledException`, including HttpClient timeouts, so a timed-out load can leave the component stuck in "Loading". Catch only what you handle:

```csharp
catch (OperationCanceledException ex) when (!token.IsCancellationRequested)
{
    Logger.LogWarning(ex, "Timed out loading category {CategoryId}", CategoryId);
    error = "The request timed out. Please try again.";
}
```

- Never show `exception.Message` to users (it can leak internals); log through `ILogger` and show a fixed message.
- Every service method takes and forwards a `CancellationToken`.

## Reload when a parameter changes

```csharp
[Parameter] public int CategoryId { get; set; }
private int? loadedCategoryId;
private CancellationTokenSource? cts;

protected override async Task OnParametersSetAsync()
{
    if (CategoryId == loadedCategoryId) return;   // only UI parameters changed
    loadedCategoryId = CategoryId;
    await LoadAsync();
}

private async Task LoadAsync()
{
    if (cts is not null) { await cts.CancelAsync(); cts.Dispose(); }
    cts = new CancellationTokenSource();
    var token = cts.Token;                         // capture before awaiting
    error = null;
    isLoading = true;
    try { products = await Products.GetByCategoryAsync(CategoryId, token); }
    catch (OperationCanceledException ex) when (!token.IsCancellationRequested)
    {
        Logger.LogWarning(ex, "Timed out loading {CategoryId}", CategoryId);
        error = "The request timed out. Please try again.";
    }
    finally { isLoading = false; }
}
```

Keep showing the previous data with a "Refreshing…" hint instead of nulling it, and cancel the CTS in `DisposeAsync`. Use `OnParametersSetAsync` only when data depends on a changing parameter.

## Send

```csharp
var response = await http.PostAsJsonAsync("api/products", newProduct, ct);
response.EnsureSuccessStatusCode();
```

Same for `PutAsJsonAsync` and `DeleteAsync`. Disable the submit button while saving.

## Service abstraction for Auto or prerendered WebAssembly

```csharp
public abstract class ProductServiceBase                       // shared / .Client
{
    public abstract Task<Product[]> GetAllAsync(CancellationToken ct = default);
}

public sealed class ServerProductService(IDbContextFactory<AppDbContext> dbFactory) : ProductServiceBase
{
    public override async Task<Product[]> GetAllAsync(CancellationToken ct = default)
    {
        await using var db = await dbFactory.CreateDbContextAsync(ct);
        return await db.Products.AsNoTracking().ToArrayAsync(ct);
    }
}

public sealed class ClientProductService(HttpClient http) : ProductServiceBase
{
    public override async Task<Product[]> GetAllAsync(CancellationToken ct = default) =>
        await http.GetFromJsonAsync<Product[]>("api/products", ct) ?? [];
}
```

Register the server implementation in the server `Program.cs`, the client one in `.Client/Program.cs`, expose `api/products` as a minimal API endpoint with the same authorization policy as the page, and inject the base type in components. An interface works as well as an abstract class.
