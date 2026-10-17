# Web API examples

Contents: DTOs, minimal API resource class, controller equivalent, JSON options, exception handler, service layer, `.http` file, checklist.

## DTOs

```csharp
/// <summary>A product returned by the API.</summary>
public sealed record ProductResponse(
    int Id,
    string Name,
    decimal Price,
    Category Category,
    bool IsAvailable,
    DateTimeOffset CreatedAt);

/// <summary>Payload for creating a product.</summary>
public sealed record CreateProductRequest
{
    [Required, MaxLength(200)]
    public required string Name { get; init; }

    [Range(0.01, 999999.99)]
    public required decimal Price { get; init; }

    public required Category Category { get; init; }
}
```

Mutable `{ get; set; }` DTO classes invite accidental changes after binding; keep requests `init`-only. Data annotations on positional record parameters are honored by minimal API validation on .NET 10.

## Minimal API resource class

```csharp
// Program.cs
builder.Services.AddValidation();                 // .NET 10+
builder.Services.AddOpenApi();
builder.Services.AddProblemDetails();
builder.Services.AddScoped<IProductService, ProductService>();
builder.Services.ConfigureHttpJsonOptions(o =>
    o.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));

var app = builder.Build();
app.UseExceptionHandler();
app.UseStatusCodePages();
if (app.Environment.IsDevelopment()) app.MapOpenApi();
app.MapProducts();
app.Run();
```

```csharp
// Endpoints/ProductEndpoints.cs
public static class ProductEndpoints
{
    public static IEndpointRouteBuilder MapProducts(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/products").WithTags("Products");

        group.MapGet("/", GetAll)
            .WithName("ListProducts")
            .WithSummary("List products");

        group.MapGet("/{id:int}", GetById)
            .WithName("GetProductById")
            .WithSummary("Get a product by ID")
            .ProducesProblem(StatusCodes.Status404NotFound);

        group.MapPost("/", Create)
            .WithName("CreateProduct")
            .ProducesValidationProblem();

        group.MapDelete("/{id:int}", Delete)
            .WithName("DeleteProduct");

        return app;
    }

    /// <summary>Lists all products.</summary>
    static async Task<Ok<IReadOnlyList<ProductResponse>>> GetAll(IProductService svc, CancellationToken ct) =>
        TypedResults.Ok(await svc.GetAllAsync(ct));

    /// <summary>Returns one product, or 404.</summary>
    static async Task<Results<Ok<ProductResponse>, NotFound>> GetById(int id, IProductService svc, CancellationToken ct) =>
        await svc.GetByIdAsync(id, ct) is { } p ? TypedResults.Ok(p) : TypedResults.NotFound();

    /// <summary>Creates a product.</summary>
    static async Task<Created<ProductResponse>> Create(CreateProductRequest req, IProductService svc, CancellationToken ct)
    {
        var p = await svc.CreateAsync(req, ct);
        return TypedResults.Created($"/api/products/{p.Id}", p);
    }

    /// <summary>Deletes a product.</summary>
    static async Task<Results<NoContent, NotFound>> Delete(int id, IProductService svc, CancellationToken ct) =>
        await svc.DeleteAsync(id, ct) ? TypedResults.NoContent() : TypedResults.NotFound();
}
```

Named methods (instead of lambdas) let XML comments reach the OpenAPI document. With `TypedResults` and declared `Results<...>` the response metadata is inferred, so `.Produces<T>()` is only needed for cases the signature can't express. With 7+ outcomes, falling back to `IResult` and `Results.*` is acceptable at the cost of inferred metadata.

## Controller equivalent

```csharp
[ApiController]
[Route("api/products")]
public sealed class ProductsController(IProductService svc) : ControllerBase
{
    [HttpGet("{id:int}")]
    [ProducesResponseType<ProductResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ProductResponse>> GetById(int id, CancellationToken ct) =>
        await svc.GetByIdAsync(id, ct) is { } p ? Ok(p) : NotFound();

    [HttpPost]
    public async Task<ActionResult<ProductResponse>> Create(CreateProductRequest req, CancellationToken ct)
    {
        var p = await svc.CreateAsync(req, ct);
        return CreatedAtAction(nameof(GetById), new { id = p.Id }, p);
    }
}
```

```csharp
builder.Services.AddControllers()
    .AddJsonOptions(o => o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));
app.MapControllers();
```

## Stricter JSON (new APIs or on request only)

```csharp
builder.Services.ConfigureHttpJsonOptions(o =>
{
    o.SerializerOptions.NumberHandling = JsonNumberHandling.Strict;     // no numbers from strings
    o.SerializerOptions.PropertyNameCaseInsensitive = false;
    o.SerializerOptions.AllowDuplicateProperties = false;               // .NET 10+
    o.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
});
```

`NumberHandling = Strict` also keeps integers typed as `integer` in the OpenAPI 3.1 document (the web default, `AllowReadingFromString`, turns them into string-or-number with a pattern).

## Exception handler

```csharp
internal sealed class ApiExceptionHandler(ILogger<ApiExceptionHandler> logger, IProblemDetailsService problems)
    : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext ctx, Exception ex, CancellationToken ct)
    {
        var (status, title) = ex switch
        {
            NotFoundException => (StatusCodes.Status404NotFound, "Not Found"),
            ConflictException => (StatusCodes.Status409Conflict, "Conflict"),
            _ => (0, null as string),
        };
        if (status == 0) return false;          // let the default handler produce a 500

        logger.LogWarning(ex, "Handled API exception {Title}", title);
        ctx.Response.StatusCode = status;
        return await problems.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = ctx,
            Exception = ex,
            ProblemDetails = { Status = status, Title = title },   // no ex.Message: it can leak internals
        });
    }
}
```

Map your own domain exception types rather than broad framework ones (`ArgumentException`, `InvalidOperationException`), which also fire for genuine bugs that should stay 500s.

## Service layer

```csharp
public interface IProductService
{
    Task<IReadOnlyList<ProductResponse>> GetAllAsync(CancellationToken ct);
    Task<ProductResponse?> GetByIdAsync(int id, CancellationToken ct);
    Task<ProductResponse> CreateAsync(CreateProductRequest request, CancellationToken ct);
    Task<bool> DeleteAsync(int id, CancellationToken ct);
}

public sealed class ProductService(AppDbContext db, TimeProvider time) : IProductService
{
    public async Task<ProductResponse?> GetByIdAsync(int id, CancellationToken ct) =>
        await db.Products.AsNoTracking()
            .Where(p => p.Id == id)
            .Select(p => new ProductResponse(p.Id, p.Name, p.Price, p.Category, p.IsAvailable, p.CreatedAt))
            .FirstOrDefaultAsync(ct);
    // ...
}
```

Query shape and tracking decisions belong to `ef-core`.

## `.http` file

```http
@baseUrl = https://localhost:7043

### Create a category (parent first)
# @name createCategory
POST {{baseUrl}}/api/categories
Content-Type: application/json

{ "name": "Peripherals" }

### Create a product in that category
POST {{baseUrl}}/api/products
Content-Type: application/json

{ "name": "Wireless Mouse", "price": 29.99, "categoryId": {{createCategory.response.body.$.id}} }

### Missing product returns 404
GET {{baseUrl}}/api/products/999999
```

Response-variable capture (`# @name` plus `{{name.response.body.$.id}}`) works in Visual Studio and the VS Code REST Client; if the team's client lacks it, comment which IDs to copy.

## Checklist

- [ ] Style matches the project (controllers or minimal APIs)
- [ ] Separate `sealed record` DTOs; no entities in bodies; `DateTimeOffset` for times
- [ ] Validation wired for the TFM (`[ApiController]`, or `AddValidation()` on .NET 10)
- [ ] Correct status codes; POST returns 201 with `Location`
- [ ] `CancellationToken` accepted and forwarded everywhere
- [ ] OpenAPI document lists the new operations with names and summaries; no new Swashbuckle on .NET 9+; no `.WithOpenApi()` on .NET 10
- [ ] Enums as strings unless told otherwise
- [ ] Errors are ProblemDetails via `UseExceptionHandler`; no exception messages leaked
- [ ] `.http` requests cover every new endpoint
- [ ] `dotnet build` clean
